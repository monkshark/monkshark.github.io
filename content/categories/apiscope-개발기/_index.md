---
title: "APIScope 개발기"
description: "브라우저 DevTools 안에서 API 요청을 잡아 검색·마스킹·변환·재현하는 Chrome 확장 개발기입니다. 네트워크를 가로채지 않는 최소권한(chrome.devtools API만 사용)을 정체성으로 삼아, inspectedWindow.eval + 폴링으로 권한 0 재전송을 구현하고, 토큰 자동 마스킹과 cURL/HTTPie/Postman 변환, 인가된 환경용 퍼저까지 얹었습니다."
slug: "apiscope"
image: "icon.png"
---
