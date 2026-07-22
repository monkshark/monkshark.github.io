---
title: "#6 - BasicTextField 가 막아두던 자리들, Canvas 위에서 다시 짠 코드 에디터"
description: "한글 IME 두 번 찍힘, 멀티 탭 Undo 충돌, PageDown 10줄 고정. BasicTextField를 떠나 Canvas 위에 코드 에디터를 다시 짠 회고"
date: 2026-05-07T19:00:00+09:00
slug: page-ide-codeeditor-canvas
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "Compose Desktop", "Canvas", "IME", "한글 입력", "Undo", "리팩터링"]
---

`#4` 에서 적었던 멀티 탭 Undo 문제를 풀고 났는데, 풀고 보니 그건 가장 잘 보이던 한 자리였을 뿐이었다. `BasicTextField` 라는 추상이 우리에게 막아두고 있던 자리는 더 많았다.

이 글은 그 자리들을 하나씩 떼어 보면서, Compose 의 `BasicTextField` 를 떠나 Canvas 위에 직접 그린 코드 에디터로 옮긴 회고다. 마지막에 도착했을 때는 처음 출발한 자리에서 의외로 멀리 와 있었다.

## BasicTextField 가 막아두던 것

`#4` 까지의 PAGE 는 `BasicTextField` 를 코어로 두고 그 위에 외부 Undo, 검색 하이라이트, 신택스 컬러링, 브래킷 매칭, 코드 폴딩을 겹쳐 쌓은 형태였다. 글자를 입력받는 일은 라이브러리에 맡기고 나머지를 우리가 그린 셈이다.

그 구조가 하나둘씩 깨지기 시작했다.

- 두 시간선 윈도우 레벨에서 Ctrl+Z 를 가로채 우리 `EditHistory` 로 처리하고 있는데, `BasicTextField` 안에도 자체 Undo 스택이 살아 있었다. 우리 인터셉터가 한 번이라도 새는 순간 `BasicTextField` 의 스택이 발사된다. `#4` 에서 제거한 줄 알았던 두 시간선이 사실은 한 겹 더 깊은 곳에 있었다.
- 한글이 두 번 찍힌다 IME 조합 중 텍스트가 컴포지션 영역 안에 있는 동안에는 텍스트값과 시각 표현 사이가 어긋난다. `BasicTextField` 는 자체적으로 컴포지션을 처리하지만, `VisualTransformation` 을 끼우면 그 처리와 충돌해 같은 글자가 두 번 들어가거나 마지막 글자가 통째로 사라졌다.
- 드래그-드롭 같은 기능을 못 만든다 선택 영역을 다른 위치로 끌어 옮기려면 프레스 시점에 캐럿을 옮기지 않고 보류 하는 결정이 필요하다. `BasicTextField` 의 포인터 처리 안쪽엔 그 결정 지점이 없다.
- 신택스 색이 컴포지션과 싸운다 토큰별 색깔을 `VisualTransformation` 으로 입혔더니 IME 조합 중 색이 흔들리고, 폴딩 플레이스홀더 (`...`) 와 캐럿 좌표가 서로 1글자씩 어긋나는 모서리가 생겼다.

기존 도구의 한계를 한 번에 다 풀고 싶었다. 내가 통제해야 하는 상태는 라이브러리에 맡기지 않는다 `#4` 회고에 적은 그 한 줄을 한 단계 더 밀어붙이는 일이었다.

## 첫 캔버스: 글자가 그려지는 순간

처음 한 일은 `BasicTextField` 를 지우는 것이 아니라 옆에 새 컴포저블을 만드는 것이었다.

`page/ui/CodeEditor.kt` 한 파일짜리, `Canvas` + `rememberTextMeasurer()` 로 글자를 그리고, 클릭으로 캐럿을 옮기고, 키 입력을 받아 텍스트를 갱신하는 최소형. 이 단계의 핵심은 측정기에 의존해도 60fps 가 나오는가 였다.

```kotlin
val measurer = rememberTextMeasurer()
val layout = remember(displayText, textStyle, density.density) {
    measurer.measure(text = displayText, style = textStyle, softWrap = false)
}
Canvas(modifier = ...) {
    drawText(textLayoutResult = layout)
    if (isFocused && caretVisible) {
        val rect = layout.getCursorRect(caretOffset)
        drawRect(brush = cursorBrush, topLeft = ..., size = ...)
    }
}
```

처음 캐럿이 깜빡이는 것을 본 순간을 기억한다. `BasicTextField` 에서는 너무 당연해서 안 보이던 것이었다 캐럿이 깜빡이는 일조차 우리가 직접 타이머로 토글해야 한다.

```kotlin
LaunchedEffect(isFocused, value.selection) {
    caretVisible = true
    if (!isFocused) return@LaunchedEffect
    while (true) { delay(530); caretVisible = !caretVisible }
}
```

이 단계에서는 명백히 부족했다. 선택, 한글, Undo, 자동 스크롤, 어느 것 하나 안 됐다. 그래도 직접 그린 글자가 보인다 는 게 출발점이 됐다.

## 시그니처를 바꿔 끼우기

처음 `CodeEditor` 의 시그니처는 단순했다.

```kotlin
fun CodeEditor(text: String, caret: Int, onChange: (String, Int) -> Unit, ...)
```

이 모양으로는 PAGE 의 나머지 코드와 맞지 않았다. 검색 하이라이트, 신택스 토큰, 브래킷 매칭, 폴딩 전부 `VisualTransformation` 으로 텍스트에 색/배경/플레이스홀더를 입히는 구조였고, 그러려면 `BasicTextField` 가 받던 시그니처와 동일한 모양으로 받아야 했다.

```kotlin
fun CodeEditor(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    ...
)
```

이 한 번의 시그니처 정렬이 의외로 컸다. 이 시점부터 `EditorPanel` 의 `BasicTextField` 자리에 `CodeEditor` 를 그대로 갈아 끼울 수 있는 드롭인 타깃 이 됐다. 한 번에 다 옮기는 대신 단계적으로 옮길 수 있는 길이 열렸다는 뜻이다.

## 한글이 한 번에 들어가게

가장 어려웠던 자리. 한글 입력은 `ㅎ`, `ㅎㅏ`, `한` 의 세 단계를 거치는데, 마지막 `한` 이 commit 될 때까지 그 사이의 글자들은 조합 중 이다. 화면에는 보여야 하지만 `value.text` 에는 없다.

처음 시도했을 때의 증상이 두 개였다.

- 같은 글자가 두 번 들어간다 조합 중 글자를 우리가 한 번 그리고, 컴포지션 confirm 시 AWT 의 `InputMethodEvent` 가 또 한 번 텍스트로 넣는다.
- 마지막 글자가 사라진다 거꾸로, 컴포지션 텍스트가 우리 `value.text` 에 들어갔는데 confirm 이 안 와서 그대로 묶였다가 다음 입력 때 통째로 날아간다.

해법은 두 갈래였다. 컴포지션 중 텍스트는 `value.text` 에 넣지 않고, `value.composition` 범위 안에서만 시각화.

```kotlin
val composition = latestValue.composition
if (composition != null && !composition.collapsed) {
    val cStart = mapping.originalToTransformed(composition.min)
    val cEnd = mapping.originalToTransformed(composition.max)
    val startRect = layout.getCursorRect(cStart)
    val endRect = layout.getCursorRect(cEnd)
    drawRect(
        brush = cursorBrush,
        topLeft = Offset(startRect.left, startRect.bottom - 1.dp.toPx()),
        size = Size(endRect.left - startRect.left, 1.dp.toPx()),
    )
}
```

조합 중인 글자는 캐럿 아래에 1px underline 으로 표시한다 IntelliJ, VSCode 모두 같은 시각 패턴이다.

다른 한 갈래는 caret rect 를 IME 에 다시 알려주는 것. 한글 후보창은 캐럿 위치에 떠야 하는데, 그 위치를 IME 에게 알리는 경로가 따로 있다. AWT 의 `InputMethodRequests.getTextLocation()` 으로 caret rect 의 화면 좌표를 돌려주는 어댑터를 끼웠다. 빠뜨리면 후보창이 화면 좌측 상단 (0, 0) 에 뜬다.

```kotlin
val caretRectProvider: () -> androidx.compose.ui.geometry.Rect = {
    val sel = latestValue.selection
    val caretTrans = latestMapping.originalToTransformed(sel.end)
    latestLayout.getCursorRect(caretTrans)
}
// ... .imeInput(value, onValueChange, caretRectProvider)
```

이 단계가 끝나니까 처음으로 글을 쓸 수 있는 에디터가 됐다. 한글 두 번 입력 / 마지막 글자 누락 둘 다 사라졌다.

## 단축키, 마우스, Undo: 한 번에 짜야 했던 코어

가장 길었던 PR. 코드 에디터로서 당연히 있어야 하는 것들이 한꺼번에 비어 있었기 때문이다.

- 좌/우 화살표, Home/End `TextLayoutResult` 의 `getLineStart` / `getLineEnd` 사용
- Ctrl+화살표로 단어 점프 `WordBoundary` 모듈 (이미 다른 PR 에서 만들어둠) 재사용
- Ctrl+Backspace / Ctrl+Delete 단어 삭제, 일반 Backspace / Delete
- Enter 자동 들여쓰기 (`Indent.handleEnter`), Tab/Shift+Tab 들여쓰기
- Alt+Up/Down 줄 이동, Alt+Shift+Up/Down 줄 복제
- 클립보드 Ctrl+C / X / V / A
- 마우스 단일/더블/트리플 클릭 캐럿 / 단어 / 줄 선택
- 드래그로 선택 확장
- 자체 Undo 스택 (이 시점에는 켜진 상태로 들어감 나중에 옵트아웃 됨)

전부 순수 로직은 모듈로 분리 한다는 규칙으로 짰다. `CodeEditorActions` 가 `TextFieldValue` → `TextFieldValue` 변환만 책임지고, `CodeEditor` 안의 키 핸들러는 디스패치만. 그렇게 하니 단위 테스트가 거의 다 `page/ui` 모듈에 들어갔고, Compose 런타임 없이 바로 돌릴 수 있었다.

```kotlin
internal object CodeEditorActions {
    fun applyTab(value: TextFieldValue, shift: Boolean): TextFieldValue { ... }
    fun applyEnter(value: TextFieldValue): TextFieldValue { ... }
    fun applyBackspace(value: TextFieldValue): TextFieldValue? { ... }
    fun applyWordLeft(value: TextFieldValue, shift: Boolean): TextFieldValue { ... }
    fun applyLineMove(value: TextFieldValue, down: Boolean, duplicate: Boolean): TextFieldValue? { ... }
    // ... 14개
}
```

이 분리는 마지막에 드래그-드롭을 짤 때 한 번 더 보상받는다.

## 이식: IDE 에 꽂아 보다

이식이 분기점이었다. `EditorPanel` 의 `BasicTextField` 한 줄을 `CodeEditor` 로 갈아 끼웠다. 시그니처가 같아서 컴파일은 한 번에 통과했다. 하지만 켜는 순간 작은 부재 들이 줄지어 드러났다.

캐럿이 화면 밖으로 나갔는데 스크롤이 안 된다. 긴 파일에서 키보드로 줄을 한참 내려가면 캐럿은 따라 내려가는데 viewport 는 가만히 있었다. `BasicTextField` 는 자체적으로 `bringIntoView` 를 호출했지만 우리는 안 했다. `BringIntoViewRequester` 를 Canvas 에 붙이고 `value.selection.end` 가 바뀔 때마다 caret rect 를 24dp 마진으로 확장해 `bringIntoView()` 를 부르도록 했다.

```kotlin
LaunchedEffect(value.selection.end, layout) {
    val caretTrans = mapping.originalToTransformed(value.selection.end)
    val rect = layout.getCursorRect(caretTrans)
    val marginPx = with(density) { 24.dp.toPx() }
    val expanded = androidx.compose.ui.geometry.Rect(
        left = (rect.left - marginPx).coerceAtLeast(0f),
        top = (rect.top - marginPx).coerceAtLeast(0f),
        right = rect.right + marginPx,
        bottom = rect.bottom + marginPx,
    )
    runCatching { bringIntoView.bringIntoView(expanded) }
}
```

24dp 마진은 IntelliJ 의 `caret.scroll-margin` 을 흉내낸 값이다. 캐럿이 닿을 듯한 자리 가 아니라 조금 여유 있게 보이도록.

우클릭 / Shift+클릭. Compose 의 `DropdownMenu` 를 마우스 좌표에서 띄우고, 잘라내기/복사/붙여넣기/전체선택을 4개 메뉴로 묶었다. Shift+클릭은 기존 selection 의 anchor 를 유지한 채 클릭 위치를 새 endpoint 로 잡는 단순한 처리.

이 시점에 PAGE 는 외관상 마이그레이션이 끝난 것처럼 보였다. 검색 하이라이트, 신택스, 브래킷, 폴딩, 한글 입력, 마우스, 키보드 다 정상이었다. 하지만 외관상 끝난 것과 실제로 끝난 것은 달랐다.

## 두 시간선이 또

마이그레이션 직후 코드를 한 번 천천히 읽다가 발견했다.

`Main.kt` 의 윈도우 레벨 `onPreviewKeyEvent` 가 Ctrl+Z / Ctrl+Y 를 잡아 `book.undoOnActive` 로 처리하는 코드가 있었다 (`#4` 에서 만든 것). 그 아래에서 `CodeEditor` 가 자체 `EditHistory` 를 운영하고 있었다 (코어 단계에서 만든 것). 둘 다 작동했다. 둘 다 작동했지만, 윈도우 인터셉터가 먼저 잡아 소비하기 때문에 CodeEditor 안의 Undo 는 한 번도 트리거되지 않았다.

dead code. 하지만 언젠가 살아날 dead code. `onPreviewKeyEvent` 가 한 번이라도 실패하거나 누군가 그 분기를 손대는 날 두 시간선이 또 충돌한다.

해법은 옵트아웃 파라미터.

```kotlin
fun CodeEditor(
    ...,
    manageHistory: Boolean = true,
    ...
) {
    val performUndo: () -> Boolean
    val performRedo: () -> Boolean
    if (manageHistory) {
        var history by remember { mutableStateOf(EditHistory()) }
        // ... 외부에서 안 잡으면 여기서 처리
    } else {
        performUndo = { false }
        performRedo = { false }
    }
}
```

`EditorPanel` 이 `manageHistory = false` 로 호출하니 IDE 안에서는 외부 Undo 한 갈래만 살아 있다. CodeEditor 단독으로 (예: 데모, 테스트) 쓸 때는 기본값으로 자체 Undo 가 돌아간다.

원칙. 외부가 통제할 수 있는 상태는 라이브러리가 기본으로 켜놓지 말아야 한다. `BasicTextField` 의 Undo 가 끄는 옵션 없이 항상 켜져 있던 것이 PAGE 의 `#4` 사고였다. 같은 실수를 우리가 만든 컴포저블에서 반복하지 말자.

## 한 글자씩 사라지지 않는 Undo

자체 Undo 를 처음 짤 때, 정책을 의도적으로 미뤄뒀다. 한 키 입력당 한 push. `#4` 회고에 적은 대로 단순한 쪽이었고, 그게 충분히 쓸만했다. 마이그레이션이 끝나고 다시 그 자리로 돌아왔을 때, 한 글자씩 되감기는 게 더 이상 쓸만하지 않았다. 50자 입력하고 통째로 지우려면 Ctrl+Z 를 50번 눌러야 했다.

VSCode / IntelliJ 식의 하이브리드 그룹화 로 갔다. 같은 종류의 연속 입력은 하나의 그룹으로 묶고, 다음 조건들 중 하나에 걸리면 새 그룹을 시작한다 (= "break").

- 첫 변경
- 종류가 바뀜 Insert ↔ Delete ↔ Replace
- 직전 변경이 break-char (whitespace, 구두점) 로 끝남
- 마지막 변경 후 500ms 이상 지남
- 큰 작업 (붙여넣기, 선택 영역 교체 등) 직후
- 명시적 `markBreak()` (캐럿 이동, 외부 Undo, 검색치환)

```kotlin
class UndoGroupTracker(
    private val idleBreakMs: Long = 500L,
    private val nowProvider: () -> Long = { System.currentTimeMillis() },
) {
    private var kind: UndoGroupKind = UndoGroupKind.None
    private var lastTime: Long = 0L
    private var endedOnBreakChar: Boolean = false
    private var broken: Boolean = false

    fun markBreak() { broken = true }
    fun reset() { ... }

    fun onTextChange(prevText: String, newText: String): Boolean {
        val delta = computeDelta(prevText, newText)
        val now = nowProvider()
        val shouldBreak = when {
            kind == UndoGroupKind.None -> true
            broken -> true
            kind != delta.kind -> true
            endedOnBreakChar -> true
            now - lastTime > idleBreakMs -> true
            delta.isLargeOp -> true
            else -> false
        }
        kind = delta.kind; lastTime = now
        endedOnBreakChar = delta.endsOnBreakChar || delta.isLargeOp
        broken = false
        return shouldBreak
    }
}
```

`computeDelta` 는 `prevText` 와 `newText` 의 공통 prefix / suffix 를 잘라 가운데 변경 영역만 본다. 그 변경이 Insert 인지 Delete 인지 Replace 인지, 끝 글자가 break-char 인지, 변경 길이가 임계 (8 글자) 이상인지를 한 번에 계산한다.

`nowProvider` 를 주입할 수 있게 한 게 테스트에 결정적이었다. 14개 테스트가 전부 `Clock(now)` 를 직접 조작하면서 break 가 일어나는지를 검증한다 실시간 의존 없이.

```kotlin
@Test fun continuousBackspaceMergesThroughWhitespaceUntilNextWord() {
    val clock = Clock(0L)
    val t = UndoGroupTracker(nowProvider = clock::now)
    t.onTextChange("abc def", "abc de")  // break (첫 변경)
    t.onTextChange("abc de", "abc d")    // merge
    t.onTextChange("abc d", "abc ")      // merge — 'd' 가 끝 글자 (break-char 아님)
    t.onTextChange("abc ", "abc")        // merge — ' ' 가 끝 글자 (...)
    val br = t.onTextChange("abc", "ab") // 다음 단어 진입 직전: break? merge?
    assertFalse(br)  // 같은 단어 안에서 계속 → merge
}
```

이 테스트는 한 번 깨졌다. 처음 짤 때 공백을 지우면 그 다음 글자에서 break 한다 라고 의도했는데, insert 측 동작 (`abc def` 입력 후 Undo 1회 = `def `, Undo 2회 = `abc`) 과 대칭이려면 공백을 지나는 동안에도 같은 그룹 이어야 했다. 의미 보정 후 통과.

## 컬럼이 사라지지 않게, 화면을 따라가는 PageDown

남은 결함 두 개를 같이 묶었다.

Up/Down 의 컬럼 유실. 긴 줄에서 Down 을 누르면 짧은 줄에 가서 X 좌표가 잘려 들어간다. 거기서 Down 을 또 누르면 그 잘린 X 가 새 기준이 되어, 다시 긴 줄로 돌아와도 원래 컬럼으로 못 돌아간다. 모든 IDE 가 이 문제를 preferred X 직전 vertical move 의 X 를 기억하는 로 푼다.

```kotlin
val preferredX = remember { mutableStateOf<Float?>(null) }

// Up/Down/PageUp/PageDown 이외의 모든 키 입력에서 reset
val isVerticalMove = !ctrl && !alt && (
    event.key == Key.DirectionUp || event.key == Key.DirectionDown ||
    event.key == Key.PageUp || event.key == Key.PageDown
)
if (!isVerticalMove) preferredX.value = null
```

Up/Down 이 들어오면 `preferredX.value` 가 비어 있으면 현재 캐럿의 X 로 채우고, 비어 있지 않으면 그 값을 그대로 쓴다. 화살표 좌/우, Home/End, 타이핑, 마우스 클릭 어느 것이든 새 입력이 들어오면 reset. 같은 처리를 PointerEventType.Press 에서도 한다.

PageUp/Down 의 하드코드 10줄. 기존 코드는 `targetLine = currentLine ± 10` 이었다. 화면이 100줄 보여도 10줄만 가고, 5줄만 보여도 10줄을 갔다. 한 페이지 의 의미가 빠져 있었다.

순수 함수로 잘랐다.

```kotlin
object PageScroll {
    const val DEFAULT_FALLBACK_LINES = 10

    fun linesPerPage(viewportPx: Float, lineHeightPx: Float, fallback: Int = DEFAULT_FALLBACK_LINES): Int {
        if (viewportPx <= 0f || lineHeightPx <= 0f) return fallback
        val raw = (viewportPx / lineHeightPx).toInt() - 1
        return raw.coerceAtLeast(1)
    }
}
```

`-1` 은 컨텍스트 한 줄을 남긴다 페이지를 넘어도 직전 화면의 마지막 줄이 위/아래 한 줄로 보인다. VSCode 의 `editor.scrollPageSize` 동작과 같다.

`viewportPx` 는 `ScrollState.viewportSize` 에서 받아온다. CodeEditor 는 그 값을 모르는 게 맞으므로 `viewportHeightProvider: () -> Float` 콜백으로 주입받게 했다.

```kotlin
CodeEditor(
    ...,
    viewportHeightProvider = { scrollState.viewportSize.toFloat() },
    ...
)
```

테스트 5개 fallback / 표준 viewport / 작은 viewport / custom fallback / 분수 viewport 모두 `PageScroll.linesPerPage` 단위 테스트. Compose 런타임 없이 돌아간다.

## 선택을 들어 옮기기

마이그레이션의 마지막 결손. 선택된 텍스트를 마우스로 집어서 다른 위치에 놓는 동작.

UX 결정 두 가지가 있었다.

- 클릭 시점에는 캐럿을 옮기지 않는다. 선택 안쪽을 누른 상태에서 즉시 selection 을 해제하면 드래그가 시작될 수 없다. 4px 이상 움직이는 순간에 비로소 드래그-이동 모드 로 진입한다. 안 움직이면 그냥 클릭으로 처리.
- 드롭 위치를 미리 보여준다. 드래그 중에는 반투명 caret 을 drop 위치에 그린다. 이 고스트 캐럿 만이 에디터에서 유일하게 alpha 가 0.55 인 caret 이다.

```kotlin
val ghostTarget = dragMoveTarget.value
if (ghostTarget != null) {
    val ghostTrans = mapping.originalToTransformed(ghostTarget)
    val ghostRect = layout.getCursorRect(ghostTrans)
    drawRect(
        brush = cursorBrush,
        topLeft = Offset(ghostRect.left, ghostRect.top),
        size = Size(2.dp.toPx(), ghostRect.bottom - ghostRect.top),
        alpha = 0.55f,
    )
}
```

마우스를 떼는 순간 `applyDragMove` 가 텍스트를 옮긴다. Ctrl 이 같이 눌려 있으면 복사 로 동작하고, 그 외에는 이동. 드롭 위치가 선택 영역 안쪽이면 no-op.

```kotlin
fun applyDragMove(value: TextFieldValue, dropOffset: Int, copy: Boolean): TextFieldValue? {
    val sel = value.selection
    if (sel.collapsed) return null
    val drop = dropOffset.coerceIn(0, value.text.length)
    if (drop in sel.min..sel.max) return null
    val moved = value.text.substring(sel.min, sel.max)
    val text = value.text
    return if (copy) {
        val newText = text.substring(0, drop) + moved + text.substring(drop)
        value.copy(text = newText, selection = TextRange(drop, drop + moved.length))
    } else if (drop < sel.min) {
        val newText = text.substring(0, drop) + moved + text.substring(drop, sel.min) + text.substring(sel.max)
        value.copy(text = newText, selection = TextRange(drop, drop + moved.length))
    } else {
        val newText = text.substring(0, sel.min) + text.substring(sel.max, drop) + moved + text.substring(drop)
        val insertionStart = sel.min + (drop - sel.max)
        value.copy(text = newText, selection = TextRange(insertionStart, insertionStart + moved.length))
    }
}
```

코어 단계에서 `CodeEditorActions` 를 순수 객체로 분리해 둔 게 여기서 보상받았다. UI 레벨의 4px 임계, ghost caret 그리기, Ctrl modifier 검출은 `CodeEditor` 에 두고, 어떤 텍스트가 어디로 가는가 의 진짜 로직은 `applyDragMove` 한 함수에 모인다. 단위 테스트 8개 (collapsed null / drop inside null / forward / backward / copy forward / copy backward / drop at min boundary / drop at max boundary) 가 모두 Compose 런타임 없이 돌아간다.

## 돌아보면

다 짜고 보니 Canvas 자체는 의외로 작은 부분이었다. `drawText` 와 `getCursorRect`, 클릭 좌표를 offset 으로 바꾸는 한 줄 그게 거의 전부다. 진짜 일은 라이브러리가 알아서 해주던 것을 알아서 해주지 않게 만들고, 그 대신 우리가 명시적으로 통제하는 것이었다.

그 통제권 안에서 두 가지가 가장 힘들었다.

한글 IME. 텍스트 모델과 시각 표현이 다르게 살아 있는 시간 (조합 중) 의 처리는 Compose 의 추상이 막아두던 영역이었다. 한 번 직접 다뤄 보고 나서야 IntelliJ 가 왜 자체 입력 처리 레이어를 갖고 있는지 이해됐다.

Undo 의 두 시간선. 이전 글에서 한 번 풀고, 마이그레이션 도중에 또 한 번 풀고, 그룹화 단계에서 한 번 더 풀었다. 같은 패턴 우리가 통제하는 시간선 옆에 라이브러리가 대기 중인 두 번째 시간선이 있었다. 매번 다른 모양 으로 등장했지만 본질은 같은 한 가지였다. 세 번째 만났을 때는 첫 두 번보다 빨리 알아챘다. 비슷한 패턴이 또 나타나면 더 빠르게 잡을 자신이 생겼다.

배운 것 셋.

- 순수 로직은 모듈로 떼고 Compose 런타임 없이 테스트 가능하게 짜라. 마지막 단계에서 작은 함수 하나 추가하고 8개 테스트로 검증할 수 있던 건 일찍 그 분리를 해 둔 덕이었다.
- 내가 만든 컴포저블도 옵트아웃 가능하게 짜라. `manageHistory: Boolean = true` 외부가 통제하면 내부는 비활성. `BasicTextField` 가 막아두던 자리에 들어선 새 컴포저블도, 같은 자리에 또 다른 사용자를 끼울 수 있어야 한다.
- 시각 효과의 alpha 한 줄로 UX 가 달라진다. 드래그 중 ghost caret 의 alpha 0.55 이 한 줄이 없었으면 사용자가 어디에 떨어뜨리는지 모르는 채 떼게 된다. 작은 시각적 정직함.

다음 글은 더 위쪽으로 올라간다. 코드 에디터를 다시 짠 김에 그 위에 Quick Open 과 Find in Files 를 얹는다. PAGE 가 처음으로 프로젝트 단위 도구 로 보이기 시작하는 자리다.
