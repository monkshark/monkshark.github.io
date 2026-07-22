---
title: "#16 - KLS 콜드 스타트 145s -> 40s, 헛발 짚은 첫 수정과 진짜 병목"
description: "primary 언어인 Kotlin 의 LSP 가 콜드 스타트에 145초를 먹었다. 뻔해 보인 첫 수정이 거의 헛발이었고, 진짜 병목은 다른 자리에 있었다는 회고"
date: 2026-06-30T10:00:00+09:00
slug: page-ide-kls-cold-start-145s-to-40s
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "LSP", "kotlin-language-server", "Gradle", "perf", "startup"]
---

PAGE 의 primary 언어는 Kotlin 이다. PAGE 자체가 Kotlin + Compose Desktop 으로 짜여 있으니, PAGE 로 PAGE 를 여는 건 가장 자주 도는 경로다. 그런데 그 경로가 제일 느렸다. PAGE 워크스페이스를 열고 Kotlin 파일에서 자동완성이나 진단이 처음 살아나기까지 콜드 스타트로 145초가 걸렸다.

145초는 "좀 느리다" 가 아니다. 파일을 열고 두 마디 반을 기다려야 빨간 줄 하나가 뜨는 IDE 는 자기 코드를 자기로 못 여는 IDE 다. [#10 에서 깔아 둔 측정기](https://monkshark.github.io/p/page-ide-perf-tracing-first/)가 가리킨 가장 비싼 한 자리가 바로 여기였다.

이 글은 그 145초를 40초로 줄인 회고다. 그런데 줄인 과정 자체보다 가장 뻔해 보였던 첫 수정이 거의 아무것도 못 줄였다는 게 더 기억에 남는다.

## 측정이 가리킨 자리

먼저 145초가 어디서 나오는지부터. LSP 클라이언트에 짧은 계측을 박아 두 숫자를 잡았다 `spawn` (프로세스 띄우는 데까지) 과 `initialize` (LSP `initialize` 핸드셰이크가 돌아오기까지).

```
[lsp] READY  capabilities=true (spawn=468ms initialize=145135ms)
```

`spawn` 은 468ms. JVM 을 띄우고 서버 프로세스가 사는 데까지는 빨랐다. 145초의 거의 전부가 `initialize` 안에 있었다. KLS (kotlin-language-server) 는 `initialize` 를 받으면 워크스페이스의 classpath 를 해석한다 어떤 jar 들이 컴파일 클래스패스에 들어가는지, 소스 jar 는 뭔지. 컴파일러를 세우려면 그게 먼저 있어야 하니까. 145초는 그 classpath 해석 시간이었다.

그래서 classpath 해석 코드를 읽기 시작했다.

## 첫 가설 같은 걸 두 번 푼다

`CompilerClassPath.refresh()` 가 눈에 걸렸다. 한 resolver 에서 classpath 를 두 번 가져온다.

```kotlin
val newClassPath = resolver.classpathOrEmpty
// ...
async.compute {
    val newClassPathWithSources = resolver.classpathWithSources
    // ...
}
```

하나는 `classpath`, 하나는 `classpathWithSources` 이름은 다르다. 소스 jar 까지 붙은 버전을 따로 가져오는 모양새다. 그런데 `GradleClassPathResolver` 를 보면 `classpathWithSources` 가 기본 구현 그대로다 `classpath` 를 그대로 돌려준다. Gradle 경로에서는 두 호출이 완전히 같은 일을 한다. 같은 Gradle 해석을 두 번 돌리고, 두 번째는 소스 jar 를 하나도 못 붙인다 (`sourceJar` 는 항상 null).

수정은 작게 잡았다. resolver 에 `providesSources: Boolean` 한 줄을 두고, 소스를 실제로 주는 resolver (`MavenClassPathResolver`) 만 true. 그 게이트가 false 면 두 번째 `classpathWithSources` 호출 자체를 건너뛴다.

```kotlin
if (resolver.providesSources) {
    async.compute {
        val newClassPathWithSources = resolver.classpathWithSources
        // ...
    }
}
```

Union / FirstNonEmpty 같은 합성 resolver 는 자식들의 `providesSources` 를 OR 로 전파. 깔끔했다. 중복 해석 한 번이 통째로 사라지니 145초가 절반 가까이 빠질 거라고 그렇게 믿었다.

## 헛발

빌드해서 다시 쟀다.

```
[lsp] READY  capabilities=true (spawn=...  initialize=135081ms)
```

145초가 135초가 됐다. 10초. 거의 안 움직였다.

당황한 채로 로그를 다시 봤다. 중복 해석은 확실히 사라졌다 두 번째 "class path with sources" 동기화가 0번 돌고, "Reinstantiating compiler" 가 2번에서 1번으로 줄었다. 코드가 의도한 대로 한 패스를 통째로 지웠는데도 `initialize` 숫자는 거의 그대로였다.

이유는 그 두 번째 패스가 `async.compute {}` 안에 있었다는 데 있다. 그건 fire-and-forget 이다 `initialize` 응답을 막지 않고 백그라운드에서 따로 돈다. 그러니 그걸 지워도 `initialize` 가 돌아오는 시점은 거의 안 변한다. 그 패스가 줄여 준 건 콜드 스타트가 아니라 그 직후였다 파일을 처음 만지며 타이핑하는 동안 백그라운드에서 한 번 더 돌던 Gradle 해석과, 그게 일으키던 두 번째 컴파일러 재생성. 체감되는 자리이긴 했다. 다만 내가 줄이려던 자리는 아니었다.

정직하게 적으면 첫 수정은 옳은 수정이었지만 내가 노린 병목을 친 수정은 아니었다. 145초는 여전히 거의 그대로 거기 있었다. 측정기가 없었다면 나는 여기서 "중복을 지웠으니 빨라졌겠지" 하고 손을 털었을 것이다. 10초라는 숫자가 한 줄 찍힌 덕에 그러지 못했다.

## 진짜 병목

`initialize` 안에서 실제로 시간을 먹는 자리를 찾으려고 KLS 의 Gradle 해석 로그를 한 줄씩 따라갔다. 그제서야 보였다.

```
Resolving dependencies for 'app' through Gradle's CLI using tasks [kotlinLSPProjectDeps]...
Resolving dependencies for 'lsp' through Gradle's CLI using tasks [kotlinLSPProjectDeps]...
Resolving dependencies for 'runtime' through Gradle's CLI using tasks [kotlinLSPProjectDeps]...
...
```

같은 줄이 모듈 수만큼 반복됐다. PAGE 는 멀티모듈 Gradle 빌드다 그때 15개 안팎의 서브모듈. KLS 는 워크스페이스를 걸어 `build.gradle.kts` 를 만날 때마다 그 디렉터리에 resolver 를 하나씩 깐다. 그리고 각 resolver 가 자기 디렉터리에서 `gradlew kotlinLSPProjectDeps` 를 한 번, `.kts` 면 `kotlinLSPKotlinDSLDeps` 를 또 한 번 Gradle CLI 를 따로따로 띄운다. 15개 모듈이면 30번 가까운 Gradle CLI 호출이고, 그게 순차로 돈다. 한 호출이 Gradle 데몬을 깨우고 설정 단계를 도는 데 몇 초씩. 곱하면 두 마디 반이다.

이게 145초의 진짜 모양이었다. 같은 걸 두 번 푸는 게 문제가 아니라, 한 번 풀 걸 모듈 수만큼 쪼개서 순차로 푸는 게 문제였다.

## allprojects 한 줄

KLS 가 Gradle 에 주입하는 init script 를 열어 봤다. classpath 를 뽑는 task 를 등록하는 자리.

```groovy
allprojects {
    task kotlinLSPProjectDeps { ... }
}
```

`allprojects`. task 가 루트 한 프로젝트가 아니라 모든 프로젝트에 등록된다. 그 말은 루트에서 `kotlinLSPProjectDeps` 를 한 번 띄우면 그 한 Gradle 세션 안에서 모든 서브프로젝트의 classpath 가 다 풀린다는 뜻이다. 모듈마다 따로 띄울 이유가 애초에 없었다. KLS 가 build file 마다 resolver 를 하나씩 까는 일반 로직이, 하필 단일 루트 빌드에서는 같은 일을 N번 시키고 있었던 것이다.

수정의 모양은 이렇다. 워크스페이스를 걸을 때, 그게 하나의 루트 빌드인지를 먼저 본다. 맞으면 build file 마다 resolver 를 까는 대신 루트 build file 하나에 resolver 하나만 깐다. 그 하나가 루트에서 Gradle 을 한 번 띄우고, init script 의 `allprojects` 가 나머지를 다 데려온다.

```kotlin
private fun rootGradleResolver(root: Path, paths: List<Path>): ClassPathResolver? {
    val rootBuildFile = paths.firstOrNull { it.parent == root && isGradleBuildFile(it) } ?: return null
    val settingsFiles = paths.filter { isGradleSettingsFile(it) }
    val rootHasSettings = settingsFiles.any { it.parent == root }
    val nestedSettings = settingsFiles.any { it.parent != root }
    if (!rootHasSettings || nestedSettings) return null

    return GradleClassPathResolver(
        rootBuildFile,
        includeKotlinDSL = rootBuildFile.toString().endsWith(".kts"),
        versionFiles = paths.filter { isGradleBuildFile(it) },
    )
}
```

## 보수적으로 틀린 자리에서는 켜지 않는다

이 collapse 는 모든 워크스페이스에서 옳지 않다. 단일 루트 빌드 (루트에 `settings.gradle(.kts)` 가 있고 서브디렉터리에 또 다른 settings 가 없는) 에서만 `allprojects` 가 전 모듈을 보장한다. 한 워크스페이스 안에 settings 를 각자 가진 독립 빌드가 둘 있으면, 루트 한 번으로는 다른 빌드의 모듈을 못 데려온다. 그 자리에서 collapse 하면 classpath 가 통째로 비고, 그 모듈들은 자동완성도 진단도 죽는다 빠르지만 틀린 IDE.

그래서 게이트를 좁게 잡았다. 루트에 settings 가 있고 중첩된 settings 가 없을 때만 루트 resolver 를 깐다. 둘 중 하나라도 어긋나면 옛 동작 그대로 build file 마다 resolver 를 깔아 per-module 로 푼다. 없는 것보다 느린 게, 틀린 것보다 낫다.

캐시 무효화도 같이 옮겼다. resolver 는 build file 의 수정 시각으로 캐시가 stale 한지를 본다. 루트 resolver 하나가 전 모듈을 대표하니, 그 하나가 모든 모듈의 build file 중 가장 최근 수정 시각을 봐야 한다. 서브모듈 `build.gradle.kts` 하나만 고쳐도 캐시가 갱신되도록 `versionFiles` 에 전 build file 을 담아 그 max 를 본다.

## 측정

빌드해서 다시 쟀다.

```
=== READY after ~40s wall ===
[lsp] READY  capabilities=true (spawn=468ms initialize=40300ms)
resolving-calls: 2
```

135초가 40초가 됐다. Gradle CLI 호출은 30번 가까이에서 2번으로 루트 `kotlinLSPProjectDeps` 한 번, 루트 buildscript `kotlinLSPKotlinDSLDeps` 한 번. 그리고 가장 중요한 한 줄: 그 한 번의 루트 해석이 "Adding 104 files to class path" 를 찍었다. 모듈별로 30번 돌려 합치던 것과 정확히 같은 104개 jar 다. 호출 수만 줄었고 classpath 는 한 jar 도 안 잃었다. "Reinstantiating compiler" 는 한 번, Gradle 실패 한 줄 없음.

145초 → 40초. 자기 코드를 두 마디 반 기다려 열던 IDE 가 이제 그 자리를 절반 마디 안쪽으로 당겼다.

## 돌아보면

가장 오래 남는 건 첫 수정이 헛발이었다는 사실이다. "같은 걸 두 번 푸니 한 번만 풀면 절반" 은 너무 그럴듯해서, 측정기가 없었다면 의심 없이 믿고 끝냈을 가설이었다. 코드는 의도대로 정확히 동작했고 중복 패스는 진짜로 사라졌다 그런데도 내가 노린 숫자는 거의 안 움직였다. 그 패스가 애초에 콜드 스타트를 막는 자리에 있지 않았기 때문이다. 옳은 수정과 효과 있는 수정은 다른 것이고, 그 둘을 가르는 건 직관이 아니라 한 줄짜리 실측이었다.

두 번째는 진짜 병목의 모양이었다. 그건 "느린 한 번" 이 아니라 "괜찮은 한 번을 N번 쪼갠 것" 이었다. 각 Gradle 호출은 몇 초짜리라 따로 보면 누구도 비싸 보이지 않는다. 비싼 건 그 곱셈이었고, 곱셈은 한 호출만 들여다봐서는 안 보인다 같은 로그 줄이 모듈 수만큼 반복되는 패턴을 봐야 보인다. 한 자리(루트)의 한 번이 N자리의 N번을 통째로 먹을 수 있었던 건, 도구(`allprojects`)가 이미 전체를 볼 줄 알았는데 우리가 그걸 모듈마다 따로 부르고 있었기 때문이다.

그리고 첫 수정을 버리진 않았다. 콜드 스타트는 못 줄였어도, 그게 지운 백그라운드 패스는 파일을 처음 만지는 동안의 두 번째 컴파일러 재생성을 없앴다 타이핑이 끊기던 자리 하나를 같이 폈다. 둘을 한 릴리스로 묶은 이유다. 헛발이라 부른 수정도 다른 자리에서는 제 몫을 했다.

마지막으로 145초가 145초인 줄 알았던 건 측정기 덕이었고, 그게 40초가 된 줄 아는 것도 같은 측정기 덕이다. [#10 에서 "다음 한 발의 방향은 측정이 정한다" 고 적었는데](https://monkshark.github.io/p/page-ide-perf-tracing-first/), 이번엔 방향만이 아니라 헛발까지 측정이 잡아 줬다. 측정 없는 최적화는 빨라진 기분만 남기고, 그 기분이 제일 비싸다.
