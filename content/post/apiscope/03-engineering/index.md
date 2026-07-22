---
title: "#3 - eval이 Promise를 안 기다려서, 전역에 써두고 폴링했다"
description: "권한 0으로 재전송하기(inspectedWindow.eval + 폴링), HTTP/2 의사헤더, --compressed, 순수 함수 테스트, 퍼저까지"
date: 2026-06-10
slug: apiscope-engineering
image:
categories:
    - APIScope 개발기
tags:
    - APIScope
    - DevTools
    - HTTP
    - 테스트
    - 트러블슈팅
    - TypeScript
    - React
draft: false
---

1부에서 못 박은 "최소권한"이, 사실은 3부의 모든 고생을 미리 예약해 둔 셈이었다. 권한을 안 받기로 했으니, 보통 권한으로 푸는 것들을 전부 우회로 풀어야 했다.

## 권한 없이 요청을 다시 쏘기

"요청을 고쳐서 다시 보낸다"는 Postman의 핵심이다. 보통은 host 권한을 받아 백그라운드에서 아무 오리진에나 fetch를 쏜다. 하지만 그건 "네트워크를 가로채지 않는다"는 약속을 깨는 일이었다.

그래서 다른 길을 골랐다. `chrome.devtools.inspectedWindow.eval`로, 검사 중인 페이지 안에서 직접 fetch를 실행하는 것이다. 페이지가 자기 오리진으로 보내는 요청이라 쿠키·세션·CORS를 페이지가 알아서 처리해 주고, 확장은 추가 권한을 한 톨도 안 받는다. "이 사이트 API를 값만 바꿔 다시 찔러본다"는, 실제로 제일 흔한 시나리오가 이걸로 그대로 커버됐다.

## eval은 Promise를 기다려 주지 않는다

문제는 여기서 터졌다. inspectedWindow.eval은 표현식의 값을 돌려주는데, async fetch가 돌려주는 Promise를 기다려 주지 않는다. 아직 끝나지 않은 Promise가 그대로 넘어와서, 결과를 받을 방법이 없었다.

돌아서 갔다. eval로 페이지 전역에 결과를 써두고, 그걸 폴링으로 읽는 방식이다.

```js
(() => {
  window.__result = '__pending__';
  (async () => {
    const r = await fetch(url, init);
    const body = await r.text();
    window.__result = JSON.stringify({ status: r.status, body });
  })();
  return 'started';
})()
```

그러고 나서 `window.__result`를 짧은 간격으로 다시 eval해, `__pending__`이 아니게 되는 순간을 잡는다. 비동기를 동기 폴링으로 묶어, 결국 권한 없이도 재전송이 돌아갔다.

## cURL이 실행이 안 됐다

내가 만들어 준 cURL을 실제로 터미널에 붙여 넣어 봤더니 그냥 안 됐다. 원인을 따라가 보니, Chrome DevTools가 주는 HAR 안에는 `:authority`·`:method`·`:path`·`:scheme` 같은 HTTP/2 의사헤더가 섞여 있었다. 이걸 그대로 `-H`로 내보내니 curl이 거부한 것이다. 그래서 헤더를 정규화하는 단계에서 `:`로 시작하는 헤더를 전부 걸러냈더니, 화면 표시도 변환도 export도 한꺼번에 깨끗해졌다.

한 가지가 더 있었다. 요청에는 `accept-encoding: gzip`이 들어 있는데 cURL에 `--compressed`가 없으면, 서버가 압축해서 보낸 응답을 curl이 풀지 못해 화면이 깨진다. 그래서 변환할 때 `accept-encoding` 헤더는 빼고 대신 `--compressed`를 붙이게 했다. 사소하지만 "그냥 안 되던" 진짜 이유였다.

## 테스트는 순수 함수에 기댔다

마스킹·변환·필터·파싱·해시처럼 판단이 들어가는 로직은 전부 브라우저 API에 의존하지 않는 순수 함수로 떼어냈다(`src/core`). 덕분에 cURL 이스케이프, Luhn 카드 감지, base64url 왕복, JWT 디코드, 퍼즈 범위 확장 같은 걸 136개 테스트로 묶어 둘 수 있었다. UI는 chrome.devtools를 목으로 바꿔 jsdom에서 컴포넌트 테스트로 돌렸는데, 가상 스크롤이 jsdom에서 행을 0개로 그려 버리는 함정이 있어 offsetHeight를 폴리필해 줘야 했던 건 덤이었다.

## 같은 엔진 위에 얹은 워게임 도구

재전송 엔진이 생기니, 그 위에 연습용(인가된 워게임/CTF) 도구를 얹는 건 자연스러웠다. `${}` 마커 자리에 `1..100` 같은 페이로드를 순차로 밀어 넣어 응답의 길이·상태가 튀는 행을 자동으로 강조하는 Intruder형 퍼저, 토큰을 까보는 인코더/디코더와 해시, payload만 고치면 토큰을 다시 조립해 주는 JWT 에디터까지 전부 권한 0 재전송 위에서 돈다. 남용을 막으려고 단일 타깃과 딜레이를 두고, 인가된 환경 전용임을 분명히 적어 뒀다.

## 돌아보면

결국 3부의 어려움은 대부분 "권한을 안 받는다"는 1부의 한 줄에서 흘러나왔다. 그런데 그 제약을 우회하는 과정 자체 페이지 안에서 eval로 쏘고, 의사헤더를 걷어내고, 응답을 폴링으로 받는 가 결국 이 도구를 남들과 다르게 만든 부분이기도 했다. 제약을 정체성으로 받아들이면, 우회가 차별점이 된다.
