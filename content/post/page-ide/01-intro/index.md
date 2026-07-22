---
title: "#1 - 왜 또 IDE를 만드나"
description: "VSCode와 Claude Code 시대에 직접 만드는 데스크톱 IDE — 컨셉, 기술 스택, 다언어 전략의 첫 정리"
date: 2026-05-03
slug: page-ide-intro
image:
categories:
    - PAGE 개발기
tags:
    - PAGE
    - Kotlin
    - Compose Desktop
    - LSP
    - 프로젝트 시작
draft: false
---

새 프로젝트를 시작했다. 이름은 PAGE, 데스크톱 IDE다.

VSCode가 있고, JetBrains가 있고, Zed가 있고, 심지어 Claude Code도 있다. 그럼에도 또 하나의 에디터를 만든다는 게 합리적인 일인지 스스로도 몇 번 되물었다. 결국 시작한 이유는 단순했다. 지금의 에디터들은 내가 코드를 어떻게 짜는지에 대해 너무 무관심하다.

## 기존 에디터들이 답답한 지점들

오래 코드를 만지면서 누적된 불만이 네 가지 있다.

AI 도구가 외주 같다. Claude Code를 자주 쓴다. 강력하고, 놀라울 정도로 똑똑하다. 다만 작업 단위가 명확하다. 명령을 주면 결과가 오고, 세션이 끝나면 사라진다. 옆에 상주하면서 내 코드를 함께 보는 동료라기보다는, 부르면 오는 외주 엔지니어에 가깝다. 코드를 쓰는 그 순간에 곁에서 관찰하고 짧게 거들어주는 모드가 없다.

코드 구조가 보이지 않는다. 파일 트리는 디렉터리 구조일 뿐이다. 어떤 모듈이 어떤 모듈을 부르는지, 의존이 어떻게 흐르는지, 화면에 띄워주는 에디터를 거의 못 봤다. 머릿속에 직접 그래프를 그리면서 일한다.

내 작업의 흐름이 사라진다. Git 커밋은 결과 스냅샷이다. 그 사이에 어떤 시도를 하고, 무엇을 지웠고, 어디서 막혔는지의 시간축은 어디에도 남지 않는다. 한 시간 전의 나에게 묻고 싶을 때가 자주 있는데, 답해줄 도구가 없다.

UI가 작업 도구로서만 존재한다. 매일 8시간 보는 화면인데, 미적으로는 거의 0의 투자를 받는다. 기능은 갖췄지만 보고 싶은 화면은 아니다.

이 네 가지 중 한두 개는 어딘가의 에디터가 부분적으로 풀고 있다. 다 동시에 푸는 건 본 적이 없다.

## 다른 선택지는 없었나

처음에는 플러그인으로 풀어볼까 했다. JetBrains 플러그인, VSCode extension. 둘 다 검토했고 둘 다 포기했다.

- 코드 그래프나 시간축 같은 기능은 호스트 에디터의 렌더링 모델에 깊이 들어가야 한다. 플러그인 API가 허락하는 범위 밖이다.
- AI 동행 모드는 에디터의 입력 이벤트 스트림 전체를 봐야 한다. 플러그인은 이벤트 일부만 본다.
- 디자인 통제. 글래스모피즘 UI를 플러그인으로 만들면 결국 호스트 테마와 충돌한다.

그래서 통째로 새로 짜는 쪽으로 결정했다. 비합리적인 선택일 수 있다는 건 안다. 다만 부분적으로 푸는 것보다 빠를 거라고 판단했다.

## 컨셉: PAGE

핵심 가치 네 가지의 앞글자를 모았다.

- Pair AI 동반자. 관찰자 / 대화 / 에이전트 / 튜터 네 가지 모드.
- Atlas 코드 그래프 시각화. 모듈, 함수, 의존성을 공간으로.
- Glass 글래스모피즘 UI. 작업 도구이면서 보고 싶은 화면.
- Echo 키스트로크 타임라인. 작업의 시간축을 그대로 저장하고 되감기.

이 네 가지를 한 번에 다 내놓는다는 뜻은 아니다. 마일스톤을 네 단계로 쪼갰고, 첫 단계에서는 "예쁜 다언어 에디터" 하나만 완성하는 것을 목표로 한다. 나머지 셋은 그 위에 한 층씩 얹는다.

이름은 의도적으로 영단어 "page"와 겹친다. 한 페이지에서 네 가지 차원을 다 본다는 뜻을 살리고 싶었다.

## 기술 스택 결정

자바를 가장 오래 썼다. JVM 안에서 풀고 싶었다. 그래서 Kotlin + Compose Multiplatform Desktop으로 갔다.

```kotlin
kotlin {
    jvmToolchain(21)
}

dependencies {
    implementation(compose.desktop.currentOs)
    implementation("org.eclipse.lsp4j:org.eclipse.lsp4j:0.21.0")
    implementation("org.eclipse.jgit:org.eclipse.jgit:6.9.0.202403050737-r")
    implementation("org.xerial:sqlite-jdbc:3.45.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
```

결정적인 이유 세 가지.

- Compose Desktop은 JetBrains Fleet의 스택과 같다. 데스크톱급 에디터를 띄울 수 있다는 산 증거가 있다는 게 컸다.
- JVM 생태계의 라이브러리를 그대로 쓴다. LSP4J, JGit, SQLite JDBC, OkHttp. 다른 스택을 골랐으면 이 중 절반은 직접 다시 짜야 했다.
- GPU 합성 + 글래스모피즘. Skia 기반이라 블러/투명도 효과를 60fps로 끌고 갈 수 있다. Swing이었으면 포기했을 항목이다.

Tauri(Rust)나 Electron도 후보였다. Tauri는 LSP/Tree-sitter/JGit을 다 직접 붙여야 했고, Electron은 기본 메모리 비용이 IDE에는 무거웠다. 둘 다 한 번씩 손에 잡고 보고 빠졌다.

## 다언어, 어떻게

이 IDE의 첫 약속은 "주요 언어 30개를 기본으로 켠다"이다. 직접 30개의 분석기를 짤 생각은 없다.

- 언어 정의는 JSON 한 개로. 확장자, 트리시터 그래머, LSP 서버 명령, 디버거 어댑터 한 파일로 끝낸다.
- LSP 서버는 PATH에서 자동 감지. 사용자가 `pyright`를 깔면 파이썬이 자동으로 켜진다. 직접 등록할 필요 없다.
- 부재 시 정중히 안내. 서버가 없으면 빨간 에러 대신 "이걸 깔면 켜집니다" 한 줄과 클릭 한 번 설치를 보여준다.

예를 들어 Dart/Flutter 정의는 이렇게 들어간다.

```json
{
  "id": "dart",
  "extensions": [".dart"],
  "treeSitter": "tree-sitter-dart",
  "lsp": {
    "command": ["dart", "language-server", "--protocol=lsp"],
    "rootMarkers": ["pubspec.yaml"]
  },
  "frameworks": ["flutter"]
}
```

추가하고 싶은 언어가 있으면 JSON 한 줄을 더하는 정도로 끝나야 한다. 그게 이 구조의 가치다.

## 다음 글에서는

PAGE의 모듈 구조를 갈랐다. core / editor / language / workspace / ui / atlas / echo / pair / runtime 왜 이렇게 나눴고, 모듈 간 직접 의존을 어떻게 차단했는지, 그리고 그 경계가 나중에 Atlas의 그래프 노드가 되는 이유를 다음 글에서 다룬다.

돌이켜보면, 새 도구를 만들겠다는 결정은 늘 비슷한 모양으로 온다. 기존의 답답함이 누적되다가, 어느 날 "이건 통째로 다시 짜는 게 빠르다"라는 한 줄이 머리에 박힌다. 그 한 줄로 시작했다. 이제부터의 기록이 그 한 줄이 옳았는지를 증명하거나, 부수거나 할 것이다.
