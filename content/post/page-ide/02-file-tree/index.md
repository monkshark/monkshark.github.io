---
title: "#2 - 파일 트리, 그리고 두 번의 미끄럼"
description: "Path 가 Iterable 인 줄 모르고 짠 토글, 그리고 UTF-8 디코더 한 번에 죽는 EDT"
date: 2026-05-04T10:00:00+09:00
slug: page-ide-file-tree
image:
categories:
    - PAGE 개발기
tags:
    - PAGE
    - Kotlin
    - Compose Desktop
    - 디버깅
draft: false
---

파일을 트리로 보고 싶었다. 첫 마일스톤의 PAGE 화면은 에디터 패널 하나가 전부였다. 단일 파일을 열어 두는 데는 충분하지만, 프로젝트를 훑으면서 옮겨다닐 수가 없다. 좌측에 파일 트리를 붙이는 게 다음 단계였다.

## 모델은 한 줄

펼친 폴더의 집합 하나가 트리의 상태 전부다.

```kotlin
data class TreeNode(val path: Path, val depth: Int, val isDirectory: Boolean)

fun listTree(root: Path, expanded: Set<Path>): List<TreeNode>
```

`expanded` 만 들고 있으면 그때그때 디스크를 다시 읽어 평탄화된 행 리스트를 돌려준다. UI 는 LazyColumn 에 그대로 붙이면 끝. 익스팬드/콜랩스 상태가 디스크와 분리돼 있어 테스트도 깔끔하다 — `@TempDir` 하나로 7 케이스를 다 돌렸다.

여기까지는 한 시간도 안 걸렸다. 미끄러진 건 UI 가 켜진 다음이었다.

## 첫 번째 미끄럼: 클릭 한 번이 EDT 를 죽인다

파일 트리에서 PNG 를 한 번 잘못 클릭했다. 그 뒤로는 폴더를 눌러도 아무 반응이 없다. 콘솔을 보니:

```
Exception in thread "AWT-EventQueue-0" java.nio.charset.MalformedInputException: Input length = 1
    at java.nio.file.Files.readString(Files.java:3362)
    at page.editor.FileDocument.load(FileDocument.kt:10)
    ...
```

파일을 UTF-8 로 디코드하려다 실패. 그 예외가 클릭 핸들러에서 그대로 위로 던져졌고, AWT EventQueue 에서 잡힌 뒤 EDT 가 굳었다. 그래서 그 다음 클릭들도 전부 무반응.

수정은 단순했다.

```kotlin
fun loadOrNull(path: Path): String? = try {
    load(path)
} catch (_: IOException) {
    null
}
```

호출 측에서 null 이면 그냥 아무 것도 안 한다. 바이너리 파일을 누르면 조용히 무시. 의도대로다.

다만 진짜 교훈은 코드에 있지 않았다. **EDT 에서 한 번 던진 예외는 단발 사고가 아니다.** 그 다음 모든 입력이 같이 죽는다. UI 코드에서 IO 를 얼마나 무방비하게 호출하고 있었는지 그제서야 보였다. 클릭 핸들러는 가벼운 컴포지션 같지만, 그 안에서 호출되는 모든 함수가 EDT 의 신뢰를 건드린다.

## 두 번째 미끄럼: Path 가 Iterable 이다

UTF-8 을 막고 다시 띄웠다. 이번엔 폴더 클릭 자체가 작동을 안 한다. 첫 클릭은 펼쳐지는데, 두 번째 클릭부터 접히질 않는다.

토글 함수는 한 줄이었다.

```kotlin
val toggleExpanded: (Path) -> Unit = { p ->
    expanded = if (p in expanded) expanded - p else expanded + p
}
```

`println` 을 박았다.

```
[tree] toggle ...\.idea before=1 after=6
[tree] toggle ...\.idea before=6 after=6
[tree] toggle ...\.idea before=6 after=6
```

첫 클릭에 set size 가 1 에서 6 으로 뛰었다. 다섯 개나 들어갔다. 어디서 다섯이?

`C:\Users\manne\Desktop\hansol_hs_java_app\.idea` 의 path 컴포넌트가 정확히 다섯이다. `Users`, `manne`, `Desktop`, `hansol_hs_java_app`, `.idea`.

`java.nio.file.Path` 는 `Iterable<Path>` 를 구현한다. 이름 컴포넌트들을 순회하는 인터페이스다. 그래서 `Set<Path>.plus(Path)` 가 element 오버로드 (`plus(T)`) 가 아니라 iterable 오버로드 (`plus(Iterable<T>)`) 로 결합됐다. 두 오버로드가 모두 적용 가능할 때 Kotlin 이 어느 쪽을 우선하는지에 대해서는 stdlib 의 `@HidesMembers` 와 overload resolution 규칙을 더 파봐야 정확히 답할 수 있겠다. 다만 동작 결과는 분명하다 — 한 번의 토글이 path 의 모든 name 컴포넌트를 set 에 풀어 넣는다.

두 번째 클릭부터는 더 황당했다. `p in before` 는 false 를 돌려준다 — 풀어넣은 건 name 조각들이고, p 는 전체 경로이기 때문이다. 그래서 또 else 분기를 타고 `before + p` 를 호출. 이미 set 에 들어 있는 name 조각들이라 dedupe 돼서 size 는 그대로 6. 무한 no-op.

수정도 한 줄이었다.

```kotlin
expanded = if (p in expanded) expanded - setOf(p) else expanded + setOf(p)
```

인자를 명시적인 set 으로 감싸면 element 오버로드와의 충돌 자체가 사라진다. set 두 개의 union 또는 difference 로만 결합된다.

이건 Kotlin 의 함정으로만 묶기에는 좀 더 보편적이다. 어떤 타입이 우연히도 `Iterable<자기자신>` 을 구현할 때, 그 타입을 컬렉션 연산자에 넣으면 의미가 무너진다. Java 에서도 똑같은 패턴이 있다. 상속이 의미를 침범하는 사례다.

## 사이드바 리사이즈는 의외로 짧았다

사이드바와 에디터 사이 1dp 구분선을 잡고 끌면 폭이 바뀐다. Compose Desktop 에서는 이게 거의 코드 한 블록.

```kotlin
@Composable
private fun ResizeHandle(onDeltaDp: (Dp) -> Unit) {
    val density = LocalDensity.current
    Box(
        modifier = Modifier
            .pointerHoverIcon(PointerIcon(Cursor.getPredefinedCursor(Cursor.E_RESIZE_CURSOR)))
            .pointerInput(Unit) {
                detectHorizontalDragGestures { _, dx ->
                    onDeltaDp(with(density) { dx.toDp() })
                }
            },
    ) { /* 1dp 라인 */ }
}
```

delta 만 위로 올리고, 호출 측에서 `(현재 + delta).coerceIn(160.dp, 600.dp)` 로 클램프. AWT 커서 상수가 그대로 먹는 것도 좋았다 — Compose Desktop 의 `PointerIcon(java.awt.Cursor)` 오버로드가 둘을 이어 준다.

## 회고

파일 트리는 "보이는 작은 기능"의 전형이다. UI 만 갈아끼우면 끝일 것 같은. 두 번 미끄러지고서야 보이는 것들이 있었다.

- 클릭 핸들러는 EDT 와 직결돼 있다. 그 안에서 IO 예외를 그대로 위로 던지면 EDT 자체가 굳는다. UI 의 모든 상호작용이 같이 무너진다.
- 표준 라이브러리에서도 "원소처럼 보이지만 실은 컬렉션이기도 한" 타입은 흔하다. `Path`, `String` (의 Char 시퀀스), 다양한 트리 노드들. 컬렉션 연산자에 인자를 넣을 땐 그 타입의 인터페이스를 한 번 더 의심해야 한다.

이번 라운드의 코드 변경량은 462 라인 추가, 34 라인 삭제. 그 중 절반 이상이 트리 모델/패널이고, 결정적인 두 줄은 `loadOrNull` 과 `setOf(p)` 였다.
