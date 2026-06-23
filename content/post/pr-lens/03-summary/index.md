---
title: "#3 - 요약을 온디바이스로, 네 엔진을 한 입구로"
description: "기본은 기기 안에서 도는 무료 모델, 클라우드는 옵트인 — Chrome 내장·WebLLM·Gemini·Claude 를 한 스트리밍 인터페이스 뒤에 세우고 출력은 한국어로 고정한 이야기"
date: 2026-06-23T12:00:00+09:00
slug: pr-lens-summary
image:
categories:
    - PR Lens 개발기
tags:
    - PR Lens
    - Chrome Extension
    - 온디바이스 AI
    - WebGPU
    - Claude API
    - 코드 리뷰
    - TypeScript
draft: false
---

마지막으로 얹은 건 PR 요약이다. 어려운 건 요약 자체가 아니라, "공짜로, 키 없이, diff 를 밖으로 안 보내고"와 "필요하면 최고 품질로"를 한 버튼 뒤에 같이 두는 일이었다.

## 기본은 온디바이스, 클라우드는 옵트인

PR 을 AI 로 요약하려면 보통 diff 를 외부 모델로 보낸다. 코드 리뷰 도구가 매번 변경 내용을 남의 서버로 흘리는 건 기본값으로 두기엔 부담스러웠다. 그래서 기본 엔진을 브라우저 안에서 도는 모델로 잡았다.

엔진은 넷이다. Chrome 내장 모델(Gemini Nano)은 키도 비용도 없이 기기 안에서 돌고, WebLLM 은 WebGPU 로 브라우저 안에서 도는데 첫 사용 때 가중치를 한 번 받아 캐시한 뒤로는 오프라인으로도 된다. 더 안정적인 클라우드가 필요하면 무료 키의 Gemini, 최고 품질이 필요하면 자기 키의 Claude 를 옵트인으로 고른다. 기본은 아무것도 안 나가고, 무언가 나가는 선택은 사용자가 직접 켠다.

## 네 엔진을 한 모양으로

엔진마다 호출법이 딴판이다. 내장 모델은 세션을 만들어 스트림을 reader 로 읽고, WebLLM 은 OpenAI 풍 `chat.completions` 스트림, Gemini 는 날 SSE 를 직접 파싱, Claude 는 공식 SDK 의 `messages.stream` 을 쓴다. 이걸 호출부에 그대로 노출하면 UI 가 엔진 수만큼 갈라진다.

그래서 전부 같은 모양으로 감쌌다. system·user 프롬프트를 받아, 토큰이 올 때마다 `onChunk` 로 흘려보내는 함수. 안쪽이 SSE 든 SDK 든, 바깥에서 보면 똑같이 "조각이 스트리밍된다"가 된다.

```ts
const stream = session.promptStreaming(user)
const reader = stream.getReader()
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  if (value) onChunk(value)
}
```

## 입력은 diff, 출력은 한국어 고정

요약할 재료는 GitHub REST API 에서 가져온다. PR 메타와 변경 파일을 페이지네이션으로 긁고(비공개 저장소나 rate limit 은 PAT 로 푼다), 너무 길면 정해둔 길이에서 자른 뒤 "이후 생략" 을 표시한다.

프롬프트는 출력 형식을 못박는다. UI 언어가 영어든 한국어든 요약 본문은 한국어로 고정하고, "한 줄 요약 / 핵심 변경점 / 리뷰 포인트" 세 섹션의 마크다운으로만 답하게 한다. 작은 온디바이스 모델일수록 형식을 흔들기 쉬워서, 자유도를 줄이는 쪽이 결과가 안정적이었다. 한 번 생성한 요약은 PR 별로 저장해, 다시 들어오면 곧바로 보여준다.

## 돌아보면

3부의 핵심은 모델이 아니라 입구였다. 성능과 프라이버시가 다른 네 엔진을 같은 한 줄 인터페이스 뒤에 세우고, 그 입구의 기본값을 "기기 안, 무료, 아무것도 안 나감"으로 둔 것. 더 좋은 걸 원하면 키를 꽂아 옵트인하면 되고, 아무것도 안 하면 가장 안전한 쪽이 작동한다. 도구가 사용자 대신 내리는 기본 선택이 가장 정직해야 한다는 게, 이 프로젝트 내내 지킨 원칙이었다.
