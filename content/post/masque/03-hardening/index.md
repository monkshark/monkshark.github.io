---
title: "#3 - 위장을 들키지 않기, 그리고 확장의 천장"
description: "toString 마스킹·마커 제거·iframe/worker 우회 차단, 끝없는 표면 확장, 폰트는 측정값만 흔들기, 그리고 확장 레벨에서 못 넘는 벽"
date: 2026-06-15
slug: masque-hardening
image:
categories:
    - Masque 개발기
tags:
    - Masque
    - 안티 핑거프린팅
    - WebGL
    - Canvas
    - Web Worker
    - 프라이버시
    - TypeScript
    - React
draft: false
---

값을 바꾸는 것보다 어려운 건, 바꿨다는 사실 자체를 숨기는 것이었다. 그리고 표면을 하나 막을 때마다 새로운 우회로가 보였다. 그 군비경쟁, 그리고 결국 확장으로는 못 넘는 천장에 대한 이야기다.

## 위장은 흔적을 남긴다

값만 덮으면 끝이 아니다. 수집기는 "이 함수가 네이티브인가"를 물어볼 수 있다. 우리가 `getParameter`를 갈아끼우면 `WebGLRenderingContext.prototype.getParameter.toString()`이 `[native code]`가 아니라 우리 소스를 뱉는다. 그 순간 위장이 들킨다.

그래서 `Function.prototype.toString` 자체를 패치해, 우리가 손댄 함수는 네이티브처럼 보고하게 했다.

```js
const map = new WeakMap()
const nativeToString = Function.prototype.toString
Function.prototype.toString = function () {
  if (map.has(this)) return map.get(this)
  return nativeToString.call(this)
}
```

손댄 함수마다 `map.set(fn, 'function getParameter() { [native code] }')`로 등록해 두는 식이다. 흔적은 더 있었다. 초기엔 `window.__masque`라는 전역 마커를 심어 뒀는데, 이건 말 그대로 "나 Masque 켜져 있어요"라고 광고하는 셈이라 지우고 클로저 WeakSet으로 옮겼다. 속성도 인스턴스가 아니라 원래 네이티브 getter가 사는 프로토타입에 정의해, descriptor 위치까지 진짜와 맞췄다.

## iframe과 worker로 새어나간다

페이지가 직접 `navigator`를 안 읽고, 동적으로 만든 `about:blank` iframe의 `contentWindow.navigator`를 읽으면 그 프레임은 우리 손이 안 닿은 진짜 값을 준다. 그래서 `contentWindow`·`contentDocument` 접근자를 후킹해, 자식 프레임에 접근하는 순간 거기에도 위장을 다시 입혔다.

Web Worker는 더 까다로웠다. 워커는 자기만의 realm이라 MAIN world 주입이 안 닿는다. `new Worker(url)`을 가로채, 위장 프리루드를 앞에 붙인 블롭으로 감싸 원본을 `importScripts`하게 했다. navigator·타임존·WebGL·OffscreenCanvas까지 워커 안에서도 같은 페르소나로 맞췄다. 단 이건 동일 출처·CORS 워커에서만 된다 — 이 한계는 뒤에서 다시 나온다.

## 표면은 끝이 없다

하나를 막으면 다음이 보였다. 그리고 앞서 본 대로, 막다 만 표면은 새로운 모순을 만든다.

타임존이 그랬다. `getTimezoneOffset`과 `Intl`은 뉴욕으로 바꿔놨는데 `new Date().toString()`은 여전히 "Korean Standard Time"을 흘리고 있었다. 우리가 직접 모순을 만든 것이다. 그래서 `Date.prototype`의 `toString`·`toLocaleString` 계열까지 페르소나 타임존 기준으로 다시 짰다(서머타임은 `Intl`로 계산). 그 외에도 canvas·audio·OffscreenCanvas·AnalyserNode 파블링, plugins·mimeTypes, mediaDevices, connection, speechSynthesis 음성 목록, storage quota, keyboard 레이아웃, WebGPU 어댑터, 배터리, WebGL 확장 목록까지 — 표면별 토글로 하나씩 덮어 나갔다.

## 폰트는 목록을 못 바꾼다, 측정값만 흔든다

폰트는 엔트로피가 큰데 위험했다. 설치된 폰트 목록을 위조하면 그 폰트에 의존하는 사이트가 깨진다. 그래서 Brave식으로, 목록과 렌더링은 그대로 두고 폰트 탐지에 쓰이는 측정 API만 흔들었다.

`getBoundingClientRect`와 `measureText`의 반환값에, 측정값과 출처를 키로 한 sub-pixel 노이즈를 더했다. 같은 페이지에선 같은 값이 나와 레이아웃이 흔들리거나 재측정으로 들키지 않고, 사이트가 바뀌면 노이즈가 달라져 정밀 측정 벡터로 추적당하는 걸 끊는다. 정수인 `offsetWidth`는 일부러 안 건드렸다 — 레이아웃을 깨니까. 대신 솔직히 적었다. 이 방식은 정밀 벡터는 깨지만 "그 폰트가 설치돼 있나"라는 불리언까지 완전히 가리진 못한다.

## 확장의 천장

밀고 나가다 보니 확장으로는 절대 못 넘는 벽이 분명해졌다.

교차 출처 Worker는 못 막는다. 깔끔히 하려면 워커 스크립트의 응답 본문을 고쳐 프리루드를 끼워야 하는데, MV3의 declarativeNetRequest는 응답 본문 수정을 지원하지 않는다. 완전한 탐지 회피도 원리상 불가능하다 — 같은 realm에서 JS로 JS를 속이는 한 잔흔이 남는다. IP·네트워크는 아예 손이 안 닿고, "거대한 동일 사용자 군중"도 못 만든다.

이건 전부 엔진 레벨의 영역이다. Brave는 Chromium을 포크해 C++에서 farbling을 구현하고, Tor는 엔진에 탐지 회피를 넣고 그 위에 Tor 네트워크와 수백만 동일 사용자를 얹는다. 확장은 같은 realm 안의 차선책일 수밖에 없다. 그래서 README에도 "더 강한 게 필요하면 Mullvad나 Tor를 써라"라고 적어 뒀다.

## 깨지면 끌 수 있게

장치 정보로 거짓말하는 이상, 그 정보가 진짜 필요한 사이트는 깨진다. 이건 해결이 아니라 트레이드오프라, 사용자가 조절할 수 있게 만드는 쪽으로 갔다.

표면별 토글, 도메인별 예외, 그리고 타임존·언어·코어·메모리·DPR을 직접 고르는 override(유효한 값만 드롭다운으로). Worker 하드닝처럼 사이트를 깨뜨릴 수 있는 건 끄기 쉽게 뒀고, "사용자 스크립트 허용"이 꺼져 있으면 배너로 안내한다. 완벽히 숨기는 것보다, 어디까지 숨길지를 사용자가 정하게 하는 게 현실적이었다.

## 돌아보면

3부 내내 한 일은 결국 두 가지였다. 표면을 하나씩 더 덮고, 덮었다는 흔적을 지우는 것. 그러다 만난 천장은 코드를 더 잘 짜서 넘는 게 아니라, 레이어 자체를 바꿔야(엔진을 포크하거나 Tor를 쓰거나) 넘는 거였다. 확장으로 할 수 있는 건 거의 다 했다는 결론과, 그게 어디까지인지를 정직하게 적어두는 것 — 처음에 정한 best-effort라는 약속을 마지막까지 지킨 셈이다.
