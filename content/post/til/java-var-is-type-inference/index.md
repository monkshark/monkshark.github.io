---
title: "Java의 var는 dynamic typing이 아니다"
description: "Java 10+ var는 컴파일 타임 타입 추론. JS의 var나 Python 변수와는 동작이 완전히 다르다."
date: 2026-05-02
slug: java-var-is-type-inference
image:
categories:
    - TIL
tags:
    - Java
    - TIL
---

Java 10에서 추가된 지역 변수 `var`. 처음 본 사람이 자주 오해하는 부분이 있다.

## var는 컴파일 타임 타입 추론이다

```java
var count = 10;
count = "hello";   // 컴파일 에러
```

`var count = 10`을 보면 컴파일러가 우변(`10`)을 분석해서 `count`의 타입을 `int`로 고정한다. 그 뒤로 다른 타입을 대입할 수 없다.

JavaScript의 `var`나 Python 변수와는 다르다. 저쪽은 런타임에 타입이 자유롭게 바뀌지만, Java의 `var`는 작성 시점에 이미 타입이 결정되어 있고 단지 직접 적지 않을 뿐이다.

## 어디서 쓰면 좋은가

```java
var users = new ArrayList<UserSummary>();   // 우변에 타입이 보임
var line = reader.readLine();               // String임이 명확
var entry = map.entrySet().iterator().next();  // 길어지는 제네릭 생략
```

우변만으로 타입을 즉시 알 수 있을 때는 `var`가 가독성을 높여준다.

## 어디서 쓰지 않는 게 나은가

### 우변만 봐서는 타입이 안 보일 때

```java
var result = service.process(input);   // 결과 타입이 뭔지 알기 어려움
```

코드 리뷰어는 IDE 없이 GitHub diff로 보는 경우도 많다. 명시적으로 적어주면 리뷰가 빨라진다.

### 람다 매개변수

```java
var f = (String s) -> s.length();   // 컴파일 에러
```

`var`는 람다 자체에는 쓸 수 없다. 우변이 람다일 때 좌변 타입을 알아야 컴파일러가 람다를 어떤 함수형 인터페이스로 해석할지 결정할 수 있기 때문이다.

### primitive와 박싱이 의도된 경우

```java
var x = 0;                       // int
var y = Integer.valueOf(0);      // Integer
```

성능이나 null 가능성이 중요한 코드라면 의도를 명시하는 편이 안전하다.

## 마무리

`var`는 "타입 적기 귀찮을 때 쓰는 dynamic 변수"가 아니라 "컴파일러가 우변 보고 타입을 채워주는 단축 표기"다. 동작이 다르니 사용 경계도 다르다.
