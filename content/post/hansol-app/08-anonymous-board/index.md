---
title: "#8 - 익명 게시판, 생각보다 복잡한 '익명'"
description: "익명 번호 일관성, 좋아요 Map vs 배열, n-gram 검색까지 — 학교 게시판의 설계 결정들"
date: 2026-04-12
slug: anonymous-board
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - Firestore
    - 게시판
    - 익명
    - 검색
---

## "익명"이면 그냥 이름 숨기면 되는 거 아닌가

처음에는 그렇게 생각했다. `isAnonymous: true`면 이름 대신 "익명"을 표시하면 끝. 하지만 실제로 만들어보니 익명 게시판에는 생각보다 많은 설계 결정이 필요했다.

## 익명 번호: "익명1"과 "익명2"는 같은 사람인가

익명 게시판에서 댓글이 달리면 이런 상황이 생긴다:

```
익명 — 오늘 급식 맛있었나요?
  └ 익명 — 네 괜찮았어요
  └ 익명 — 별로였는데
  └ 익명 — 저도 괜찮았어요
```

"괜찮았어요"를 쓴 첫 번째 사람과 세 번째 사람이 같은 사람인지 알 수 없다. 대화 맥락이 끊긴다. 에브리타임 같은 서비스에서는 이걸 익명 번호로 해결한다: "익명1", "익명2"처럼.

```
익명 — 오늘 급식 맛있었나요?
  └ 익명1 — 네 괜찮았어요
  └ 익명2 — 별로였는데
  └ 익명1 — 저도 괜찮았어요
```

이제 "익명1"이 같은 사람이라는 걸 알 수 있다.

### anonymousMapping

이 기능을 구현하려면 "이 게시글에서 이 사용자가 몇 번 익명인지"를 추적해야 한다. Firestore 문서에 `anonymousMapping`과 `anonymousCount` 필드를 뒀다.

```dart
Future<String> resolveAnonymousName(
  String postId, String uid,
  String authorLabel,
  String Function(int) anonymousNumLabel,
) async {
  final ref = postRef(postId);
  final postSnap = await ref.get();
  final postAuthorUid = postSnap.data()?['authorUid'];

  // 글 작성자는 "작성자"로 표시
  if (uid == postAuthorUid) return authorLabel;

  return _db.runTransaction<String>((transaction) async {
    final postDoc = await transaction.get(ref);
    final data = postDoc.data() ?? {};
    final mapping = Map<String, dynamic>.from(data['anonymousMapping'] ?? {});
    final count = (data['anonymousCount'] as int?) ?? 0;

    if (mapping.containsKey(uid)) {
      return anonymousNumLabel(mapping[uid]);  // 기존 번호 반환
    } else {
      final newNum = count + 1;
      mapping[uid] = newNum;
      transaction.update(ref, {
        'anonymousMapping': mapping,
        'anonymousCount': newNum,
      });
      return anonymousNumLabel(newNum);  // 새 번호 부여
    }
  });
}
```

Firestore 트랜잭션을 쓰는 이유는 동시성 문제 때문이다. 두 사람이 동시에 댓글을 달면 같은 번호를 받을 수 있다. 트랜잭션으로 읽기-확인-쓰기를 원자적으로 처리해야 번호가 중복되지 않는다.

글 작성자는 "익명1"이 아니라 "작성자"로 표시된다. 자기 글의 댓글에서 글쓴이를 구분할 수 있어야 하니까.

### 댓글 렌더링

댓글을 화면에 표시할 때는 `anonymousMapping`을 미리 로드해두고, 각 댓글의 `authorUid`로 번호를 조회한다:

```dart
if (c['isAnonymous'] == true && c['authorUid'] != null) {
  final uid = c['authorUid'] as String;
  if (uid == _currentPostAuthorUid) {
    c['authorName'] = AppLocalizations.of(context)!.post_anonymousAuthor;
  } else if (_anonymousMapping.containsKey(uid)) {
    c['authorName'] = AppLocalizations.of(context)!.post_anonymousNum(
      _anonymousMapping[uid]
    );
  }
}
```

i18n도 적용되어 있다. 한국어에서는 "익명1", 영어에서는 "Anonymous 1".

## 좋아요: 배열에서 Map으로

### 처음: 배열

```
likes: ["uid1", "uid2", "uid3"]
```

단순하다. `arrayContains`로 내가 좋아요를 눌렀는지 확인하고, `arrayUnion`/`arrayRemove`로 추가/삭제. 하지만 문제가 있었다:

- 두 명이 동시에 좋아요를 누르면 한쪽이 씹힐 수 있다
- "인기글" 정렬을 하려면 배열 크기로 정렬해야 하는데, Firestore에서는 배열 크기 기준 정렬이 불가능하다

### 지금: Map + 비정규화 카운터

```
likes: {"uid1": true, "uid2": true}
likeCount: 2
```

Map으로 바꾸면서 동시 업데이트 문제가 해결되었다. 각 uid가 독립적인 필드이기 때문에, 두 사람이 동시에 눌러도 충돌하지 않는다.

```dart
Future<void> toggleLike(String postId, String uid, {
  required bool hasLiked,
  required bool hasDisliked,
}) async {
  if (hasLiked) {
    await postRef(postId).update({
      'likes.$uid': FieldValue.delete(),
      'likeCount': FieldValue.increment(-1),
    });
  } else {
    final updates = <String, dynamic>{
      'likes.$uid': true,
      'likeCount': FieldValue.increment(1),
    };
    if (hasDisliked) {
      updates['dislikes.$uid'] = FieldValue.delete();
      updates['dislikeCount'] = FieldValue.increment(-1);
    }
    await postRef(postId).update(updates);
  }
}
```

`likes.$uid` Firestore의 dot notation으로 Map의 특정 키만 업데이트한다. `FieldValue.increment(-1)`로 카운터를 원자적으로 감소시킨다. 좋아요를 누르면서 동시에 싫어요를 취소하는 것도 한 번의 업데이트로 처리한다.

`likeCount`는 비정규화된 필드다. `likes` Map의 크기와 항상 같아야 한다. 이걸 별도로 유지하는 이유는 오직 정렬 때문이다. "인기글" 탭에서 `likeCount` 내림차순으로 정렬하려면 이 필드가 필요하다.

## 검색: Firestore에서 "급식"을 찾으려면

Firestore에는 `LIKE '%급식%'` 같은 전문 검색이 없다. 공식적으로는 Algolia나 Typesense 같은 외부 검색 엔진을 붙이라고 권장한다. 하지만 학생 프로젝트에서 외부 서비스 비용과 관리 부담은 크다.

### n-gram 토큰

대안으로 2-gram 토큰 방식을 썼다. 게시글을 저장할 때 제목과 내용에서 2글자 단위로 토큰을 추출한다:

```dart
static List<String> forDocument(String title, String content, {int maxTokens = 200}) {
  final combined = '$title $content';
  final tokens = _ngrams(combined);
  if (tokens.length <= maxTokens) return tokens.toList();
  return tokens.take(maxTokens).toList();
}

static Set<String> _ngrams(String text) {
  final cleaned = _normalize(text);
  final out = <String>{};
  for (int i = 0; i + 2 <= cleaned.length; i++) {
    out.add(cleaned.substring(i, i + 2));
  }
  return out;
}
```

"오늘 급식 맛있었다" → `["오늘", "늘급", "급식", "식맛", "맛있", "있었", "었다"]`

정규화 과정에서 특수문자와 공백을 제거하고, 영어는 소문자로 통일한다. 한글, 영어, 숫자만 남긴다.

검색 시에는 쿼리도 같은 방식으로 토큰화한 후 `arrayContainsAny`로 Firestore에 쿼리한다:

```dart
static List<String> forQuery(String query, {int maxTokens = 10}) {
  final cleaned = _normalize(query);
  if (cleaned.length == 1) return [cleaned];
  final tokens = _ngrams(query);
  return tokens.take(maxTokens).toList();
}
```

완벽한 검색은 아니다. "급"만 검색하면 2-gram이 안 만들어지므로 1글자 검색은 정확도가 떨어진다. 문서당 토큰은 200개로 제한하여 Firestore 문서 크기가 과도하게 커지는 걸 방지한다. 하지만 학교 게시판에서 "급식", "시간표", "동아리" 같은 2글자 이상 키워드 검색에는 잘 동작한다.

## 카테고리 시스템

게시판은 6개 카테고리로 나뉜다:

| 카테고리 | FCM 토픽 | 색상 |
|---------|---------|------|
| 자유 | free | 기본 |
| 질문 | question | 보조 |
| 정보공유 | info | 3차 |
| 분실물 | lost | 주황 |
| 학생회 | council | 초록 |
| 동아리 | club | 보라 |

여기에 "전체"와 "인기글" 탭이 추가된다. "전체"는 모든 카테고리를 보여주고, "인기글"은 `likeCount` 기준으로 정렬한다.

FCM 토픽은 카테고리별 알림 구독을 위해 영어 키로 매핑한다. 사용자가 "자유" 카테고리만 구독하면 해당 토픽의 알림만 받는다.

## 추가 기능들

- 북마크: `bookmarkedBy` 배열에 uid를 넣어서 내가 북마크한 글을 모아볼 수 있다
- 고정글: `isPinned`과 `pinnedAt`으로 관리자가 글을 상단 고정
- 투표: `pollOptions`와 `pollVoters`로 글 안에서 투표 가능. `pollVoters`는 `{uid: optionIndex}` Map
- 이미지: `imageUrls` 배열로 다중 이미지 첨부. Firebase Storage에 업로드 후 URL 저장
- 해결됨: 질문 카테고리에서 `isResolved`로 해결된 질문 표시

## 돌아보면

익명 게시판은 "이름을 숨긴다"가 아니라 "이름을 숨기면서도 대화 맥락을 유지한다"가 핵심이었다. `anonymousMapping` 하나를 추가하는 것이 사소해 보이지만, 트랜잭션으로 동시성을 처리하고, 글 작성자를 별도로 표시하고, i18n을 적용하는 과정이 필요했다.

좋아요도 검색도 마찬가지다. Firestore의 제약 안에서 "그럴듯하게 동작하는" 것을 만드는 게 NoSQL 설계의 핵심인 것 같다.
