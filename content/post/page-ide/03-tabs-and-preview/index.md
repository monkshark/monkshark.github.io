---
title: "#3 - 탭, 폭이 다른 함정, 그리고 deprecated 의 무덤"
description: "swap 후 보정값이 반대편 임계를 넘어 원복하던 버그, 그리고 권장 대체가 우리 케이스를 안 받아주는 deprecated API 를 Skia 까지 내려가서 푼 이야기"
date: 2026-05-05
slug: page-ide-tabs-and-preview
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

지난 회차에서 좌측 트리가 붙었다. 그런데 트리에서 두 번째 파일을 클릭하는 순간 첫 번째 파일이 사라졌다. 모델이 단일 `path` 와 단일 `TextFieldValue` 였으니 당연하다. 트리 클릭이 그 두 변수를 통째로 갈아끼웠다. IDE 라면 이 동작은 안 된다. 다음 단계는 탭이었다.

## 모델은 또 한 줄

탭도 결국 펼친 폴더 집합처럼 데이터 한 덩어리로 환원된다.

```kotlin
data class OpenTab(val path: Path, val text: String, val caret: Int = 0)

data class TabBook(val tabs: List<OpenTab> = emptyList(), val activeIndex: Int = -1) {
    fun openOrFocus(path: Path, text: String): TabBook
    fun close(index: Int): TabBook
    fun activate(index: Int): TabBook
    fun updateActive(text: String, caret: Int): TabBook
    fun move(from: Int, to: Int): TabBook
}
```

전부 순수 데이터, 전부 immutable. 21 케이스를 단위테스트로 검증한 다음에야 UI 를 붙였다. 같은 path 로 다시 열면 새 탭이 아니라 기존 탭에 포커스, 활성 탭을 닫으면 인접 탭이 활성화 — 이런 결정들이 코드에 꺼내져서 명시적으로 검증된다.

`activeIndex` 보정 로직은 한 번에 안 떠올라서 표를 그렸다. close 한 인덱스가 활성보다 앞이면 `activeIndex - 1`, 뒤면 그대로, 같으면 같은 자리 (또는 끝이면 한 칸 앞). move 는 더 까다롭다 — 활성 탭 자체가 옮겨지면 `to` 로 따라가고, 활성이 swap 범위 안에 들어 있으면 ±1 시프트, 밖이면 유지. 이 보정이 데이터 클래스 안에 갇혀 있으니 UI 가 자유롭게 호출만 하면 된다.

## 드래그 재배치, 그리고 작은 탭이 큰 탭 앞으로 안 가던 사연

탭을 잡고 끌어서 순서를 바꾸는 동작. 첫 구현은 자연스럽게 떠올랐다.

```kotlin
while (true) {
    val rightW = widthOf(tabBounds[cur + 1])
    val leftW = widthOf(tabBounds[cur - 1])
    if (rightW != null && dragOffsetPx > rightW / 2f) {
        onMove(cur, cur + 1); cur += 1
        dragOffsetPx -= rightW
        continue
    }
    if (leftW != null && dragOffsetPx < -leftW / 2f) {
        onMove(cur, cur - 1); cur -= 1
        dragOffsetPx += leftW
        continue
    }
    break
}
```

같은 폭의 탭들끼리는 잘 굴러갔다. 그런데 폭이 다른 탭이 섞이자 작은 탭이 큰 탭 앞으로 안 옮겨졌다. 정확히는 — swap 이 한 번 일어났다가 그 자리에서 즉시 원복했다.

종이에 펴 보고서야 보였다.

작은 탭(폭 60) 을 큰 탭(폭 200) 앞으로 끌어 올린다고 하자. cur=1, leftW=200. `dragOffsetPx` 가 -101 정도가 되면 임계를 넘어 swap.

```
swap: cur = 0, dragOffsetPx = -101 + 200 = +99
```

여기서 끝나야 하는데, `while` 루프가 즉시 다음 iter 로 들어간다. 이번엔 우측 검사. `rightW = tabBounds[1]`. 그런데 swap 이 일어난 직후이고, `onGloballyPositioned` 가 다음 layout pass 에서나 새 좌표를 보고하므로, **그 시점의 `tabBounds[1]` 은 swap 전의 작은 탭 폭(60) 그대로**. 99 > 60/2 → 임계 통과 → onMove(0, 1) 로 원복.

두 가지 함정이 겹쳤다.

- 한 번의 콜백 안에서 양방향을 즉시 검사. 보정값이 반대편 임계를 어렵잖게 넘는다.
- swap 직후 자료(`tabBounds`) 가 stale. 다음 layout pass 까지의 한 프레임 차이가 의사결정에 그대로 들어간다.

수정도 두 줄짜리였다.

```kotlin
if (dragOffsetPx > 0f) {
    while (true) { /* 우측만 검사 */ }
} else if (dragOffsetPx < 0f) {
    while (true) { /* 좌측만 검사 */ }
}
```

그리고 swap 시 모델만 옮기지 말고 그 인덱스의 bounds 도 같이 swap.

```kotlin
private fun swapBounds(bounds: MutableMap<Int, IntRange>, a: Int, b: Int) {
    val ra = bounds[a]; val rb = bounds[b]
    if (rb != null) bounds[a] = rb else bounds.remove(a)
    if (ra != null) bounds[b] = ra else bounds.remove(b)
}
```

bounds 의 left/right 좌표값은 다음 layout 에서 어차피 덮인다. 우리가 당장 필요한 건 **width** 뿐이고, width 는 같은 탭이 어느 인덱스에 있든 그 탭의 속성이다. 그래서 인덱스 사이의 entry 만 단순 swap 해 줘도 다음 iter 의 임계 계산이 정확해진다.

이 두 줄을 적용한 뒤로는 폭이 어떻게 섞여도 한 방향 한 단계씩, 깔끔하게 swap 된다.

## 이미지 미리보기, 그리고 deprecated 의 무덤

단일 텍스트 에디터로는 PNG 를 클릭한 사람이 빈 화면을 보게 된다. 트리에서 클릭이 들어왔으니 뭐라도 보여줘야 한다. 미리보기 패널을 붙이기로 했다.

분류 자체는 단순했다.

```kotlin
enum class FileKind { TEXT, IMAGE, SVG }
```

확장자만 보고 PNG/JPG/GIF/BMP/WEBP 는 IMAGE, SVG 는 SVG, 그 외는 TEXT. 활성 탭의 kind 가 TEXT 이면 EditorPanel, IMAGE/SVG 이면 PreviewPanel. Ctrl+S 도 활성 탭이 TEXT 일 때만 동작한다 — 이미지 파일에 빈 텍스트를 덮어쓰면 그 이미지는 끝이다.

여기까진 한 시간이었다. 막힌 건 painter 를 만드는 부분이었다.

```kotlin
loadImageBitmap(stream)
loadSvgPainter(stream, density)
```

Compose Desktop 에서 곧장 쓰던 두 함수다. 컴파일 시 경고가 떴다.

```
'fun loadImageBitmap(inputStream: InputStream): ImageBitmap' is deprecated.
Migrate to the Compose resources library.
```

Compose Resources 는 빌드 타임에 생성되는 자원 핸들 (`Res.drawable.foo`) 을 다루는 라이브러리다. 우리는 빌드 시점에 어떤 파일이 열릴지 모른다. 사용자가 트리에서 임의 경로를 클릭한다. **권장 대체가 우리 use case 를 받아주지 않는 deprecation** 이었다.

JetBrains 의 `loadImageBitmap` 내부를 보면 결국 Skia 의 `Image.makeFromEncoded` 한 줄이고, `loadSvgPainter` 도 `SVGDOM(Data.makeFromBytes(bytes))` 를 painter 로 감싸는 게 다였다. 그 한 단계 아래로 내려가서 직접 호출하면 된다.

```kotlin
FileKind.IMAGE -> BitmapPainter(
    SkiaImage.makeFromEncoded(bytes).toComposeImageBitmap()
)
FileKind.SVG -> SvgPainter(SVGDOM(Data.makeFromBytes(bytes)))
```

`SvgPainter` 는 직접 짰다. 핵심은 두 부분이다.

```kotlin
private class SvgPainter(private val dom: SVGDOM) : Painter() {
    override val intrinsicSize: Size = computeIntrinsicSize(dom)

    override fun DrawScope.onDraw() {
        drawIntoCanvas { canvas ->
            dom.setContainerSize(size.width, size.height)
            dom.render(canvas.nativeCanvas)
        }
    }
}
```

intrinsic size 는 SVG 의 `width`/`height` 를 우선 보고, 단위가 percentage 면 무시하고 `viewBox` 로 폴백. 그릴 때는 매 프레임 `setContainerSize` 로 우리가 원하는 픽셀 크기를 넣어주고 SVG 가 알아서 fit. scale 행렬을 직접 만지지 않아도 된다.

이 변경으로 빌드 경고가 0 개가 됐다. 동작도 같다 — 우리가 호출한 Skia 호출이 JetBrains 가 호출하던 Skia 호출이다.

## 줌은 디폴트가 작은 게 좋다

미리보기를 처음 붙였을 때는 `ContentScale.Fit` 으로 패널에 꽉 차게 채웠다. 큰 이미지일수록 답답했다. 사용자가 작게 보고 싶다 했고, 동의가 갔다 — 미리보기는 "전체 분위기" 를 보여주는 자리다.

```kotlin
val baseline = min(1f, fit) * 0.7f
val effective = baseline * zoom
```

zoom = 1.0 일 때 fit 의 70% 만큼만 보인다. 사용자 입장에서는 그게 "100%". 휠로 위/아래 = 1.1 배수, 하단 −/+ 버튼은 1.25 배수, % 라벨 클릭은 100% 리셋. 휠 이벤트는 `PointerEventPass.Initial` 로 가로채서 자식 스크롤이 못 받게 consume. 줌 한 가지만 하는 휠이라 다른 의미를 거기 얹지 않는 게 깔끔하다.

## 회고

탭은 모델 자체보단 그 위의 인터랙션이 함정이었다. 드래그 재배치는 swap 이 즉시 일어나는 self-modifying 동작이다. 그런 동작에서 의사결정이 외부 신호 (`tabBounds` 의 layout 결과) 에 의존하면, 신호가 한 프레임 늦은 순간 잘못 결정한다. 모델을 바꾸면 모델과 같이 갱신되는 캐시도 직접 갱신해야 한다 — layout 에 맡기는 건 안 된다.

deprecated 안내를 곧이 곧대로 따랐으면 미리보기 자체가 막힐 뻔 했다. 권장 대체가 항상 같은 use case 를 커버하지는 않는다. 한 단계 아래 (Skia) 로 내려가는 비용이 그렇게 크지 않았고, 동작은 오히려 명확해졌다 — 우리가 정확히 무엇을 호출하는지 보인다.

결정적인 두 줄은 한 방향 swap 분기와 `dom.setContainerSize` 였다.
