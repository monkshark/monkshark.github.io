---
title: "#5 - 패인 경계를 넘어가는 탭, 자기를 가리는 클리핑들"
description: "임계값 → 떨림 → horizontalScroll 클립 → Surface 클립 → SplitPane 형제. 패인 사이로 탭을 옮기기까지 다섯 번의 우회"
date: 2026-05-06T20:00:00+09:00
slug: page-ide-cross-pane-drag
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "Compose Desktop", "드래그앤드롭", "클리핑", "z-index", "디버깅"]
---

분할 화면을 만들고 나니 자연스러운 다음 요구가 따라왔다 탭을 한 패인에서 옆 패인으로 끌어다 옮기고 싶다. VSCode, IntelliJ 모두 하는 동작이다. 어렵지 않을 줄 알았다.

이 한 기능을 위해 다섯 단계의 우회를 거쳐야 했고, 그동안 마주친 증상은 한두 가지가 아니었다. 이 글은 깔끔한 5단계 해법보다 그 사이에서 무엇을 시도하고 무엇이 깨졌는지를 더 길게 적은 회고다.

## 마주친 증상들

작업 내내 반복해서 부딪힌 현상들:

- 방향 비대칭 왼→오로 끌면 옆 패인으로 넘어가는데, 오→왼은 절대 안 넘어감
- 정방향에서도 끝까지 안 끌림 화면 끝까지 가도 임계점에 도달하지 못함
- 떨림 드래그 중 탭이 미세하게 좌우로 진동
- 시각적 위화감 발사 직전에 칩이 한 칸씩 미끄러지듯 보이는 슬랙
- 칩이 매번 다른 자리에서 잘림 한 군데를 고치면 다른 모서리에서 사라짐
- 바 끝을 벗어난 부분이 보이지 않음
- 한쪽만 뚫림 한쪽 끝은 칩이 바깥으로 나가는데 반대쪽은 막혀 있음
- 옆 패인으로 넘긴 직후 드래그가 강제 종료

증상이 많아 보이지만 결국 두 종류였다 임계값을 못 넘는다와 못 보인다. 그런데 양쪽 다 매번 새로운 자리에서 새 모양으로 등장했다.

## 임계값과 방향 비대칭

처음엔 단순했다. 탭이 얼마나 끌렸는지 측정해서 일정 거리를 넘으면 옆 패인으로 보낸다.

시도 1 탭 너비 기반 임계값

```kotlin
val threshold = (tabWidth * 0.75f).coerceAtLeast(100f)
if (totalDragX > threshold) onMoveToOtherPane(index)
```

너무 높았다. 정방향에서도 임계점에 도달하기 전에 화면 끝에 닿아 버렸다 끝까지 안 끌리는 증상의 원인이었다.

시도 2 자연 maxRight + 30px 오버드래그

자연 위치 기준 오른쪽 끝을 넘어 30px 더 끌면 발사. 정방향은 잘 됐다. 그런데 역방향은 여전히 안 됐다 음의 거리에 대한 대칭 처리를 안 해서 한쪽만 트리거됐다.

시도 3 포인터 위치 기반

결국 드래그 거리가 아니라 포인터 좌표 자체로 판정.

```kotlin
val finalPointerX = pointerOffsetInBar.x
if (finalPointerX < -CROSS_PANE_OVERDRAG_PX || finalPointerX > barWidthPx + CROSS_PANE_OVERDRAG_PX) {
    onMoveToOtherPane(index)
}
```

이게 두 방향 모두 일관되게 작동한 첫 형태였다.

그런데 발사 직후 드래그가 취소됐다. `pointerInput(book.tabs.size)` 키 때문이었다. 옆 패인으로 보내는 순간 탭 개수가 바뀌고, 그러면 `pointerInput`이 재시작되며 진행 중인 제스처가 죽었다. 해법은 발사를 `drag()` 람다 안에서 하지 말고, `drag()`가 끝나서 모든 포인터 상태가 정리된 다음 한 번만 호출하는 것:

```kotlin
val crossed = drag(down.id) { /* in-pane swap, offset 갱신만 */ }
if (crossedThreshold) onMoveToOtherPane(index)
```

## 떨림: stale 자연 위치

칩이 좌우로 미세하게 떨렸다.

시도 1 modifier 순서 재배치

`onGloballyPositioned`를 `offset` 바깥으로 빼봤다. 효과는 있었지만 부족했다.

진짜 원인은 다른 데 있었다. 드래그 중 옆 탭과 자리를 바꾸는(= within-pane swap) 순간, 칩의 자연 위치(자기 슬롯의 왼쪽 좌표)가 한 칸만큼 점프한다. 그런데 코드는 매 프레임 `tabBounds[index]`로 자연 위치를 다시 읽었고, swap 직후의 `tabBounds`는 한 프레임 동안 stale이었다. 결과: 스왑 → 자연 위치 점프 → 시각 오프셋도 점프 → 다음 프레임에 보정 → 떨림.

최종 자연 위치를 외부 상태로 명시 관리

```kotlin
var draggedNaturalLeft by remember { mutableStateOf(0) }
var draggedWidth by remember { mutableStateOf(0) }

draggedNaturalLeft = tabBounds[index]?.first ?: 0
draggedWidth = (tabBounds[index]?.last ?: 0) - draggedNaturalLeft

draggedNaturalLeft -= leftWidth
draggedNaturalLeft += rightWidth
```

`tabBounds`에 의존하지 않고 직접 관리하니 stale 문제가 사라졌다.

## horizontalScroll 클립과 가려짐

이제 끌어서 패인 경계로 갈 수는 있다. 그런데 칩이 바의 시각 영역을 벗어나는 순간 잘려나갔다.

시도 1 `clampWithinBar`로 바 안에 가두기

처음엔 칩이 바 바깥으로 못 나가게 클램프했다. 끝까지 가면 바 끝에 붙어 멈춘다. 발사 판정은 포인터 좌표로 하니까 동작은 했다.

문제는 양쪽이었다. 양옆이 모두 자유롭게 뚫리는 쪽이 더 자연스러웠고, 클램프는 정확히 그 반대였다. 떼어냈다.

시도 2 클램프 제거 후 그대로

떼어냈더니 바 끝을 넘은 부분이 잘렸다. `Modifier.horizontalScroll`은 내부적으로 `clipScrollableContainer`를 적용해서 viewport 바깥을 잘라낸다. 끄는 옵션이 없다.

시도 3 칩 자체에 `Modifier.zIndex(1f)`

zIndex만 올리면 같은 Row 안에서 그리기 순서가 위로 가니까 안 가려질 줄 알았다. 같은 부모(Row) 안에서는 효과가 있었지만, Row 자체가 `horizontalScroll`로 클립되니까 zIndex와 무관하게 잘렸다. zIndex는 그리기 순서지 클립을 우회하지 않는다.

최종 오버레이로 스크롤 영역 바깥에 그리기

인라인 자리에는 placeholder만 두고:

```kotlin
TabChip(..., alpha = if (isDragged) 0f else 1f)
```

오버레이로 따로 그린다:

```kotlin
val di = draggingIndex
if (di != null && draggedWidth > 0) {
    val viewportLeft = draggedNaturalLeft - scrollState.value + dragOffsetPx.roundToInt()
    Box(modifier = Modifier.height(TabBarHeight).offset { IntOffset(viewportLeft, 0) }) {
        TabChip(tab = book.tabs[di], isActive = di == book.activeIndex, elevated = true, alpha = 1f)
    }
}
```

오버레이는 스크롤 Row 바깥 TabBar 외곽 Box에 직접 에 그려서 viewport 클립을 받지 않는다.

## Surface 클립: 한 겹 더

오버레이 만들어 놓고도 음의 X로 가면 또 잘렸다. 이번엔 TabBar 전체를 감싼 Material3 `Surface`였다. Surface는 내부적으로 `clip(shape)`을 적용한다 `RectangleShape`가 기본이라 사각형으로 잘라낸다. 칩이 음의 X(역방향 끝)로 가는 순간 Surface 박스 바깥이 되고, 거기서 다시 사라진다.

Surface가 주는 건 배경색과 톤뿐이었으므로 그냥 `Box`로 바꿨다:

```kotlin
Box(
    modifier = Modifier
        .background(MaterialTheme.colorScheme.surface)
        .fillMaxWidth()
        .height(TabBarHeight)
) {
    Row(modifier = Modifier.horizontalScroll(scrollState)) { /* 인라인 칩들 */ }
    /* 오버레이 칩 */
}
```

이 시점에 `clampWithinBar` 함수도 완전히 제거했다 양쪽 모두 자유롭게 뚫리니 더 클램프할 이유가 없다.

## SplitPane 형제 패인이 위에 그려진다

하나가 더 남아 있었다. 한쪽 패인의 칩이 반대쪽 패인 영역까지 시각적으로 들어갔는데, 그 위로 반대쪽 패인이 덮여 보이지 않았다.

`SplitPane`은 `Row { Box(first); Divider; Box(second) }` 구조다. Compose에서 같은 부모의 자식들은 선언 순서대로 그려진다 second가 first 위에 그려진다. 정방향 드래그(primary→secondary)에서 떠 있는 칩이 secondary 영역에 들어갈 때, 그 위에 secondary 박스 자체가 덮어 그렸다.

시도 칩에 `Modifier.zIndex(1f)`

이미 앞 단계에서 했다 같은 부모 안에서는 동작하지만 SplitPane의 형제 박스 사이에는 영향이 없었다. zIndex는 같은 parent의 siblings 사이의 규약이다.

최종 패인 박스 자체의 zIndex를 hoist

드래그가 시작된 패인 박스 자체의 zIndex를 일시적으로 올린다. 출발 패인이 있는 동안 그 패인이 다른 패인 위에 그려지고, 그 안의 오버레이 칩은 자유롭게 형제 패인 영역까지 침범한다.

```kotlin
var dragSourcePane: PaneSide? by remember { mutableStateOf(null) }

SplitPane(
    firstZIndex = if (dragSourcePane == PaneSide.PRIMARY) 1f else 0f,
    secondZIndex = if (dragSourcePane == PaneSide.SECONDARY) 1f else 0f,
    first = {
        PaneRegion(
            ...,
            onTabDragStart = { dragSourcePane = PaneSide.PRIMARY },
            onTabDragEnd = { dragSourcePane = null },
        )
    },
    second = {
        PaneRegion(
            ...,
            onTabDragStart = { dragSourcePane = PaneSide.SECONDARY },
            onTabDragEnd = { dragSourcePane = null },
        )
    },
)
```

```kotlin
Box(modifier = Modifier.weight(firstWeight).fillMaxHeight().zIndex(firstZIndex)) { first() }
Divider(...)
Box(modifier = Modifier.weight(secondWeight).fillMaxHeight().zIndex(secondZIndex)) { second() }
```

`onDragStart`/`onDragEnd`는 TabBar에서 slop 통과 시점과 제스처 종료 시점에 발사된다.

## 돌아보면

다섯 군데서 잘렸다 `horizontalScroll` viewport, `Surface` clip, SplitPane 자식 그리기 순서, 그리고 임계값/떨림 이슈까지. 전부 기본값이 잘라낸다 한 줄 요약 가능한 종류였지만, 다섯 번 다른 모양으로 등장했다.

수정 자체보다 어디가 자르는지를 매번 처음부터 추적하는 데 시간이 갔다. 칩이 안 보일 때마다 후보가 셋이었다 스크롤이 자르나, Surface가 자르나, 형제가 덮나. 매번 하나씩 떼어 봐야 알았다.

배운 것 두 개:

- Compose modifier가 무엇을 자르고 있는지는 직관과 다르다. `horizontalScroll`이 자르는 건 알 만했지만, Material3 `Surface`가 자르는 건 한 번 깨질 때까지 잊고 있었다. 떠 있어야 하는 요소가 있으면 그 위에 있는 모든 클립 가능 modifier를 의심해야 한다.
- zIndex는 같은 parent의 siblings 사이의 규약이다. 자식의 zIndex를 아무리 올려도 부모가 형제에게 덮이면 의미가 없다. 떠 있는 요소를 자식에 두지 말고 떠 있어야 하는 컨테이너 자체의 zIndex를 올려야 한다.
