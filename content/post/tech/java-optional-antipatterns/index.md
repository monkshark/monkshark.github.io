---
title: "Java Optional 안티패턴 5가지"
description: "Optional은 null의 만능 대체물이 아니다. 필드·매개변수·orElse 함정 등 실전에서 자주 보이는 다섯 가지 오용을 정리한다."
date: 2026-05-02
slug: java-optional-antipatterns
image:
categories:
    - 기술
tags:
    - Java
    - Optional
    - 디자인
---

Java 8에서 추가된 `Optional`. "null 안전 처리"의 대명사처럼 쓰이지만, 잘못 쓰면 코드가 더 복잡해지고 성능까지 떨어진다. 자주 보이는 다섯 가지를 정리한다.

## 1. 필드에 Optional을 넣기

```java
public class User {
    private Optional<String> nickname;   // ❌
}
```

`Optional`은 직렬화 보장이 없고, 객체 한 단계가 더 끼므로 메모리 오버헤드도 있다. 무엇보다 의도가 흐려진다 — 필드가 비어있을 수 있다는 사실은 도메인 모델 차원에서 명시할 일이지 타입 래퍼로 표현할 일이 아니다.

```java
public class User {
    private String nickname;   // null 가능 (예: @Nullable로 의도 명시)
}
```

## 2. 메서드 매개변수에 Optional을 받기

```java
public void register(Optional<String> referralCode) { ... }   // ❌
```

호출자에게 매번 `Optional.empty()` 또는 `Optional.of(...)`를 만들도록 강요한다. 메서드 시그니처가 짧아진 것도 아니고 호출 부담만 늘어난다.

오버로딩으로 쪼개거나 `null` 허용을 문서화하는 편이 낫다.

```java
public void register() { register(null); }
public void register(String referralCode) { ... }
```

## 3. ifPresent + isPresent로 이중 분기

```java
opt.ifPresent(v -> handle(v));
if (!opt.isPresent()) handleEmpty();   // ❌ Optional의 의미가 사라짐
```

이런 형태로 쓸 거면 `if (opt.isPresent()) { ... } else { ... }`와 다를 게 없다. Java 9+의 `ifPresentOrElse`로 한 줄에 끝낼 수 있다.

```java
opt.ifPresentOrElse(this::handle, this::handleEmpty);
```

## 4. orElse 안에 비싼 호출 넣기

```java
String name = optional.orElse(fetchDefaultFromDb());   // ❌
```

`orElse`의 인자는 Optional이 비어있든 아니든 무조건 평가된다. Optional에 값이 들어있어도 `fetchDefaultFromDb()`는 매번 실행된다. 평소에 거의 쓸모없는 호출이 매번 일어나는 셈이다.

게으른 평가가 필요하면 `orElseGet` — `Supplier`를 받아 비어있을 때만 호출한다.

```java
String name = optional.orElseGet(() -> fetchDefaultFromDb());
```

`orElse`는 리터럴이나 이미 계산된 값일 때만 쓰고, 함수 호출은 거의 다 `orElseGet`이 안전하다.

## 5. Collection을 Optional로 감싸기

```java
public Optional<List<Item>> getItems() { ... }   // ❌
```

빈 리스트라는 자연스러운 "없음"의 표현이 이미 있다. `Optional`로 한 번 더 감싸면 호출자는 두 단계 분기(empty Optional vs empty list)를 다 처리해야 한다.

```java
public List<Item> getItems() { ... }   // 비어있으면 Collections.emptyList() 반환
```

`Map`, `Set`, 배열도 마찬가지다.

## 마무리

`Optional`이 가장 잘 동작하는 자리는 메서드 반환 타입, 그것도 "정상적인 흐름에서 결과가 없을 수 있다"는 신호로 쓸 때다. 매개변수, 필드, 컬렉션 래핑은 거의 다 안티패턴이다.

한 줄로 줄이면, `Optional`은 null의 대체물이 아니라 "결과 없음을 호출자가 명시적으로 다루도록 강제하는 반환 타입"이다.
