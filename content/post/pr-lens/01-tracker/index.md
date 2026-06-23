---
title: "#1 - 큰 PR 은 어디까지 봤는지부터 잃는다"
description: "본 파일을 PR 별로 기억하는 트래커, 진행률, 그리고 페이지를 새로 안 띄우는 SPA 위에서 패널을 제때 올리는 법"
date: 2026-06-23T10:00:00+09:00
slug: pr-lens-tracker
image:
categories:
    - PR Lens 개발기
tags:
    - PR Lens
    - Chrome Extension
    - GitHub
    - 코드 리뷰
    - Manifest V3
    - 프로젝트 시작
    - TypeScript
draft: false
---

PR Lens 는 GitHub 의 큰 Pull Request 를 리뷰할 때 "어디까지 봤는지"를 잃지 않게 돕는 Chrome 확장이다. Files changed 페이지에 바뀐 파일 트리를 띄우고, 본 파일을 PR 별로 기억하고, 남은 진도를 항상 보여준다. 한 줄로 줄이면, 수십 개 파일 diff 사이에서 길을 잃지 않게 하는 도구다.

## 큰 PR 은 기능보다 진도를 먼저 잃는다

파일이 마흔 개쯤 되는 PR 을 열면, 스크롤을 내리다 방금 본 파일이 어디였는지, 무엇이 남았는지 금세 흐려진다. 새로고침하거나 다른 PR 을 들렀다 오면 그 감각은 통째로 리셋된다. 그래서 첫 목표는 화려한 게 아니라 단순했다. 본 파일을 기억하고, 남은 게 몇 개인지 늘 보이게.

## 패널은 페이지에 얹고, 상태는 PR 에 붙인다

Files changed 페이지에 떠 있는 패널을 하나 주입한다. 바뀐 파일을 전부 나열하고, 각 줄에 +/- 수치와 "본 파일" 체크박스, 위에는 "Seen N/M today" 진행 바를 둔다. 줄을 클릭하면 그 파일 diff 로 곧장 스크롤한다.

기억은 PR 단위로 묶어야 의미가 있다. URL 에서 PR 을 식별해 키로 삼고, 그 키 밑에 본 파일을 저장한다.

```ts
export function parsePrUrl(pathname: string) {
  const m = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m) return null
  const [, owner, repo, num] = m
  return { owner, repo, number: Number(num), prKey: `${owner}/${repo}#${num}` }
}
```

상태는 `chrome.storage.local` 에 `pr:owner/repo#번호` 키로 들어간다. 체크 한 번이 `{ seen: true, at }` 로 박히고, 새로고침하든 며칠 뒤 다시 오든 그대로 복원된다.

## GitHub 는 페이지를 새로 안 띄운다

여기서 막혔다. content script 는 페이지가 로드될 때 한 번 돈다. 그런데 GitHub 는 SPA 라, PR 목록에서 Files changed 로 넘어가도 페이지가 새로 뜨지 않는다. `pushState` 로 URL 만 갈아끼운다. 그러면 스크립트는 처음 들어온 그 순간에 멈춰 있고, 패널은 영영 안 뜬다.

그래서 history 를 후킹했다. `pushState`·`replaceState` 를 감싸 호출될 때마다 자체 이벤트를 쏘고, `popstate` 까지 묶어 네비게이션을 직접 감지한다.

```ts
for (const key of ['pushState', 'replaceState'] as const) {
  const original = history[key]
  history[key] = function (...args) {
    const result = original.apply(this, args)
    window.dispatchEvent(new Event('gh-prh-loc'))
    return result
  }
}
```

이벤트가 오면 300ms 디바운스 뒤 현재 경로가 Files changed 인지 확인하고, 맞으면 패널을 띄운다. 같은 PR 안에서의 이동이면 다시 그리지 않고 스캔만 갱신하고, 다른 PR 로 갔으면 헐고 새로 짓는다.

## 돌아보면

1부에서 만든 건 결국 두 가지다. 본 파일을 PR 에 묶어 기억하는 것, 그리고 페이지가 새로 뜨지 않는 SPA 위에서도 그 기억을 제때 띄우는 것. 리뷰 보조라는 말은 거창하지만, 실제로 사람을 편하게 한 건 "어디까지 봤더라"를 대신 들고 있어 주는 이 단순한 영속성이었다.
