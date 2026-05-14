---
title: "#9 - references 가 잘못된 자리를 잡을 때, fork 가 답이 아니었던 이유"
description: "kotlin-language-server 의 textDocument/references 가 type-based 매칭으로 어긋난 위치를 돌려준다. fork 를 다시 안 뜨고 클라이언트 텍스트 스캔으로 우회한 회고"
date: 2026-05-14T09:55:00+09:00
slug: page-ide-references-text-scan
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "LSP", "kotlin-language-server", "find references", "lexer"]
---

지난 글에서 KLS 의 rename 을 살리려고 fork 를 떴다. 한 글자 차이 (`KtClass` → `KtClassOrObject`) 였고 그게 정직한 길이었다고 적었다. 이번 자리는 같은 KLS 의 다른 모서리인데, 결론은 정반대였다.

`Shift+F12` — find references. 심볼 위에서 누르면 워크스페이스 전체의 사용처가 패널에 떠야 한다. PAGE 의 첫 번째 시도는 KLS 의 `textDocument/references` 를 그대로 클라이언트로 가져오는 거였다. 코드는 짧게 끝났고 결과는 길게 어긋났다.

이 글은 fork 가 가능한데도 fork 를 다시 안 뜨고, 클라이언트가 텍스트 스캔으로 references 를 다시 짠 회고다. 답이 fork 였던 일과 답이 fork 가 아니었던 일이 같은 서버 같은 달 안에 나란히 있었다.

## KLS 의 references 가 어떻게 어긋나는가

테스트 파일의 한 자리 — `val c1 = BetterCalc(start = 10)` 의 `BetterCalc` 위에서 `Shift+F12`. 기대: 선언 1 + 호출 2 = 3건. KLS 가 돌려준 raw 응답.

```
[lsp] references(raw KLS) Main.kt @(10,21) — 2 ref(s)
  raw[0] Main.kt @(10,9)..(10,11)
  raw[1] Main.kt @(11,9)..(11,11)
```

위치가 `(10,9)..(10,11)`. 원본은 `val c1 = BetterCalc(start = 10)`. 이게 무슨 자리냐면 — `c1` 이다. 클래스 이름 `BetterCalc` 가 아니라 그 값을 받는 변수 이름. KLS 가 reference 라고 보낸 두 항목 다 좌변 변수 위치였다.

확인 한 줄. `BetterCalc` 의 선언 자체 (`Calculator.kt` 의 `class BetterCalc(...)`) 도 응답에 없다. 호출 두 개도 없다. 좌변 변수 `c1`, `c2` 만 있다.

같은 함수, 다른 심볼 — `plus`. `c1.plus(3, 4)` 의 `plus` 위에서 누름. 기대: 선언 1 + 호출 2 = 3건. KLS: 0건. 이번엔 아예 빈 응답.

`times`, `Hello`, `sayHello`, `yell` — 비슷한 패턴. 어떤 건 좌변 변수가 잡히고, 어떤 건 빈 응답이고, 어떤 건 한 호출만 잡힌다. 일관된 어긋남이 아니라 일관되지 않은 어긋남이었다.

추측 — KLS 의 references 구현이 호출 자리에서 호출 표현식의 타입 을 기준으로 매칭한다. `val c1 = BetterCalc(...)` 의 우변 호출 표현식이 만들어 내는 값의 타입은 `BetterCalc` 다. 그래서 좌변 변수 `c1` 의 추론된 타입 자리에 잡혀 들어왔다. 캐럿이 찍힌 자리의 심볼 이 아니라 그 자리에서 보이는 타입 으로 검색한 결과다.

(KLS 의 정확한 내부 로직은 확인 안 했다. 어긋난 패턴이 type-based 매칭으로 가장 잘 설명된다는 정도다. 정답이 다른 데 있어도 우회의 방향은 같다.)

## 왜 이번엔 fork 가 아니었나

지난 글의 패치는 `when { parent is KtClass -> ... }` 의 한 글자였다. references 가 어긋나는 자리는 그런 한 글자가 아니다. `Resolver`, `Analyzer`, type binding cache, source-set 인덱스 가 엮인 자리에서 references 가 "어떤 심볼 인지" 를 어떻게 정하는지 자체를 다시 짜야 한다.

이게 fork 의 한 줄을 한 클래스만큼 넓히는 일과 다른 점이다. 패치 표면적이 크고, 업스트림과 멀어지고, rebase 비용이 매번 든다. 우리가 fork 를 떴을 때 들고 다닌다 라고 적었던 그 부담이 references 패치에서는 한 자릿수 곱하기로 커진다.

게다가 더 짧은 길이 있었다. references 는 의미상 텍스트 매칭으로 거의 잡힌다 — 단, 두 가지만 빼면. 문자열/주석 안의 같은 단어, 그리고 같은 이름의 다른 스코프. 이 둘은 lexer 한 번 돌리고 enclosing function 한 번 추적하면 클라이언트에서 처리할 수 있다.

이번엔 클라이언트가 의미론을 떠안는 게 정직했다 — 지난 글의 결정과 정반대로.

## 텍스트 스캔으로 references 짜기

`page.editor` 의 `SyntaxLexer` 를 빌려 썼다. 자동완성과 하이라이트가 쓰던 그 토큰화기. lexer 가 돌리고 나면 STRING / COMMENT 범위가 토큰으로 잡혀 있다. 그걸 그대로 제외 마스크 로 쓴다.

```kotlin
private fun stringCommentRanges(tokens: List<Token>): List<Pair<Int, Int>> = tokens
    .filter { it.kind == TokenKind.STRING || it.kind == TokenKind.COMMENT }
    .map { it.range.first to (it.range.last + 1) }
    .sortedBy { it.first }
```

본체는 `text.indexOf(symbolName, ...)` 루프. 매치마다 두 가지를 확인한다.

- word boundary — 앞뒤 문자가 letter / digit / `_` 가 아닐 것 (`sayHello` 가 `sayHelloAgain` 안에 안 잡히게)
- 마스크 외부 — `isInsideRange` 로 STRING / COMMENT 범위와 겹치지 않을 것

```kotlin
while (true) {
    val idx = text.indexOf(symbolName, searchFrom)
    if (idx < 0 || idx >= searchEnd) break
    val endExclusive = idx + nameLen
    val before = if (idx == 0) ' ' else text[idx - 1]
    val after  = if (endExclusive >= text.length) ' ' else text[endExclusive]
    val isWordStart = !before.isLetterOrDigit() && before != '_'
    val isWordEnd   = !after.isLetterOrDigit() && after != '_'
    if (isWordStart && isWordEnd && !isInsideRange(idx, excluded)) {
        // 매치 채택
    }
    searchFrom = idx + 1
}
```

이 두 필터 — word boundary + STRING/COMMENT 마스크 — 만으로 6개 시나리오의 클래스/함수 references 가 KLS 의 응답보다 정확하게 나왔다. 선언과 모든 호출이 한 번에 잡혔다.

그런데 한 시나리오가 남았다. 로컬 변수.

## 같은 이름, 다른 스코프

테스트 샘플의 `Main.kt` 에 두 자리가 있다.

```kotlin
val c1 = BetterCalc(start = 10)   // 줄 11: 명명 인자 'start'
val c2 = BetterCalc(start = 20)   // 줄 12

val start = 100                   // 줄 36: 로컬 변수 'start'
println("local start=$start")     // 줄 37
```

`val start = 100` 위에서 `Shift+F12` 를 누르면 기대값은 선언 + interpolation = 2건. 단순 텍스트 매칭은 4건을 돌려준다 — 위의 명명 인자 두 개까지 같이 잡힌다. `BetterCalc(start = ...)` 의 `start` 는 생성자 파라미터 이름이고 우리 로컬 `val start` 와는 다른 심볼이다.

이게 텍스트 grep 과 의미 기반 references 의 가장 분명한 차이다. 같은 글자 이지만 다른 것 들을 분리해야 한다.

클라이언트 측 휴리스틱을 두 층 둔다. 첫째, 캐럿이 로컬 변수 위에 있을 때 만 검색 범위를 enclosing function 으로 줄인다. 둘째, 그 안에서도 명명 인자 패턴은 추가 제외.

스코프 축소는 `fun` 키워드 토큰 위치를 lexer 에서 받고, 그 뒤의 여는 중괄호 부터 매칭되는 닫는 중괄호 까지를 함수 본문 범위로 잡는다. 캐럿이 들어 있는 가장 작은 함수가 enclosing scope.

```kotlin
private fun findEnclosingFunctionRange(
    text: String,
    tokens: List<Token>,
    caret: Int,
    excluded: List<Pair<Int, Int>>,
): IntRange? {
    val funPositions = tokens.asSequence()
        .filter { it.kind == TokenKind.KEYWORD }
        .filter { /* "fun" 인지 확인 */ }
        .map { it.range.first }
        .toList()
    val scopes = mutableListOf<IntRange>()
    for (funStart in funPositions) {
        // funStart 다음의 첫 '{' 부터 매칭되는 '}' 까지 깊이 추적
    }
    return scopes.filter { caret in it }.minByOrNull { it.last - it.first }
}
```

다음 한 층 — 캐럿이 그 함수 안에서 `val`/`var <name>` 또는 함수 파라미터 자리에 선언된 이름이라면, 그건 로컬 심볼이라 검색 범위를 그 함수 안으로 축소한다.

```kotlin
private fun hasLocalDeclaration(
    scopeText: String,
    name: String,
    excluded: List<Pair<Int, Int>>,
    offset: Int,
): Boolean {
    val escaped = Regex.escape(name)
    val patterns = listOf(
        Regex("\\b(val|var)\\s+$escaped\\b"),
        Regex("[\\s(,]$escaped\\s*:"),
    )
    // STRING/COMMENT 밖에서 매치 하나라도 있으면 로컬
}
```

`val name = "scope-test"` 와 `fun foo(name: String)` 둘 다 잡힌다.

이걸로 두 번째 모서리 — 명명 인자 — 가 마지막으로 남았다.

## 명명 인자 — `(... <name> = ...)`

로컬 스코프로 줄인 뒤에도 `BetterCalc(start = 10)` 의 `start` 는 같은 함수 본문 안에 있다. 그래서 4건이 그대로 4건이었다 — 함수 범위로 줄였는데도.

여기서 텍스트 모양 한 가지를 더 본다. 명명 인자 라면 다음과 같이 생긴다.

```
( name = ...   또는   , name = ...
```

식별자 직전에 `(` 나 `,` 가 (공백을 무시하고) 오고, 식별자 직후에 `=` 가 하나만 (즉 `==` 가 아닌) 온다. 이 모양이면 함수 호출 시점에 파라미터 이름을 쓴 자리이지 우리 로컬 변수의 reference 가 아니다.

```kotlin
private fun isNamedArgumentPosition(text: String, idx: Int, endExclusive: Int): Boolean {
    var p = idx - 1
    while (p >= 0 && (text[p] == ' ' || text[p] == '\t')) p--
    if (p < 0 || (text[p] != '(' && text[p] != ',')) return false
    var q = endExclusive
    while (q < text.length && (text[q] == ' ' || text[q] == '\t')) q++
    if (q >= text.length || text[q] != '=') return false
    if (q + 1 < text.length && text[q + 1] == '=') return false
    return true
}
```

이 필터는 로컬 스코프일 때만 켠다. 워크스페이스 검색에서는 명명 인자 자체가 reference 의 정당한 자리라 — 함수 파라미터 이름 검색이 명명 인자 호출을 잡아야 한다 — 끄는 게 맞다. `filterNamedArgs = scope != null` 한 줄이 그걸 가른다.

명명 인자를 끄고 다시 누른 결과.

```
[lsp] references(text-scan) for 'start' scope=local in Main.kt — 2 occurrence(s)
  scan[0] Main.kt @(35,8)..(35,13)     // val start = 100
  scan[1] Main.kt @(36,26)..(36,31)    // "local start=$start" 의 $start
```

기대값 2건과 일치.

## 무엇이 여전히 어긋나는가

텍스트 스캔이 의미 기반이 아닌 이상 정확하지 않은 모서리가 남는다. 글에 적어 두는 이유는 다음 사람이 같은 자리에서 헤매지 않도록.

주생성자 파라미터. `class C(val start: Int)` 의 `start` 는 한편으로는 생성자 파라미터, 다른 한편으로는 프로퍼티다. 호출 자리에서 `C(start = 1)` 도 같은 `start` 다. 로컬 스코프 휴리스틱은 이걸 잡지 못한다 — 함수 본문에 선언이 없기 때문에. 워크스페이스 전체로 검색되고, 그건 의도와 일치한다. 다만 동일 이름의 로컬이 함수 안에 있어도 `(...start = ...)` 가 외부 클래스의 그 파라미터인지 판단할 방법이 텍스트만으로는 없다. 의미 기반이 필요해지는 자리다.

중첩된 같은 이름. `fun a() { val x = 1; fun b() { val x = 2 } }` 같은 자리. 현재 구현은 enclosing function 한 단계만 본다. 더 안쪽 함수 안에 같은 이름의 선언이 있어도 바깥 검색 결과에 묶여 들어간다. PAGE 의 테스트 샘플 8개 시나리오에는 안 나오는 모서리지만, 진짜 코드베이스에는 흔하다. 함수 스코프 트리를 한 번 만들어 두면 풀린다 — 다음 자리에 둔다.

import alias. `import com.foo.Calc as MyCalc` 에서 `MyCalc` reference 는 텍스트로 잡히지만, 이게 `Calc` 의 reference 인지는 모른다. KLS 의 정상적인 references 가 한 번에 잡는 자리. 텍스트 스캔의 한계.

이 모서리들은 한 번에 다 닫지 않았다. PAGE 의 첫 사용 케이스 — 단일 모듈, 짧은 파일들 — 에서 정확하게 동작하는 것 부터 닫고, 모서리들은 코드베이스가 커지는 속도에 맞춰 추가할 예정이다.

## 돌아보면

지난 글의 fork 결정과 이번 글의 클라이언트 우회 결정 이 같은 KLS 에 대해 정반대로 갔다. 두 자리의 차이를 한 줄로 적으면 — 패치 표면적이 fork 의 비용보다 작은가 — 였다.

`KtClass` → `KtClassOrObject` 는 작았다. references 의 type-based 매칭을 의미 기반으로 다시 짜는 일은 컸다. 그러니 fork 가 정답이 되는 자리가 따로 있고, 클라이언트가 의미론을 떠안는 게 정답이 되는 자리도 따로 있다.

또 하나는 텍스트 스캔이 의외로 멀리 간다는 것. lexer 의 STRING/COMMENT 마스크 한 층, word boundary 한 층, 로컬 스코프 한 층, 명명 인자 한 층 — 네 층 쌓고 나니 PAGE 의 첫 사용 시나리오는 KLS 의 raw 응답보다 정확하게 동작한다. "의미 기반이 아니면 거의 다 어긋난다" 는 직관이 코드를 직접 짜 보기 전까지의 직관이었다. 짜 보고 나니 어디까지가 텍스트로 충분하고 어디서부터 의미가 필요한지 — 모서리의 위치 자체 — 가 잡혔다. 다음에 references 를 의미 기반으로 다시 짜게 되면, 이번에 닫은 자리는 그대로 두고 안 닫은 모서리만 채우면 된다.

언어 서버를 다 믿고 싶을 때가 있고, 다 무시하고 싶을 때가 있는데, 둘 다 정답이 아니다. 모서리마다 어느 쪽에 더 가깝게 가야 정직한지 를 매번 다시 정하게 된다.
