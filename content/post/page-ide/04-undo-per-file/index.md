---
title: "#4 - 다른 파일이 묻어 나오던 Ctrl+Z, 그리고 한 번에 사라지던 보폭"
description: "BasicTextField 내부 undo → 멀티 탭 모델의 두 시간선 충돌, 그리고 키 입력 단위로 갈 것인가 묶을 것인가의 보폭 정책"
date: 2026-05-04T20:00:00+09:00
slug: page-ide-undo-per-file
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

탭이 붙고 나니 파일 두 개를 동시에 띄워두는 일이 자연스러워졌다. A 를 편집하다 B 로 넘어가서 또 편집하고, 다시 B 에서 Ctrl+Z 를 눌렀더니 B 의 직전 편집이 아니라 A 가 갖고 있던 텍스트 일부가 B 자리에 끼어 들어왔다. 비슷한 시기에, 글자 하나씩 입력했는데 Ctrl+Z 한 번에 단어 다섯 개가 통째로 사라지는 일도 보였다.

증상은 둘이지만 출처가 같았다. `BasicTextField` 의 내부 undo 가 우리 멀티 탭 모델과 서로 다른 시간선 위에서 돌고 있었다.

## 우리는 undo 를 갖고 있지 않았다

PAGE 의 에디터 모델은 처음부터 단일 `TextFieldValue` 였다. 탭이 붙으면서 `OpenTab(path, text, caret, ...)` 로 분리됐고, 활성 탭이 바뀌면 `value` 자체를 통째로 갈아끼우는 식이다.

여기까지는 undo 를 명시적으로 신경 쓰지 않았다. `BasicTextField` 가 알아서 처리하니까. 그런데 그 알아서 는 컴포지션 안 한 인스턴스 수명에 묶인 스택이었다. 활성 탭이 바뀌어 `value` 가 통째로 교체돼도 그 스택은 사라지지 않는다. 다음에 어느 파일에서 Ctrl+Z 를 누르든 같은 스택을 되감는다. 운 좋으면 그냥 한 단계 무시되고, 운 나쁘면 다른 파일의 텍스트가 흘러 들어왔다.

보폭 문제도 같은 출처였다. `BasicTextField` 의 undo 는 입력을 적당히 묶어 한 단계로 친다. 우리 입장에선 너무 크다. 한 글자 단위로 되감기고 싶었다.

## undo 를 응용 계층으로 끌어내리기

해결은 단순했다 undo 를 우리가 직접 들고 있으면 된다. 단, 두 조건이 동시에 만족돼야 한다.

1. 파일별로 분리되어야 한다 탭마다 자기 히스토리를 가진다.
2. `BasicTextField` 내부 undo 가 절대 끼어들지 않아야 한다 그렇지 않으면 두 시간선이 또 어긋난다.

자료구조부터.

```kotlin
data class EditSnapshot(val text: String, val caret: Int)

data class EditHistory(
    val past: List<EditSnapshot> = emptyList(),
    val future: List<EditSnapshot> = emptyList(),
) {
    fun pushBeforeChange(prev: EditSnapshot, maxSize: Int = MAX_SIZE): EditHistory {
        if (past.lastOrNull() == prev) return EditHistory(past, emptyList())
        val grown = past + prev
        val capped = if (grown.size > maxSize)
            grown.subList(grown.size - maxSize, grown.size) else grown
        return EditHistory(capped.toList(), emptyList())
    }
    fun undo(current: EditSnapshot): Pair<EditHistory, EditSnapshot>? {
        val last = past.lastOrNull() ?: return null
        return EditHistory(past.dropLast(1), future + current) to last
    }
    fun redo(current: EditSnapshot): Pair<EditHistory, EditSnapshot>? {
        val last = future.lastOrNull() ?: return null
        return EditHistory(past + current, future.dropLast(1)) to last
    }
    companion object { const val MAX_SIZE = 1000 }
}
```

`past` / `future` 두 스택, 새 편집이 들어오면 `future` 를 비운다. 동일한 스냅샷이 연달아 들어오면 합친다 (텍스트 변화 없이 캐럿만 움직이는 경우). 1000 단계에서 자른다.

이걸 `OpenTab` 한 줄에 끼웠다.

```kotlin
data class OpenTab(
    val path: Path,
    val text: String,
    val savedText: String = text,
    val caret: Int = 0,
    val history: EditHistory = EditHistory(),
)
```

`TabBook` 에 활성 탭의 히스토리에 push / undo / redo 하는 메소드 셋을 추가했다. 활성 탭이 바뀌면 자연스럽게 히스토리도 따라 바뀐다 자료구조가 한 줄이라 분리는 따라온다.

## 보폭은 정책의 영역

보폭 문제는 자료구조가 아니라 정책이다. PAGE 에서는 `onValueChange` 마다 무조건 push 한다. 한 글자 입력이든 붙여넣기든 일단 push. 동일 스냅샷은 push 단계에서 자동 collapse 되므로 빈 push 가 쌓이진 않는다.

다른 에디터들은 보통 짧은 시간 안에 들어온 키 입력을 묶어 하나의 undo 단계로 친다 (intent grouping). 그게 더 똑똑하긴 한데 사용자 입장에서 어디서 끊겼는지 가 비결정적으로 변한다. PAGE 는 일단 단순한 쪽 키 입력 단위 으로 시작했고, 1000 단계 캡 안에서는 충분히 쓸만하다.

## `BasicTextField` 내부 undo 를 끄는 법은 없다

`disableUndo` 같은 파라미터가 있을 줄 알았다. 없다. 검색해 보면 1년 넘게 issue 트래커에서 토론 중이고, 내부 동작을 끄는 공식 경로가 없다.

우회는 이벤트를 더 일찍 가로채는 것이다. Compose 의 `Window.onPreviewKeyEvent` 는 포커스된 위젯이 이벤트를 보기 전에 한 번 발화한다. 거기서 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 를 잡아 우리 히스토리로 처리하고 `true` 를 돌려 이벤트를 소비하면, `BasicTextField` 는 그 키 입력을 보지 못한다.

```kotlin
fun handleShortcut(event: KeyEvent): Boolean {
    if (event.type != KeyEventType.KeyDown) return false
    if (search != null) return false
    if (!event.isCtrlPressed) return false
    return when {
        event.key == Key.Z && !event.isShiftPressed -> { doUndo(); true }
        event.key == Key.Z &&  event.isShiftPressed -> { doRedo(); true }
        event.key == Key.Y                          -> { doRedo(); true }
        else -> false
    }
}
```

`search != null` 분기가 하나 더 있다. Ctrl+R 로 검색바를 띄운 상태라면 검색 / 치환 입력칸은 작은 자체 텍스트필드이고 거기 자체 undo 가 들어 있다. 검색바가 떠 있을 때만 우리 윈도우 핸들러가 빠져주면 입력칸 안 undo 가 살아난다. 작은 디테일이지만 빼먹으면 검색어를 한 글자씩 지우다가 갑자기 본문이 통째로 되감겨버린다.

## 돌아보면

undo 는 IDE 의 가장 무신경한 영역 중 하나다. 잘 동작할 땐 아무도 칭찬하지 않고, 한 번 어긋나면 곧장 데이터 손실로 이어진다. `BasicTextField` 의 undo 를 신뢰하던 시절엔 두 시간선이 어떻게 어긋나는지 보이지 않았다. 알아서 해 주는 추상이 멀티 탭이라는 새 맥락을 못 따라온 것뿐이다.

원칙은 평범했다 내가 통제해야 하는 상태는 라이브러리한테 맡기지 않는다. 다음 기능을 붙이기 전에 한 번 더 확인해 둬야 할 자리를 찾은 셈이다.
