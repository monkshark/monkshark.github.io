---
title: "#15 - 모든 import 가 import 는 아니다"
description: "Atlas 의 의존성 그래프가 PAGE 자기 코드 앞에서조차 비어 있던 이유를 좇다 보니, import 를 해석한다는 건 결국 언어마다 다른 모듈 시스템을 한 조각씩 다시 구현하는 일이었다는 회고"
date: 2026-06-22T10:00:00+09:00
slug: page-ide-language-import-gaps
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "Atlas", "tree-sitter", "의존성그래프", "Go", "Python", "Rust", "Dart", "TypeScript"]
---

Atlas 는 PAGE 가 파일 사이의 의존 관계를 보여주는 패널이다. 어떤 파일이 무엇을 끌어다 쓰는지, 무엇이 그 파일에 기대고 있는지를 한 화면에 펼친다. 그런데 정작 PAGE 자기 코드베이스를 열어 보면 그래프가 거의 비어 있었다. 분명히 서로를 import 하는 파일들인데 선이 그려지지 않았다.

## 비어 있던 그래프

먼저 의심한 건 한 파일에 여러 심볼이 사는 경우였다. Kotlin 은 한 `.kt` 파일에 top-level 선언을 여럿 둔다. `GraphSlice`, `GraphNode`, `NodeKind` 가 전부 `GraphModel.kt` 한 파일에 산다. 그런데 해석기는 `import page.atlas.graph.GraphSlice` 를 보면 `…/page/atlas/graph/GraphSlice.kt` 라는 *파일 경로*를 찾았다. 파일명과 심볼명이 같을 때만 맞아떨어지는 매칭이었다. 그래서 선언 인덱스를 따로 만들어 FQN→선언 파일로 해석하도록 고쳤고, Kotlin·Java 쪽 그래프는 살아났다.

문제는 그다음이었다. 데이터가 정확해지자 이번엔 *다른 언어들*이 여전히 비어 있는 게 눈에 띄었다. Go 프로젝트를 열면 import 가 멀쩡히 있는데 선이 없었다. Python 도, Rust 도, Dart 도 제각각 빠진 데가 있었다. 한 군데를 고쳤더니 가려져 있던 다른 구멍들이 드러난 셈이다.

해석기의 모양을 보면 이유가 보인다. 진입점은 하나지만, 안에서 파일 확장자로 갈라진다.

```kotlin
return when (extOf(activeFile)) {
    "js", "jsx", "mjs", "cjs", "ts", "tsx" -> resolveJsRelative(raw, activeFile)
    "py", "pyi" -> ...
    "java", "kt", "kts" -> resolveDotted(raw, activeFile, index, ..., declIndex)
    "go" -> resolveGo(raw, activeFile, index)
    "rs" -> resolveRust(raw, activeFile, index)
    "dart" -> resolveDart(raw, activeFile, index)
    else -> null
}
```

`import` 이라는 한 단어를 쓰지만, 그 한 단어가 가리키는 건 언어마다 전혀 다른 규칙이었다. 갭을 메운다는 건 결국 이 분기마다 그 언어의 모듈 해석을 한 조각씩 다시 구현하는 일이었다. 언어를 하나씩 짚어 가며 무엇이 빠졌는지 적어 둔다.

## 경로처럼 생겼지만 경로가 아닌 것

JS/TS 는 상대 경로(`./util`, `../models`)는 잘 따라갔다. 막힌 건 별칭이었다. 요즘 프로젝트는 `import Button from '@/components/Button'` 처럼 `@/` 같은 별칭을 쓴다. `@` 로 시작하는 이건 디렉터리 경로가 아니다. `tsconfig.json` 의 `paths`·`baseUrl` 을 읽어야만 실파일로 풀린다.

```json
{ "compilerOptions": { "baseUrl": "src", "paths": { "@/*": ["*"] } } }
```

그래서 `tsconfig`/`jsconfig` 를 거슬러 올라가며 찾아 별칭 테이블을 만들었다. 여기서 Windows 만의 함정을 하나 밟았다. `@/*` → `src/*` 같은 템플릿을 만들 때 무심코 `Path.resolve("src/*")` 를 부르면 Windows 에서 터진다. `*` 가 파일명에 못 쓰는 문자라 `InvalidPathException` 이 난다. POSIX 에선 조용히 넘어가는 자리다. 템플릿은 문자열로만 들고 있다가, 실제 별칭 글롭이 매치된 *순간에만* `Path.of(template.replace("*", matched))` 로 경로를 만들도록 미뤘다.

## 경로가 곧 그 패키지라는 보장은 없다

Go 와 Dart 는 닮은 함정을 공유했다. 둘 다 import 가 "패키지 이름 + 그 안의 경로" 꼴인데, 처음엔 패키지 이름을 버리고 뒤쪽 경로만 가지고 파일을 찾고 있었다.

Go 의 `import "example.com/app/internal/db"` 는 마지막 조각 `db` 만 보고 `db` 라는 디렉터리를 아무거나 집었다. 같은 이름의 디렉터리가 둘이면 엉뚱한 쪽을 골랐다. 제대로 하려면 가장 가까운 `go.mod` 의 `module` 줄을 읽어 그 prefix 를 떼고, 남은 부분을 모듈 루트 기준의 정확한 디렉터리로 풀어야 한다.

```
module example.com/app
```

Dart 는 같은 실수가 더 위험했다. `import 'package:my_app/widgets/button.dart'` 에서 패키지 이름 `my_app` 을 버리고 `**/lib/widgets/button.dart` 에 맞는 파일을 아무거나 집었다. 그래서 서드파티인 `package:http/http.dart` 가 우연히 로컬에 `lib/http.dart` 가 있으면 거기로 잘못 이어졌다. 모노레포에선 다른 패키지로 가야 할 import 가 자기 패키지 안으로 빨려 들어왔다. 고치는 방향은 Go 와 같았다. 후보 파일이 속한 디렉터리의 `pubspec.yaml` 을 열어 `name:` 이 import 의 패키지 이름과 같은 것만 인정한다.

```yaml
name: my_app
```

이렇게 하면 패키지 이름이 안 맞는 서드파티는 그냥 외부로 남고, 모노레포에서도 후보마다 자기 `pubspec` 의 이름을 확인하니 활성 파일이 어느 패키지에 있든 정확히 풀린다. "경로가 맞으면 그 파일이다"라는 가정이, 이름을 검증하지 않으면 거짓 양성을 만든다는 게 둘의 공통 교훈이었다.

## 파일이 아니라 디렉터리가 모듈일 때

Python 과 Rust 는 디렉터리 자체가 모듈이 되는 경우가 막혀 있었다.

Python 의 절대 import 는 `app.services.auth` 를 `app/services/auth.py` 로만 찾고 있었다. 하지만 `app/services/` 가 `__init__.py` 를 가진 패키지일 때 `from app.services import ...` 는 그 `__init__.py` 로 풀려야 한다. probe 목록에 `…/$rel/__init__.py` 를 더하는 것으로 끝났다. 여기서 처음 세웠던 계획 하나가 틀렸다는 걸 인정해야 했다. "Kotlin 처럼 선언 인덱스를 채워 FQN 으로 맞추자"고 적어 뒀는데, Python 은 모듈이 곧 파일이고 `package` 선언 노드 자체가 없어서 `package.symbol` FQN 이 성립하지 않는다. 진짜 빠진 건 인덱스가 아니라 `__init__.py` 였다.

Rust 의 `self::`·`super::` 는 더 미묘했다. 이건 활성 파일이 속한 *모듈 디렉터리*를 기준으로 풀어야 한다. Rust 에서 `src/a/b.rs` 라는 파일은 모듈 `b` 이고, 그 하위 모듈은 `src/a/b/` 아래 산다. `mod.rs`·`lib.rs`·`main.rs` 는 자기 부모 디렉터리가 곧 모듈 디렉터리다. `self::` 는 현재 모듈 디렉터리, `super::` 는 그 부모. 이걸 모르고 crate 루트의 `src/` 기준으로 풀면 `super::foo` 가 엉뚱한 형제를 가리킨다.

```kotlin
private fun rustModuleDir(activeFile: Path): Path? {
    val parent = activeFile.parent ?: return null
    val name = activeFile.fileName?.toString()?.removeSuffix(".rs") ?: return null
    return when (name) {
        "mod", "lib", "main" -> parent
        else -> parent.resolve(name)
    }
}
```

## import 라고 쓰지 않는 import

마지막 갭은 해석이 아니라 추출 쪽이었다. 그동안은 `import`·`export` 라는 정적 구문만 의존성으로 잡았다. 그런데 JS 생태계는 import 를 import 라고 쓰지 않는 길이 여럿이다. CommonJS 의 `require('x')`, 동적 `import('x')`, 그리고 `export { a } from './b'` 같은 재수출.

앞의 둘이 까다로웠다. `require` 와 동적 `import` 는 문법상 그냥 함수 호출(`call_expression`)이다. 이건 코드에 너무 흔해서, import 노드 목록에 넣고 만나면 멈추는 식으로 잡으면 모든 함수 호출을 의존성으로 오해하고 자식 노드까지 건너뛴다. 그래서 멈추지 않고 흘려보내되, 호출의 대상이 import 계열일 때만 따로 걷어 내는 "soft capture" 를 뒀다.

여기서 텍스트로 판단하려던 첫 시도가 함정이었다. `import('./b').then(...)` 같은 코드는 바깥이 `.then(...)` 멤버 호출이고 안이 진짜 동적 import 다. 그런데 노드 텍스트를 `(` 앞까지 잘라 보면 바깥 호출의 텍스트도 `import` 로 시작한다. 텍스트만 보면 바깥 멤버 호출까지 import 로 오인하고, 같은 대상을 두 번 센다. 결국 텍스트가 아니라 AST 의 함수 필드를 봐야 했다.

```kotlin
val fn = node.getChildByFieldName("function")
val fnType = fn?.type ?: ""
val isImportCall =
    fnType == "import" || (fnType == "identifier" && nodeText(fn, ...) == "require")
```

호출 대상 노드의 타입이 `import` 면 동적 import, `identifier` 이면서 이름이 `require` 면 CommonJS. `.then(...)` 의 함수 필드는 `member_expression` 이라 자연히 걸러진다. 재수출은 `export` 문 중 `from` 절을 가진 것만 의존성으로 본다.

## 돌아보면

여섯 언어를 차례로 메우고 나서 남은 인상은, "import 를 해석한다"는 한 문장이 사실은 여섯 개의 서로 다른 작업이었다는 것이다. 어떤 언어에선 그게 파일 경로 따라가기였고, 어떤 언어에선 모듈 선언 파일을 읽어 prefix 를 떼는 일이었고, 또 어떤 언어에선 디렉터리를 모듈로 보거나 함수 호출 안에 숨은 경로를 끄집어내는 일이었다. 공통의 추상이 있을 것 같지만, 막상 정확하게 풀려면 각 언어의 모듈 시스템 한 조각을 그대로 다시 구현하게 된다.

도구가 보여주는 그림이 비어 있을 때, 시각화를 손보고 싶은 유혹이 있다. 하지만 비어 있던 건 그림이 아니라 데이터였다. 한 칸씩 정확해질 때마다 가려져 있던 다음 구멍이 보였고, 결국 정확도를 먼저 끝까지 밀어붙인 뒤에야 그래프가 비로소 코드의 실제 모양을 닮기 시작했다. 의도적으로 남겨 둔 자리도 있다. wildcard import 는 한 줄이 패키지의 모든 파일로 선을 뻗어 그래프를 헝클기에, 지금은 풀지 않는다. 정확함과 읽힘 사이의 선택은 또 다른 이야기다.
