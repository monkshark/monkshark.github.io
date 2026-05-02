---
title: "Stream.toList()와 collect(toList())는 같지 않다"
description: "Java 16+ Stream.toList()는 immutable, 기존 Collectors.toList()는 mutable. 무심코 갈아끼우면 UnsupportedOperationException."
date: 2026-05-02
slug: stream-tolist-vs-collect
image:
categories:
    - TIL
tags:
    - Java
    - Stream
    - TIL
---

Java 16에서 추가된 `Stream.toList()`. 기존 `collect(Collectors.toList())`보다 짧아서 무심코 일괄 치환했다가 `UnsupportedOperationException`을 만나는 경우가 있다.

## 결론부터

| 메서드 | 반환 List 변경 가능 여부 |
| --- | --- |
| `Stream.toList()` (Java 16+) | 불가능 (immutable) |
| `Collectors.toList()` | 가능 (mutable, 일반적으로 ArrayList) |
| `Collectors.toUnmodifiableList()` | 불가능 (immutable) |

## 코드로 비교

```java
List<String> a = Stream.of("x", "y").toList();
a.add("z");                                        // UnsupportedOperationException

List<String> b = Stream.of("x", "y").collect(Collectors.toList());
b.add("z");                                        // OK
```

이름과 결과는 비슷하지만 동작이 다르다.

## 왜 다른가

`Collectors.toList()`의 명세에는 "반환 리스트의 type, mutability, serializability, thread-safety는 보장하지 않는다"라고 적혀 있다. 다만 실제 구현이 오랜 기간 `ArrayList`였고, 사람들이 그 동작에 의존해서 add를 호출해 왔다. 코드베이스 곳곳에 mutable 가정이 박혀 있는 상태다.

`Stream.toList()`는 새로 추가되면서 처음부터 immutable이라고 명시했다. 명세대로 변경 메서드는 던진다.

## 어떻게 갈아끼울지

- 결과를 그대로 읽기만 하면 `Stream.toList()`가 낫다. 짧고 의도(불변)도 명확하다.
- 이후 `add` / `remove` / 정렬 등 변경이 필요하면 `collect(Collectors.toList())` 또는 `new ArrayList<>(stream.toList())`.
- 명시적으로 불변을 보장하고 싶으면 `Collectors.toUnmodifiableList()` 또는 `List.copyOf(...)`.

## 마무리

리팩토링하면서 IDE 일괄 변환으로 `.collect(Collectors.toList())`를 `.toList()`로 모두 바꿨다가, mutable에 의존한 코드가 한참 후 단위 테스트에서 깨지는 경우가 있다. 같은 이름이라도 명세가 다르면 결과도 다르다.
