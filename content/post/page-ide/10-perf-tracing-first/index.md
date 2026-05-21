---
title: "#10 - 다음 작업이 둘일 때, startup 측정기부터 깐 이유"
description: "본체 IDE 의 남은 기능과 code intelligence 재설계가 동시에 다음 차례라고 부를 때, 둘 사이의 공통 기반인 startup 측정 인프라부터 깐 결정의 회고"
date: 2026-05-21T10:00:00+09:00
slug: page-ide-perf-tracing-first
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "Compose Desktop", "perf", "startup", "instrumentation"]
---

파일 트리, 탭, 분할, 검색, find references, rename, run/stop, 터미널, 다중 선택, 클립보드, drag and drop — 하나씩 잡아 가다 보니 빠진 자리가 손에 꼽혔다. 그리고 옆 책상에는 한 번 갈아엎힐 작업이 줄을 서 있었다. code intelligence 를 tree-sitter + LSP + SCIP 의 세 층으로 다시 짜는 계획. 두 작업이 동시에 "다음" 이라고 부르고 있었다.

## 두 작업이 충돌하는 지점

PAGE 의 LSP 통합은 지금 KLS (Kotlin Language Server) 만을 보고 짜여 있다. spawn 도, lifecycle 도, 메시지 라우팅도 한 서버를 가정한다. 자바도, 파이썬도, 다른 무엇도 같은 통로로 들어오려면 그 통로 자체가 추상화돼야 한다. code intelligence 를 다시 짜는 작업의 첫 자리가 그 자리다 — LanguageBackend 라는 한 층을 깔고, 지금의 KLS 라우팅을 그 한 층 밑으로 옮기는 일.

문제는 이 작업이 본체 IDE 의 LSP 관련 자리를 한 번 다시 만진다는 점이다. find references 의 클라이언트 우회 로직, rename 의 KLS 호출, diagnostics 의 수집 — 다 LanguageBackend 가 깔리면 모서리가 한 번씩 옮겨 앉는다. 그러니 본체 작업이 그 자리들에 새 기능을 더 깔아 두면, 다음 작업이 도착했을 때 그 새 기능들도 같이 옮겨 앉아야 한다. 두 작업을 동시에 굴리면 매 PR 마다 한 번씩 충돌하고, 한 작업을 먼저 다 끝내면 다른 작업의 도착 시점에 재작업이 생긴다.

## 선택지 셋

쓸 수 있는 길은 셋이었다.

첫째, 본체 IDE 의 남은 기능을 마저 깔고 그 다음 code intelligence 를 다시 짠다. 손에 잡히는 결과까지의 거리가 가장 짧다. 단, 다시 짤 때 옮겨 앉을 자리가 가장 많다.

둘째, 둘을 인터리브한다. PR 단위로 번갈아 가며 진행. context switch 비용이 매 전환마다 든다. PAGE 처럼 한 사람이 짜는 코드베이스에서는 그 비용이 다른 비용보다 훨씬 무겁다.

셋째, 둘 다 끄기 전에 그 둘이 같이 기댈 공통 기반부터 깐다. LanguageBackend 추상화 한 층, 그리고 두 작업 모두 자기 작업의 효과를 grade 할 수 있는 측정 인프라 한 층.

셋째 길을 골랐다. 이유는 한 줄로 적으면 — 측정 없는 결정이 측정 있는 결정보다 비쌌다.

## 왜 측정이 다음 작업들의 공통 기반인가

code intelligence 다시 짜기의 끝자리에 도착했을 때, 그게 잘 짜였는지 어떻게 판단할까. 자바 파일이 열리는 데 걸리는 시간, find references 가 응답하는 시간, 첫 진단 (diagnostics) 이 떠오르는 시간 — 다 시간이다. 그 시간이 지금 어떻게 생겼는지를 모르고 새 작업으로 갈아엎으면 새 작업이 빠른지 느린지조차 모른다.

그리고 본체 IDE 가 "쓸 만하다" 라고 불리는 자리도 결국 시간이다. 콜드 스타트가 5초인 IDE 는 기능이 다 들어 있어도 쓸 만하다고 부르기 어렵다. 1초 미만이면 부를 만하다 — 어떤 자리가 그 둘 사이의 어디인지는 측정해야 안다.

같은 자 가 두 작업 모두에 쓰인다는 점이 셋째 길의 가운데였다. 하나의 측정 인프라를 한 번 깔아 두면 둘 다 그걸 baseline 으로 쓴다. 그래서 측정 부터 깔기로 했다 — 둘 중 어느 작업을 다음 끄기로 결정하든.

## PerfTracer 의 모양

코드 자체는 짧다. ConcurrentHashMap 하나, CopyOnWriteArrayList 하나, begin/end 한 쌍, inline trace 블록 하나.

```kotlin
class PerfTracer internal constructor(
    val kind: StartupKind,
    val processStartMs: Long,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val open = ConcurrentHashMap<String, Long>()
    private val finished = CopyOnWriteArrayList<PerfMark>()

    fun begin(phase: String) { open[phase] = nowSinceStart() }
    fun end(phase: String) {
        val start = open.remove(phase) ?: return
        finished.add(PerfMark(phase, start, nowSinceStart()))
    }
    inline fun <T> trace(phase: String, block: () -> T): T {
        begin(phase)
        try { return block() } finally { end(phase) }
    }
}
```

`end` 가 begin 없을 때 no-op 인 점, throw 가 나도 trace 블록의 end 가 finally 로 호출되는 점, snapshot 이 startMs 순으로 정렬되는 점 — 단위 테스트가 그 가장자리들을 잡는다.

흥미로운 건 측정기 자체가 아니라 그걸 어디에 박을지였다. Compose Desktop 의 lifecycle 위에서 startup 의 세 phase 를 어떻게 자르느냐.

## Compose Desktop 의 함정 — 첫 번째 시도

처음 박은 모양은 이랬다. `main()` 에서 `COMPOSE_INIT` 를 begin, `application{}` 안의 LaunchedEffect 에서 그걸 end + `WINDOW_SHOWN` 을 begin, Window 안의 LaunchedEffect 에서 `WINDOW_SHOWN` 을 end + `FIRST_FRAME` 을 측정.

```kotlin
fun main() {
    val tracer = PerfRegistry.start(StartupKind.COLD)
    tracer.begin(StartupPhases.COMPOSE_INIT)
    application {
        LaunchedEffect(Unit) {
            tracer.end(StartupPhases.COMPOSE_INIT)
            tracer.begin(StartupPhases.WINDOW_SHOWN)
        }
        AppContent()
    }
}

// AppContent 안의 Window {
LaunchedEffect(Unit) {
    PerfRegistry.instance?.end(StartupPhases.WINDOW_SHOWN)
    PerfRegistry.instance?.begin(StartupPhases.FIRST_FRAME)
    withFrameNanos { }
    PerfRegistry.instance?.end(StartupPhases.FIRST_FRAME)
}
```

부모 컴포저블의 LaunchedEffect 가 자식의 LaunchedEffect 보다 먼저 fire 한다고 직관적으로 가정했다. 그래야 `WINDOW_SHOWN` 의 begin 이 자식의 end 보다 먼저 일어난다. 첫 실행 결과:

```
[perf:cold] total 991ms
  startup.compose_init       3ms ->    985ms  (delta   982ms)
  startup.first_frame      878ms ->    991ms  (delta   113ms)
  (pending: startup.window_shown)
```

`window_shown` 이 pending. 다시 말해 begin 이 호출되기 전에 end 가 호출됐다는 뜻이고, 그건 자식 Window 의 LaunchedEffect 가 부모 application 의 LaunchedEffect 보다 먼저 fire 했다는 뜻이다. 시간 값을 보면 더 분명하다 — `first_frame` 이 878ms 에 시작해서 991ms 에 끝났고, `compose_init` 은 985ms 에 끝났다. 자식 effect 가 시간상 먼저 돌았다.

Compose Desktop 의 effect ordering 이 부모-자식의 트리 위치에 정해진다는 가정 자체가 틀렸다. application 컴포저블과 Window 컴포저블은 서로 다른 frame clock 위에 올라가 있고, 효과의 진입 순서는 그 둘의 스케줄링이 정한다. 그래서 자식이 부모보다 먼저 fire 할 수 있다 — 실측에서 그랬다.

## 두 번째 시도 — 부모-자식 가정 자체를 뺀 길

길은 둘이었다.

하나는 부모 effect 와 자식 effect 사이의 ordering 을 강제하는 길 — 어떤 신호를 만들어 두고 자식 effect 가 그 신호를 기다리게 하기. 깨끗하지만 측정을 위해 lifecycle 에 동기화 코드를 추가하는 셈이라 측정기보다 측정 인프라가 더 무거워진다.

다른 하나는 부모 effect 를 아예 빼고 자식 Window 의 LaunchedEffect 안에서 세 phase 를 모두 순차로 측정하는 길. `withFrameNanos` 를 두 번 부르면 `WINDOW_SHOWN` 과 `FIRST_FRAME` 의 경계 한 번, 그리고 `FIRST_FRAME` 의 종료 한 번이 잡힌다.

```kotlin
LaunchedEffect(Unit) {
    frameRef.value = window
    val perf = PerfRegistry.instance
    perf?.end(StartupPhases.COMPOSE_INIT)
    perf?.begin(StartupPhases.WINDOW_SHOWN)
    withFrameNanos { }
    perf?.end(StartupPhases.WINDOW_SHOWN)
    perf?.begin(StartupPhases.FIRST_FRAME)
    withFrameNanos { }
    perf?.end(StartupPhases.FIRST_FRAME)
    println(perf?.summary())
}
```

부모-자식 가정 자체가 빠지니 ordering 이 한 코루틴 안의 줄 순서로 결정된다. 두 작업 모두 자기 작업의 효과를 measure 하는 도구가 코드 한 줄 순서로 정확해진다.

다시 실행한 결과.

```
[perf:cold] total 1025ms
  startup.compose_init     1ms ->    887ms  (delta   886ms)
  startup.window_shown   887ms ->    994ms  (delta   107ms)
  startup.first_frame    994ms ->   1025ms  (delta    31ms)
```

세 phase 가 순차로 잡혔다. pending 없음. baseline 한 줄이 잡힌 자리다.

## 첫 baseline — 886ms 가 어디서 나왔는가

콜드 스타트 1025ms 중 886ms 가 `compose_init`. 이 phase 는 `main()` 호출부터 Window 의 첫 LaunchedEffect 진입까지 — 즉 JVM 부팅 + Compose Desktop 런타임 초기화 + AppContent() 컴포지션 + Window 컴포저블의 진입까지 다 포함한다. window_shown 107ms 와 first_frame 31ms 는 그 다음 두 frame 의 길이.

886ms 가 한 자리 phase 라는 게 첫 인상에 좀 많다. JVM 부팅이 그 중 얼마인지, Compose 런타임이 얼마인지, AppContent() 의 remember/mutableStateOf 가 얼마인지 — 그 안을 더 잘게 자르면 답이 나온다. 다음 작업들이 도착하기 전에 그 안을 한 번 더 갈라 둘지, 아니면 그대로 두고 두 작업의 입출력만 비교할지는 두 작업이 시작하는 모양을 보고 정할 자리다.

지금 이 자리의 결정은 — 더 잘게 자르지 않는다. baseline 한 줄이 잡혔고, 그게 두 작업의 grade 도구로 충분하다.

## 돌아보면

두 작업이 동시에 자기가 다음 이라고 부르는 자리에서 한 쪽을 고르지 않고 둘이 같이 기댈 자 부터 깐 결정이었다. 그 결정 자체보다 측정기를 박는 동안 Compose Desktop 의 effect ordering 가정이 한 번 깨진 게 더 기억에 남는다. 부모 컴포저블이 자식보다 먼저 fire 한다 는 직관이 한 줄짜리 실측 데이터 — `(pending: startup.window_shown)` — 앞에서 무너졌다. 측정기를 측정 가능한 자리에 박는 일 자체가 작은 회로 한 번을 풀어야 했다.

또 하나는 측정 인프라의 가치가 인프라 그 자체가 아니라 그 인프라가 잡는 첫 숫자에 있었다는 것. 886ms 라는 숫자가 한 줄 출력된 순간, 다음에 어디를 더 잡을지에 대한 우선순위가 한 번 흔들렸다. 측정 없으면 그 흔들림 자체가 없다 — 어디가 더 비싼지조차 모르니까. 다음 작업으로 가기 전에 측정부터 깔자 라는 결정은 측정의 결과 한 줄을 보고 나니 더 분명해졌다.

그리고 마지막으로 — 다음 한 발의 방향은 측정이 정한다. 두 작업 중 어느 쪽이 먼저든, 그 작업이 끝났을 때 자가 다시 같은 자리에 닿는다. 자가 자기 자리에 있는 한, 두 작업이 도착하는 순서는 부수적인 결정이 된다.
