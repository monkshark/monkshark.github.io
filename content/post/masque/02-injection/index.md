---
title: "#2 - 페이지보다 먼저, 그런데 설정을 실어서 주입하기"
description: "document_start·MAIN world 주입의 타이밍 문제, executeScript의 실패, chrome.userScripts와 '사용자 스크립트 허용' 토글, DNR로 헤더 맞추기"
date: 2026-06-14
slug: masque-injection
image:
categories:
    - Masque 개발기
tags:
    - Masque
    - Chrome Extension
    - userScripts
    - Manifest V3
    - declarativeNetRequest
    - 트러블슈팅
    - TypeScript
    - React
draft: false
---

위장의 첫 번째 조건은 단순하다. 가짜 값이 페이지 자신의 스크립트보다 먼저 자리잡아야 한다. 페이지가 `navigator.userAgent`를 읽고 나서 바꿔봤자 이미 늦었다. 그런데 "먼저 박는다"와 "페르소나별 설정을 실어 보낸다"를 동시에 만족시키는 게 생각보다 까다로웠다.

## 가짜 값은 페이지보다 먼저 자리잡아야 한다

조건은 두 개였다. 첫째, `document_start`에 돌아야 한다. 페이지의 첫 인라인 스크립트보다 앞서야 하니까. 둘째, 페이지와 같은 MAIN world에서 돌아야 한다. 확장의 격리된 world에서 navigator를 바꿔봐야 페이지엔 안 보인다.

매니페스트에 정적 content script를 MAIN world·document_start로 박으면 타이밍은 해결된다. 그런데 여기서 막혔다. 정적 content script는 동적인 설정(어떤 페르소나를 쓸지)을 실어 보낼 수가 없고, MAIN world에선 `chrome.storage`도 못 읽는다. 사용자가 고른 페르소나를 어떻게 그 코드 안으로 넣지?

## onCommitted + executeScript는 너무 느렸다

첫 시도는 서비스워커에서 `chrome.webNavigation.onCommitted`를 듣고, 설정을 읽어 `chrome.scripting.executeScript`로 주입하는 거였다. 이론상 내비게이션이 커밋되는 순간 쏘면 되니까.

실제로는 처참하게 늦었다. 핸들러가 `getSettings()`로 storage를 비동기로 읽고, executeScript 메시지가 렌더러까지 왕복하는 사이에, 로컬 페이지의 head 인라인 스크립트는 이미 다 돌아버렸다. 테스트 페이지에서 주입 표시가 "(없음)"으로 떴다. 동기 표면(navigator·screen)을 잡기엔 이 경로는 구조적으로 너무 느렸다.

## chrome.userScripts로 코드를 실어 보냈다

답은 `chrome.userScripts` API였다. 정확히 이 용도 — 동적 설정을 코드 문자열에 담아 MAIN world·document_start에 등록 — 를 위한 물건이다. 위장 함수를 통째로 직렬화하고, 그 뒤에 페르소나와 옵션을 JSON으로 붙여서 즉시 실행되는 한 덩어리로 만들었다.

```js
chrome.userScripts.register([{
  id: 'masque',
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  js: [{ code: `(${applyInPage.toString()})(${JSON.stringify(persona)}, ${JSON.stringify(opts)})` }],
}])
```

여기서 전제는 `applyInPage`가 완전히 self-contained여야 한다는 것이다. `.toString()`으로 떼어내 다른 곳에서 다시 실행되니, 바깥 모듈의 어떤 심볼도 참조하면 안 된다. 그래서 헬퍼를 전부 함수 안에 인라인으로 넣고, 빌드 번들에서 외부 참조가 0인지 확인했다. 설정이 바뀌면 `update`로 다시 등록만 하면 된다.

## 그런데 chrome.userScripts가 undefined였다

빌드해서 로드했는데 여전히 "(없음)"이었다. 로그를 박아 보니 `chrome.userScripts` 자체가 undefined였다.

이게 함정이다. `userScripts` 권한을 매니페스트에 선언해도, 사용자가 확장 세부정보에서 "사용자 스크립트 허용" 토글을 직접 켜기 전까지는 그 API 네임스페이스가 아예 노출되지 않는다. Chrome이 일부러 둔 보안 장치다. 코드로 켤 방법은 없다.

그래서 감지해서 안내하는 쪽으로 갔다. `typeof chrome.userScripts`로 켜졌는지 확인하고, 꺼져 있으면 팝업·옵션에 경고 배너와 설정 페이지 바로가기를 띄운다. 우리가 할 수 있는 건 감지·안내·딥링크까지고, 마지막 한 번은 사용자가 켜야 한다.

## JS와 헤더가 어긋나면 안 된다

JS 표면을 다 바꿔도, HTTP 헤더가 진짜 User-Agent를 흘리면 앞서 경계한 그 모순이 그대로 생긴다. 헤더는 userScripts로 못 만지니 별도 경로가 필요했다.

`chrome.declarativeNetRequest` 동적 규칙으로 User-Agent·Accept-Language·sec-ch-ua 계열 헤더를 같은 페르소나 값으로 덮었다. 주입은 userScripts, 헤더는 DNR — 경로는 둘이지만 출처는 하나의 페르소나다. 그래서 JS에서 읽는 값과 서버가 받는 헤더가 항상 같은 사람을 가리킨다. 일관성이라는 원칙이 여기서 실제 구현으로 떨어졌다.

## 돌아보면

"페이지보다 먼저"와 "동적 설정을 실어서"는 얼핏 양립하기 어려운 요구였다. 정적 content script는 앞은 빠르지만 설정을 못 싣고, executeScript는 설정은 싣지만 너무 느렸다. 그 사이를 정확히 메우는 게 userScripts였고, 대신 사용자가 토글을 켜야 한다는 비용이 따라왔다. 결국 주입은 타이밍·동적성·탐지 가능성의 삼각형이었고, 어느 꼭짓점도 공짜가 아니었다.
