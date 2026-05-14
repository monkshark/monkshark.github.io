---
title: "#8 - top-level object 이름을 바꾸려다 fork 까지 간 경위"
description: "kotlin-language-server 의 rename 이 top-level object 에서 NoTopLevelDescriptorProvider 로 죽는다. 한 줄 분기를 넓히기 위해 KLS 를 fork 해서 가져온 회고"
date: 2026-05-14T09:30:00+09:00
slug: page-ide-kls-fork-top-level-object-rename
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "LSP", "kotlin-language-server", "rename", "fork"]
---

심볼 위에 캐럿을 두고 `Shift+F6` 을 누르면 이름을 바꾸는 다이얼로그가 뜬다. 그건 LSP 의 `textDocument/rename` 가 받아서 워크스페이스 전체에 걸친 `WorkspaceEdit` 으로 돌려준다.

PAGE 에 붙인 kotlin-language-server 는 거의 다 잘 해 줬다. `class` 도, 함수도, 프로퍼티도, 로컬 변수도. 단 하나가 안 됐다 — top-level `object` 가 죽었다.

이 글은 KLS 의 한 분기를 한 클래스만큼 넓히기 위해 fork 를 떠 와 PAGE 에 번들하기까지의 회고다. 코드 변경은 한 줄이었다. 그 한 줄을 PAGE 의 빌드에 꽂는 과정이 한 줄보다 훨씬 길었다.

## 죽는 자리

테스트 샘플의 `object Hello` 위에서 `Shift+F6` 을 누르면 PAGE 의 콘솔에 KLS 서버가 던진 스택 트레이스가 줄줄이 흘렀다. 핵심 한 줄.

```
kotlin.NotImplementedError: TopLevelDescriptorProvider not found
    at org.jetbrains.kotlin.resolve.lazy.NoTopLevelDescriptorProvider...
    at ...LazyTopDownAnalyzer.analyzeDeclarations...
    at org.javacs.kt.CompiledFile.contentAndOffsetFromElement...
```

`CompiledFile.contentAndOffsetFromElement` 가 호출자다. KLS 가 `prepareRename` / `rename` 을 처리할 때 선언 식별자 토큰 자리에 가짜 reference 표현식 을 끼워 분석기를 한 번 더 돌리는 단계인데, 거기서 `LazyTopDownAnalyzer` 가 top-level 컨텍스트의 descriptor provider 를 못 찾고 죽는 거였다.

`class` 일 때는 안 죽는다. 같은 자리에 `class Hello` 가 있으면 rename 이 정상 동작했다. 그래서 시야가 한쪽으로 좁혀졌다.

## KLS 가 어떻게 처리하는가

`CompiledFile.contentAndOffsetFromElement` 의 로직은 (단순화하면) 이렇다.

- 사용자가 선언 식별자 자리에서 어떤 액션을 호출했다 (rename, definition jump 등)
- 그 위치에 그대로 분석을 돌리면 컴파일러가 선언 컨텍스트 를 처리하려 들면서 top-level 처리에 의존한다
- 분석기는 이미 우리 손에 있는 파일 단위 컨텍스트만 가지고 있으니 top-level provider 가 없어 예외

이걸 우회하는 트릭이 들어가 있다. 식별자 자리를 가짜 `val x: <Name>` 으로 감싸 reference expression 자리에 놓고 분석을 돌린다. 분석기 입장에서는 새 변수의 타입 reference 가 들어왔다고 보고 top-level 의존을 거치지 않는다.

```kotlin
when {
    parent is KtClass && psi.node.elementType == KtTokens.IDENTIFIER -> {
        val prefix = "val x: "
        surroundingContent = prefix + psi.text
        offset = psi.textRange.startOffset - prefix.length
    }
    // ... 다른 종류의 선언들
}
```

`KtClass` 만 본다. `object` 는 `KtClass` 가 아니라 `KtObjectDeclaration` 인데, 둘은 공통 슈퍼타입 `KtClassOrObject` 를 공유한다. 분기가 `KtClass` 로 좁혀 있으면 object 는 이 트릭을 받지 못한 채 원본 위치 그대로 분석에 던져진다 → top-level descriptor provider 가 호출된다 → 죽는다.

## 우회 시도

`KtClassOrObject` 한 글자 차이로 fork 가 정답인 게 보이는 자리다. 그래도 클라이언트(PAGE) 측에서 우회할 수 있을지를 먼저 본다 — fork 는 마지막 수단이다.

후보 1: 클라이언트가 object 의 IDENTIFIER 토큰 자리를 KLS 로 보내지 않고, 같은 이름을 가진 다른 reference 자리 (사용처) 로 옮긴 다음 거기서 rename 을 요청한다. KLS 가 reference 자리에서는 안 죽으니 동작은 할 수 있다. 다만 사용처가 없는 object 는 처리 못 한다. 그리고 IDE 의 동작이 "선언 위에서 누른 rename 이 사용처 위에서 누른 rename 과 다르게 처리된다" 는 미묘한 상태가 된다. 사용자가 코드에서 같은 것 을 다르게 다루도록 강요받는다.

후보 2: 클라이언트가 임시로 `object` 키워드를 `class` 로 바꾼 텍스트를 KLS 에 보내고, 응답으로 받은 edit 을 적용하기 전에 원본 텍스트로 되돌린다. 의미가 다른 키워드를 가짜로 바꿔 보내는 거라 KLS 가 응답에 포함시킬 다른 검증 (예: 동반 객체 사용 위치, expect/actual 매칭) 이 어긋날 위험이 있다. 그리고 어차피 KLS 의 한 줄이 너무 좁다 는 사실 자체는 안 사라진다.

후보 3: KLS 의 `rename` 자체를 끄고 클라이언트가 텍스트 grep + 컴파일러 없는 휴리스틱으로 rename 을 한다. 가장 자유롭지만 가장 위험하다. 같은 이름의 다른 스코프, import alias, 패키지 동명 클래스 같은 게 줄줄이 깨진다. (이 길은 나중에 references 에서 결국 한 번 가게 되지만, 그건 별개 글이다.)

세 후보 모두 KLS 의 한 줄 분기를 우회하기 위해 클라이언트가 KLS 보다 더 많은 일 을 떠안는다. 한 클래스만큼만 분기를 넓히면 되는 자리에 클라이언트가 의미론을 떠안는 건 비대칭이다. fork 가 더 정직했다.

## 패치

`Monkshark/kotlin-language-server` 로 fork 떠서 `1.3.13-page-1` 태그를 박았다. 변경은 세 가지.

첫째, `KtClass` 분기를 `KtClassOrObject` 로 넓힌다. 한 글자 차이.

```kotlin
when {
    parent is KtClassOrObject && psi.node.elementType == KtTokens.IDENTIFIER -> {
        // Converting class/object name identifier: Use a fake property with the class/object name as type
        //                                          (PAGE patch: also covers KtObjectDeclaration, not just KtClass)
        val prefix = "val x: "
        surroundingContent = prefix + psi.text
        offset = psi.textRange.startOffset - prefix.length
    }
}
```

둘째, 서버 시작 로그에 패치 식별자를 단다. PAGE 가 올바른 fork 를 잡고 있는지 콘솔에서 한눈에 확인하려는 용도.

```kotlin
LOG.info("Kotlin Language Server: Version ${VERSION ?: "?"} (PAGE patch: KtClassOrObject reference)")
```

셋째, KLS 의 `buildSrc/settings.gradle.kts` 와 root `settings.gradle.kts` 에 Foojay resolver plugin 을 붙인다. 이건 KLS 자체 빌드용 — JDK 21 환경에서 toolchain 이 자동으로 끌어와지도록 한다.

```kotlin
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.9.0"
}
```

세 변경 합쳐 17줄. 그중 의미 있는 한 줄은 `KtClass` → `KtClassOrObject` 다.

## PAGE 에 꽂기

fork 가 GitHub Releases 에 `server.zip` 으로 올라가 있다. PAGE 의 `:page:app` 빌드가 그걸 받아 Compose resources 자리에 풀어 둔다.

```kotlin
// page/app/build.gradle.kts
val klsVersion = "1.3.13-page-1"
val klsDownloadUrl = "https://github.com/Monkshark/kotlin-language-server/releases/download/$klsVersion/server.zip"
val klsResourcesDir = layout.buildDirectory.dir("composeResources")
val klsServerDir = klsResourcesDir.map { it.dir("common/lsp/server") }
```

다운로드 작업은 `DownloadKlsTask` 라는 abstract task 로 떼 뒀다. 이건 fork 자체와는 별개의 모서리 — Gradle configuration cache 와 호환되려면 task action 안에서 project / build script 의 상태를 직접 참조하면 안 되고, `@get:Input` / `@get:OutputFile` 로 선언된 프로퍼티만 거쳐야 한다. 처음엔 람다 안에서 `project.layout` 을 그대로 썼더니 cache miss 가 났고, 그 한 번의 통고 후로 task 를 abstract 로 정리했다.

```kotlin
abstract class DownloadKlsTask : DefaultTask() {
    @get:Input abstract val url: Property<String>
    @get:Optional @get:Input abstract val localZip: Property<String>
    @get:OutputFile abstract val target: RegularFileProperty
    @TaskAction fun download() { /* curl + checksum + atomic rename */ }
}
```

서버 시동 후 콘솔에 패치 식별자가 떴다.

```
[lsp:log/Info] main      Kotlin Language Server: Version 1.3.13 (PAGE patch: KtClassOrObject reference)
[lsp:log/Info] main      Connected to client
```

`object Hello` 위에서 `Shift+F6` 을 다시 눌렀다. 다이얼로그가 떴고, 새 이름을 입력하고 엔터를 누르자 `Greeter.kt` 의 선언과 `Main.kt` 의 두 호출이 한 번에 바뀌었다. 한 줄짜리 패치가 한 시나리오를 통째로 살렸다.

## 돌아보면

fork 는 한 줄 패치라고 해서 무게가 가벼운 일이 아니다. 떠서 끝이 아니라 들고 다녀야 한다.

- 업스트림 KLS 가 다음 릴리스를 내면 패치 한 줄을 rebase 해서 다시 빌드하고 태그를 박고 PAGE 의 `klsVersion` 을 올려야 한다. 같은 자리가 또 만져졌다면 conflict 해결도 따라온다.
- PAGE 의 빌드는 fork 의 `server.zip` 에 의존하니 fork repo 가 죽으면 PAGE 의 LSP 가 죽는다. PAGE 의 다른 의존성과는 비대칭이다.
- 콘솔에 PAGE patch 식별자를 박은 건 작은 디테일 같았는데, 나중에 어떤 버그를 추적할 때 "이 KLS 가 fork 인가 업스트림인가" 를 한 번에 알 수 있는 가장 빠른 신호가 됐다.

언어 서버 한 줄을 위해 fork 를 떠도 되는가 라는 질문에 답을 한 줄로 하면 — 한 줄로 끝나는 일이 아니다 — 가 정답일 것이다. 그래도 이번엔 정답이 fork 였다고 본다. 클라이언트가 의미론을 떠안는 우회보다 KLS 의 분기를 한 클래스만큼 넓히는 쪽이 더 정직했고, 그 정직함이 다음 사람 (나일 수도 있고 다른 사람일 수도 있다) 이 KLS 의 동작을 추적할 때 헷갈리지 않게 해 준다.

다음 자리는 KLS 가 못 고치는 자리 — 의미 기반 references — 다. 이번엔 fork 가 답이었지만, 그 일은 fork 도 답이 아니었다. 그건 다음 글이다.
