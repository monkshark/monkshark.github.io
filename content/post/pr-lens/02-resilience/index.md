---
title: "#2 - 남의 DOM 위에 세 들어 산다"
description: "셀렉터 폴백 사다리, 못 찾으면 조용히 비우는 graceful degrade, 그리고 자기가 일으킨 변화에 자기가 반응하지 않는 MutationObserver"
date: 2026-06-23T11:00:00+09:00
slug: pr-lens-resilience
image:
categories:
    - PR Lens 개발기
tags:
    - PR Lens
    - Chrome Extension
    - GitHub
    - DOM
    - MutationObserver
    - 코드 리뷰
    - TypeScript
draft: false
---

패널을 띄우는 건 쉬웠다. 어려운 건, 그 패널이 남의 페이지 위에서 GitHub 가 마크업을 바꿔도, diff 를 천천히 그려도 깨지지 않고 버티게 하는 것이었다.

## 셀렉터는 한 곳에 모으고, 사다리로 쌓는다

확장은 GitHub DOM 에 기댄다. 그런데 GitHub 는 자기 마크업을 수시로 바꾼다. 클래스 이름이 갈리고, `data-testid` 가 생겼다 없어지고, 같은 시기에 옛 마크업과 새 마크업이 섞여 나오기도 한다. 셀렉터를 코드 곳곳에 흩뿌리면 그 변화 한 번에 전부 무너진다.

그래서 DOM 을 읽는 지점을 셀렉터 모듈 하나로 모았다. 파일 컨테이너는 후보를 여러 개 묶어, 신·구 마크업을 한꺼번에 받는다.

```ts
fileContainer: [
  'div.file.js-file',
  'div.file[data-tagsearch-path]',
  '[data-testid="file-diff"]',
  '[class*="diffTargetable"]',
].join(',')
```

파일 경로를 뽑을 때도 한 방법에 걸지 않았다. `data-tagsearch-path` 속성 → 앵커 텍스트 → `Diff for:` 표 라벨 → 내부 속성 → 파일 헤더 링크 title 순으로 내려가며, 하나가 실패하면 다음을 시도한다. 수치(+/-)도 같은 식으로 `aria-label` → 색상 클래스 → 옛 diffstat 까지 폴백을 깔았다.

## 못 찾으면, 조용히 비운다

폴백을 다 내려가도 아무것도 못 찾는 날은 온다. 그럴 때 절대 하지 말아야 할 건, 에러를 던져 GitHub 페이지 자체를 망가뜨리는 것이다. 그래서 파일을 하나도 못 찾으면 패널은 깨지는 대신 "바뀐 파일 없음" 안내를 띄운다. 내가 못 읽는 게 사용자 페이지를 부수는 일이 되면 안 된다.

## 내가 일으킨 변화에 내가 반응하지 않기

GitHub 는 diff 를 한 번에 안 그린다. 스크롤하면 파일이 점점 붙는다. 그래서 DOM 변화를 `MutationObserver` 로 지켜보다 다시 스캔해야 한다. 그런데 함정이 있다. 패널과 체크박스를 주입하는 것도 DOM 변화라, 내 주입이 옵저버를 깨우고, 그게 또 재스캔과 재주입을 부르는 무한 루프가 된다.

두 겹으로 막았다. 변화가 전부 내 패널 안에서 난 거면 무시하고,

```ts
function isOwnMutation(records) {
  return records.every((r) => {
    const t = r.target
    return !!(t.closest?.('#gh-prh-panel') || t.closest?.('.gh-prh-seen'))
  })
}
```

재스캔하는 동안에는 옵저버를 잠시 끊었다가, 끝나고 다시 잇는다. 내가 만든 변화가 나를 다시 깨우지 못하게.

또 매번 목록을 통째로 다시 그리면 깜빡이고 느리다. 그래서 파일 경로와 수치로 시그니처를 만들어, 지난번과 같으면 "봤음" 표시만 토글하고 DOM 은 건드리지 않는다.

## 돌아보면

2부는 기능이 아니라 규율에 대한 얘기였다. 남의 DOM 위에 세 들어 사는 코드는, 집주인이 벽을 옮겨도 버티고(폴백 사다리), 못 버틸 땐 조용히 비키고(graceful degrade), 자기가 일으킨 먼지에 자기가 기침하지 않아야(자기 변경 무시) 한다. 화면에 안 보이는 이 세 가지가 패널을 오래 살아남게 한 진짜 이유였다.
