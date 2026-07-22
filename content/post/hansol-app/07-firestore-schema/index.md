---
title: "#7 - Firestore 스키마, 처음부터 다시 설계한다면"
description: "게시판, 채팅, 사용자 관리 — 8개 컬렉션의 구조와 설계하면서 배운 것들"
date: 2026-04-11
slug: firestore-schema
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - Firestore
    - NoSQL
    - 스키마 설계
---

## 학교 앱에 Firestore가 필요한 이유

급식과 시간표는 NEIS API로 충분하다. 하지만 학교 앱이 단순 정보 조회를 넘어서려면 게시판, 채팅, 사용자 인증 자체 데이터베이스가 필요하다.

Firebase의 Firestore를 선택한 이유는 단순했다. 서버를 직접 운영할 필요가 없고, 실시간 동기화가 기본이고, Flutter와의 통합이 잘 되어 있다. 무엇보다 학생 혼자 운영하는 앱에서 서버 관리까지 할 여유는 없었다.

현재 앱에는 8개의 Firestore 컬렉션이 있다. 각각의 구조와 설계 과정에서 배운 것들을 정리한다.

## users: 사용자 프로필

```
users/{uid}
├── uid, name, email
├── studentId, grade, classNum
├── role: "user" | "manager" | "admin"
├── userType: "student" | "graduate" | "teacher" | "parent"
├── approved: true/false
├── blockedUsers: [uid, uid, ...]
├── fcmToken: "..."
├── profilePhotoUrl, graduationYear, teacherSubject
├── lastProfileUpdate, updatedAt
│
├── /sync/schedules  → 개인 시간표
├── /sync/ddays      → D-day 목록
└── /notifications   → 알림 내역
```

`role` 필드가 3단계(`user`, `manager`, `admin`)인 건 나중에 추가한 것이다. 처음에는 `isAdmin: true/false`로 시작했다가, 학생회 임원에게 일부 권한만 주고 싶어서 `manager` 역할을 중간에 넣었다.

`approved` 필드는 가입 승인 시스템이다. 아무나 학교 앱에 글을 쓸 수 없도록, 가입 후 관리자가 승인해야 게시판 접근이 가능하다. 학교 앱이라는 특성상 필수적인 기능이었다.

`blockedUsers` 배열은 사용자 차단 기능이다. 차단한 사용자의 게시글과 댓글이 보이지 않는다. 이걸 서버 쿼리로 처리하면 Firestore `not-in` 쿼리 제한(10개)에 걸리기 때문에, 클라이언트에서 필터링한다.

### 서브컬렉션: sync

`users/{uid}/sync/schedules`와 `users/{uid}/sync/ddays`는 개인 데이터의 기기 간 동기화를 위한 구조다. 로컬 SQLite에 저장하되, Firestore에도 백업하여 기기를 바꿔도 데이터가 유지된다.

처음에는 Firestore만 사용했다. 하지만 시간표를 볼 때마다 네트워크 요청이 발생하는 게 급식 API와 같은 문제였다. 결국 로컬 SQLite + Firestore 동기화 구조로 바꿨다.

## posts: 게시판

```
posts/{postId}
├── title, content, authorUid, authorName
├── category: "자유" | "질문" | "정보공유" | "분실물" | "학생회" | "동아리"
├── isAnonymous, isPinned, isResolved
├── likes: {uid: true, uid: true, ...}
├── dislikes: {uid: true, uid: true, ...}
├── likeCount, dislikeCount          ← 비정규화된 카운터
├── commentCount
├── bookmarkedBy: [uid, uid, ...]
├── searchTokens: ["급식", "식메", "메뉴", ...]   ← n-gram
├── pollOptions, pollVoters
├── imageUrls: [...]
├── createdAt, pinnedAt
│
└── /comments/{commentId}
    ├── content, authorUid, authorName
    ├── isAnonymous, likes, dislikes
    ├── imageUrl, mentions
    └── createdAt
```

이 컬렉션에서 가장 많이 고민한 것이 좋아요 구조다.

### 좋아요: 배열 vs Map

처음에는 `likes: [uid1, uid2, uid3]` 배열이었다. 누가 좋아요를 눌렀는지 확인하려면 `arrayContains`로 쿼리하면 된다. 하지만 문제가 있었다:

- 좋아요/취소가 동시에 발생하면 배열이 꼬일 수 있다
- Firestore의 `arrayUnion`/`arrayRemove`가 있지만, 트랜잭션 없이는 race condition에 취약하다

Map 구조(`likes: {uid: true}`)로 바꾸면서 해결했다. 특정 uid의 좋아요 여부를 확인하는 것도, 추가/삭제하는 것도 간단하다.

### likeCount: 비정규화의 필요성

"인기글" 정렬이 필요했다. Firestore에서 Map의 크기로 정렬하는 건 불가능하다. `likes` Map의 키 개수를 실시간으로 세는 것도 비효율적이다.

결국 `likeCount`, `dislikeCount` 필드를 별도로 두고, 좋아요를 누를 때마다 트랜잭션으로 함께 업데이트한다. NoSQL에서는 이런 비정규화가 일상이다. RDB의 `COUNT(*)` 대신 미리 계산해두는 것.

### 검색: n-gram 토큰

Firestore는 전문 검색(full-text search)을 지원하지 않는다. "급식 메뉴"를 검색하려면 별도 검색 엔진(Algolia, Typesense 등)이 필요한데, 학생 프로젝트에서 외부 서비스를 붙이기는 부담스러웠다.

대안으로 n-gram 토큰을 사용했다. 게시글을 저장할 때 제목과 내용에서 2글자 단위로 토큰을 추출하여 `searchTokens` 배열에 저장한다.

```
"급식 메뉴 변경" → ["급식", "식 ", " 메", "메뉴", "뉴 ", " 변", "변경"]
```

검색 시 `arrayContainsAny`로 쿼리한다. 완벽한 전문 검색은 아니지만, 학교 게시판 규모에서는 충분히 동작한다.

### 익명 게시판

`isAnonymous` 필드와 함께 `anonymousMapping`, `anonymousCount`가 있다. 같은 게시글에 같은 익명 사용자가 여러 댓글을 달면 "익명1", "익명1"로 일관되게 표시해야 한다. `anonymousMapping`은 `{uid: 1, uid: 2}` 형태로 익명 번호를 추적한다.

## chats: 1:1 채팅

```
chats/{chatId}              ← chatId = 정렬된 두 uid 조합
├── participants: [uid, uid]
├── participantNames: {uid: "이름", uid: "이름"}
├── lastMessage, lastMessageAt
├── unreadCount: {uid: 3, uid: 0}
│
└── /messages/{messageId}
    ├── type: "text" | "system"
    ├── content, imageUrl
    ├── senderUid, senderName
    ├── deletedFor: [uid, ...]
    └── createdAt
```

`chatId`를 두 사용자의 uid를 정렬하여 합친 값으로 쓴다. A와 B의 채팅방은 항상 같은 ID를 가지므로, 중복 채팅방이 생기지 않는다.

`unreadCount`를 Map으로 관리하는 것은 각 사용자가 읽지 않은 메시지 수를 독립적으로 추적하기 위해서다. A가 메시지를 보내면 B의 카운트가 올라가고, B가 채팅방을 열면 B의 카운트가 0으로 초기화된다.

`deletedFor` 배열은 "나만 삭제" 기능이다. 메시지를 실제로 삭제하지 않고, 삭제를 요청한 사용자의 uid를 배열에 추가한다. 클라이언트에서 자신의 uid가 `deletedFor`에 있으면 해당 메시지를 표시하지 않는다.

## 나머지 컬렉션들

### reports 신고

게시글 신고 시 `postId`, `reporterUid`, `reason`, `detail`을 저장한다. 관리자 화면에서 목록을 보고 조치한다.

### admin_logs 관리 기록

사용자 정지, 게시글 삭제 등 관리자 행동을 기록한다. `action`, `targetUid`, `details`, `timestamp`. 누가 무엇을 했는지 추적할 수 있어야 관리자가 여러 명이어도 문제를 파악할 수 있다.

### app_feedbacks / council_feedbacks 피드백

사용자가 앱이나 학생회에 보내는 피드백. `content`, `imageUrls`, `status`(pending/addressed). 이미지 첨부가 가능하고, 처리 상태를 관리자가 업데이트한다.

### crash_logs 오류 기록

```dart
// main.dart
FlutterError.onError = (details) {
  FirebaseFirestore.instance.collection('crash_logs').add({
    'error': details.exceptionAsString().substring(0, 500),
    'stack': details.stack.toString().substring(0, 1000),
    'uid': currentUser?.uid,
    'createdAt': FieldValue.serverTimestamp(),
  });
};
```

Crashlytics 대신 간단하게 만든 오류 수집기. `error`와 `stack`을 각각 500자, 1000자로 잘라서 저장한다. 문서 크기 폭발을 방지하기 위한 장치다.

### app_config 앱 설정

`app_config/popup` 문서 하나로 팝업 공지를 관리한다. 앱을 열 때 이 문서를 확인하고, 활성화된 팝업이 있으면 표시한다. 관리자 화면에서 실시간으로 팝업을 켜고 끌 수 있다.

## 설계하면서 배운 것

### 1. Firestore는 쿼리부터 설계한다

RDB에서는 데이터를 정규화하고, 필요할 때 JOIN한다. Firestore에서는 어떤 쿼리를 할 것인지 먼저 정하고, 그 쿼리에 맞게 데이터를 배치한다. `likeCount` 같은 비정규화가 그 예다.

### 2. 배열의 한계를 알아야 한다

Firestore에서 배열은 편리하지만 제약이 많다. `arrayContainsAny`는 최대 30개 값만 비교할 수 있고, `not-in`은 10개까지다. `blockedUsers`를 서버 쿼리로 필터링하지 못하고 클라이언트에서 처리하는 것도 이 제약 때문이다.

### 3. 문서 크기를 의식해야 한다

Firestore 문서 최대 크기는 1MB다. `likes` Map에 사용자가 수천 명 좋아요를 누르면 문서가 커진다. 학교 앱 규모에서는 문제가 안 되지만, 설계 단계에서 "이 필드가 무한히 커질 수 있는가"를 항상 생각해야 한다.

`crash_logs`에서 `error`와 `stack`을 잘라서 저장하는 것도 같은 이유다. 스택 트레이스 전체를 저장하면 문서 하나가 수십 KB가 될 수 있다.

### 4. 보안 규칙은 스키마의 일부다

Firestore Security Rules로 "자기 게시글만 수정 가능", "승인된 사용자만 글 작성 가능", "관리자만 사용자 정지 가능" 같은 규칙을 강제한다. 스키마를 설계할 때 보안 규칙에서 검증 가능한 구조인지도 함께 고려해야 한다.

## 돌아보면

8개 컬렉션은 한 번에 설계한 게 아니다. `users`와 `posts`로 시작해서, 채팅이 필요해지면 `chats`를, 신고가 필요해지면 `reports`를 추가했다. 기능이 늘어날 때마다 컬렉션이 하나씩 생겼다.

처음부터 다시 설계한다면 크게 바꿀 것은 없다. 다만 `searchTokens`의 n-gram 방식은 게시글이 많아지면 한계가 있으니, Algolia 같은 외부 검색 서비스를 처음부터 고려했을 것이다. 그리고 `crash_logs`는 Crashlytics로 대체하는 게 더 나았을 것이다.

하지만 학생이 혼자 만드는 앱에서 "완벽한 설계"를 추구하면 아무것도 못 만든다. 일단 동작하게 만들고, 문제가 생기면 고치는 것. NEIS API가 80줄에서 320줄로 진화한 것처럼, Firestore 스키마도 사용하면서 계속 진화하고 있다.

아직 배포를 하진 않았지만, 배포 후 사용자가 많아져서 Firebase에 요금이 청구되기 시작하면 Firestore를 걷어내고 직접 백엔드를 구축할 생각도 있다. 내 첫 메인 프로젝트지만 돈이 아깝다.
