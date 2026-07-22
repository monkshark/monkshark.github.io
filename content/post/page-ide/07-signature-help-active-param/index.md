---
title: "#7 - LSP가 활성 파라미터를 안 알려줄 때, 클라이언트가 콤마를 센다"
description: "kotlin-language-server 의 signature help 는 어느 인자 자리에서 호출했는지 자주 빠뜨린다. 라인 텍스트만 보고 활성 파라미터를 다시 계산하는 fallback 의 회고"
date: 2026-05-12T21:00:00+09:00
slug: page-ide-signature-help-active-parameter
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "LSP", "kotlin-language-server", "signature help", "LSP4J"]
---

함수 호출 중간에서 `Ctrl+Shift+Space` 를 누르면 인자 목록이 뜬다. 그건 LSP 의 `textDocument/signatureHelp` 가 돌려주는 정보고, 어느 인자 자리 에서 호출했는지를 알려주는 `activeParameter` 인덱스도 같이 온다.

오는 게 정상이다. PAGE 에서 kotlin-language-server 를 붙여 보니 자주 안 왔다.

이 글은 LSP 가 빠뜨린 한 칸을 클라이언트가 채우는 fallback 을 짠 회고다. 짧게 끝나는 글이 될 줄 알았는데, 가장 단순해 보이던 콤마 세기 가 의외로 모서리가 많았다.

## `textDocument/signatureHelp` 가 돌려주는 것

LSP 명세는 셋을 묶어 보낸다.

- `signatures` 오버로드별 시그니처 리스트 (`label: "fun add(x: Int, y: Int): Int"`, `parameters: [{label: "x: Int"}, {label: "y: Int"}]`)
- `activeSignature` 그 중 어느 오버로드를 강조할지 (보통 0)
- `activeParameter` 그 시그니처의 어느 파라미터 자리에서 호출했는지

마지막 한 줄이 사라지면 팝업은 떠도 강조 가 사라진다. `add(a, b|)` 처럼 캐럿이 두 번째 인자 자리에 있어도 화면에는 첫 번째 `x: Int` 가 굵게 표시되는 식이다. 시그니처는 보이지만 어디까지 적었는지가 안 보인다.

## KLS 가 자주 0 을 보낸다

kotlin-language-server 가 활성 파라미터를 채워 보내는 경우도 있다. 그런데 단일 인자, 트레일링 람다, 또는 캐럿이 콤마 뒤 공백에 있는 케이스에서 자주 0 (= 첫 인자) 으로 떨어진다. 사용자 입장에서는 두 번째 인자를 적고 있는데 첫 번째가 강조된 채 머무른다.

LSP4J 의 `SignatureHelp.activeParameter` 는 `Integer?` 라 null 도 가능하다. 코드 변환 시점에 한 번 정리한다.

```kotlin
fun fromLsp(help: SignatureHelp?): SignatureHelpInfo? {
    if (help == null) return null
    val sigs = help.signatures.orEmpty().mapNotNull(SignatureInfo::fromLsp)
    if (sigs.isEmpty()) return null
    val activeSig = help.activeSignature?.coerceIn(0, sigs.size - 1) ?: 0
    val activeParam = help.activeParameter?.coerceAtLeast(0) ?: 0
    return SignatureHelpInfo(sigs, activeSig, activeParam)
}
```

`null` 을 0 으로 떨어뜨리는 이 한 줄이 정확히 첫 인자만 강조 동작의 출처다. 명세 그대로 따른 결과이지만, 사용자에게는 LSP 가 일을 안 한 것처럼 보인다.

## 캐럿이 움직일 때마다 LSP 를 다시 부를 수는 없다

가장 간단한 해법은 캐럿이 바뀔 때마다 `signatureHelp` 를 다시 요청하는 것이다. 사용자가 인자 사이를 왔다 갔다 하면 매번 새 응답이 와서 강조가 맞춰진다.

이게 비싸다. KLS 의 `signatureHelp` 응답은 보통 50–200ms 가 걸리고, 그동안 화면은 직전 강조 위치에 멈춰 있다. 캐럿 한 칸 옮기는 일에 라운드트립 하나는 과하다.

다른 길은 클라이언트가 가지고 있는 정보 현재 라인 텍스트와 캐럿 컬럼 만으로 다시 계산하는 것. 함수 호출 안 으로 들어왔다는 사실 자체는 LSP 가 알려준 그 시점에 확정됐다. 그 안에서 어느 콤마 칸인지는 텍스트만 봐도 결정된다.

PAGE 의 선택:

- 처음 `(` 또는 `,` 트리거가 발동된 시점에 한 번 LSP 를 부른다. 시그니처/오버로드 목록은 그때 받는다.
- 그 뒤로는 캐럿이 같은 호출 안 에서 움직이는 동안 라인 텍스트만 다시 스캔해서 `activeParameter` 를 갱신한다.
- 캐럿이 호출 바깥으로 나가면 (예: 닫는 `)` 를 지남) 팝업을 닫는다.

이걸 처리하는 한 함수가 `SignatureActiveParam.fromLineText` 다.

## 라인 한 줄, 두 번 스캔

알고리즘은 단순하다.

1. 캐럿에서 왼쪽으로 스캔해서 짝이 안 맞는 `(` 를 찾는다 이게 우리가 들어와 있는 함수 호출의 여는 괄호.
2. 그 `(` 에서 캐럿까지 오른쪽으로 스캔해서 깊이 0 의 콤마 개수를 센다 그게 활성 파라미터 인덱스.

```kotlin
object SignatureActiveParam {
    fun fromLineText(lineText: String, caretCol: Int): Int? {
        val col = caretCol.coerceIn(0, lineText.length)
        var depth = 0
        var openParenAt = -1
        var i = col - 1
        while (i >= 0) {
            when (lineText[i]) {
                ')', ']', '}' -> depth++
                '(' -> {
                    if (depth == 0) { openParenAt = i; break }
                    depth--
                }
                '[', '{' -> if (depth > 0) depth--
                '"' -> {
                    var j = i - 1
                    while (j >= 0 && lineText[j] != '"') j--
                    i = j
                    if (i < 0) break
                }
                else -> Unit
            }
            i--
        }
        if (openParenAt < 0) return null

        var commas = 0
        var d = 0
        var k = openParenAt + 1
        var inString = false
        while (k < col) {
            val c = lineText[k]
            if (inString) {
                if (c == '\\' && k + 1 < col) { k += 2; continue }
                if (c == '"') inString = false
                k++
                continue
            }
            when (c) {
                '"' -> inString = true
                '(', '[', '{' -> d++
                ')', ']', '}' -> if (d > 0) d-- else return commas
                ',' -> if (d == 0) commas++
            }
            k++
        }
        return commas
    }
}
```

핵심은 깊이 와 문자열 두 가지다. 콤마는 깊이 0 에서만 의미 있고, 문자열 안의 콤마/괄호는 무시해야 한다.

## 모서리들

처음 짠 단순한 버전은 콤마만 셌다. 그 버전이 깨지는 자리가 줄지어 있었다.

호출 바깥. 캐럿이 `foo(a, b) ` 의 닫는 `)` 뒤에 있다면 활성 파라미터는 없다. 역방향 스캔에서 닫는 `)` 를 만나면 `depth++` 로 두고, 그 짝이 되는 `(` 는 `depth--` 로 무시한다. 결과적으로 매칭이 끝까지 안 맞으면 `openParenAt = -1` 인 채 끝나고 `null` 을 돌려준다.

```kotlin
SignatureActiveParam.fromLineText("foo(a, b) ", 10)  // null
```

중첩 호출. `foo(a, bar(x, y), |)` 에서 캐럿은 세 번째 인자 자리에 있다. 안쪽의 두 콤마는 우리 호출의 콤마가 아니다. 정방향 스캔에서 `(` 가 나오면 `d++`, `)` 가 나오면 `d--`. 콤마는 `d == 0` 일 때만 센다.

```kotlin
SignatureActiveParam.fromLineText("foo(a, bar(x, y), ", 18)  // 2
```

문자열 안 콤마. `foo("a, b", |)` 의 콤마는 두 개로 보이지만 첫 번째 콤마는 문자열 내부다. 인용부호 토글로 처리.

```kotlin
SignatureActiveParam.fromLineText("foo(\"a, b\", ", 12)  // 1
```

미완성 호출. `greet("hi", obj, |` 처럼 닫는 `)` 가 아직 없는 경우. 사용자가 인자를 적는 중이라면 거의 항상 이 상태다. 위 알고리즘은 매칭되는 `)` 가 없어도 잘 동작한다 정방향 스캔이 캐럿까지 가서 멈출 뿐이라 호출이 닫혔든 안 닫혔든 상관없다.

```kotlin
SignatureActiveParam.fromLineText("greet(\"hi\", obj, ", 17)  // 2
```

이게 의외로 컸다. 표준 명세에 적힌 동작 `activeParameter` 가 와야 한다 을 기준으로 짜면, 호출이 닫히기 전까지는 시그니처가 의미 있게 갱신되지 않는다. 클라이언트 측 fallback 은 사용자가 적고 있는 중간 의 상태도 추적할 수 있다.

## 시그니처 단위 한 번 더 `activeParameter` 의 두 층

LSP 명세를 좀 더 읽다 보면 `SignatureInformation` 자체에도 `activeParameter` 가 있다. 시그니처 전체의 디폴트 값을 한 층 더 위에서 덮어쓰는 용도다. 두 군데가 다 있으면 시그니처 쪽이 우선.

```kotlin
fun effectiveActiveParameter(): Int {
    val sig = active ?: return activeParameter
    val overridden = sig.activeParameter
    if (overridden != null) return overridden
    return activeParameter
}
```

LSP 응답을 받은 직후엔 이 값을 쓰고, 캐럿이 움직이는 동안엔 `fromLineText` 로 덮어쓴다. 두 경로가 같은 상태 `lspSignatureActiveParam` 을 갱신한다.

```kotlin
var lspSignatureActiveParam by remember(activePath) { mutableStateOf(0) }

// LSP 응답이 막 도착했을 때
lspSignatureActiveParam = info.effectiveActiveParameter()

// 캐럿이 움직였을 때 — LSP 재요청 없이
val activeP = SignatureActiveParam.fromLineText(sigLine, sigPos.col)
if (activeP != null) lspSignatureActiveParam = activeP
else /* 호출 바깥으로 나감 */ closePopup()
```

`fromLineText` 가 `null` 을 돌려주면 사용자가 호출 바깥으로 빠져나갔다는 신호다. 팝업을 닫는다.

## 테스트

`fromLineText` 는 순수 함수라 Compose 런타임 없이 그대로 테스트할 수 있다. 위 모서리들마다 한 줄씩.

```kotlin
@Test fun `returns null when no open paren before caret`() {
    assertNull(SignatureActiveParam.fromLineText("abc xyz", 4))
}
@Test fun `returns zero just after open paren`() {
    assertEquals(0, SignatureActiveParam.fromLineText("foo(", 4))
}
@Test fun `counts commas at depth zero`() {
    assertEquals(1, SignatureActiveParam.fromLineText("foo(a, ", 7))
    assertEquals(2, SignatureActiveParam.fromLineText("foo(a, b, ", 10))
}
@Test fun `ignores commas inside nested parens`() {
    assertEquals(2, SignatureActiveParam.fromLineText("foo(a, bar(x, y), ", 18))
}
@Test fun `ignores commas inside string literals`() {
    assertEquals(1, SignatureActiveParam.fromLineText("foo(\"a, b\", ", 12))
}
@Test fun `returns null when caret is past matching close paren`() {
    assertNull(SignatureActiveParam.fromLineText("foo(a, b) ", 10))
}
@Test fun `returns commas count even when call is unclosed`() {
    assertEquals(2, SignatureActiveParam.fromLineText("greet(\"hi\", obj, ", 17))
}
```

모서리를 한 번 정리해 두니 그다음에 새 케이스가 떠올라도 줄 하나 추가하면 검증된다. 라인 한 줄을 두 번 스캔하는 작은 함수에 14개 테스트가 붙어 있는 게 과해 보일 수 있는데, 시그니처 팝업의 강조가 한 칸 어긋나면 사용자는 곧장 알아챈다. 강조의 정확성은 LSP 가 알려준 시그니처의 내용 자체만큼 중요하다.

## 돌아보면

이번 일이 작아 보였던 건 한 함수 한 줄짜리 fallback 처럼 보였기 때문이다. 짜고 나니 두 가지가 남았다.

LSP 명세의 optional 필드는 클라이언트의 책임이다. `activeParameter` 가 `Integer?` 라는 건 서버가 안 줄 수 있다 가 아니라 안 주면 클라이언트가 알아서 처리해야 한다 의 뜻이다. PAGE 처럼 자기 IDE 를 만드는 입장에서는 서버가 좋아질 때까지 기다리는 게 답이 아니다 클라이언트 쪽에 fallback 하나가 들어가야 한다.

캐시는 서버 쪽에만 있는 게 아니다. `signatureHelp` 응답은 비싼 호출이라 한 번 받으면 시그니처 라벨은 같은 호출 안에서 계속 유효하다. 그 안에서 캐럿이 움직이는 동안에는 클라이언트가 가지고 있는 텍스트만으로 강조를 갱신할 수 있다. 모든 캐럿 이동마다 서버를 부르는 건 LSP 가 의도한 사용 패턴이 아니다.
