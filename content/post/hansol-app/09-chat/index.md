---
title: "#9 - 1:1 채팅, 실시간의 무게"
description: "uid 정렬로 채팅방 ID 만들기, deletedFor로 '나만 삭제' 구현하기, 읽음 표시까지"
date: 2026-04-13
slug: chat
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - Firestore
    - 채팅
    - 실시간
---

## 채팅이 필요한 이유

게시판만으로는 부족한 순간이 있다. 분실물 게시판에서 "제 카드키 찾으신 분 연락주세요"라고 올리면, 찾은 사람이 연락할 방법이 없다. 댓글로 개인 정보를 주고받을 수도 없고. 1:1 채팅이 필요해진 순간이다.

## 채팅방 ID: 정렬의 힘

A가 B에게 채팅을 걸든, B가 A에게 걸든 같은 채팅방이어야 한다. 중복 채팅방이 생기면 대화가 갈린다.

```dart
String _getChatId(String uid1, String uid2) {
  final sorted = [uid1, uid2]..sort();
  return '${sorted[0]}_${sorted[1]}';
}
```

두 uid를 알파벳 순서로 정렬하고 `_`로 연결한다. `abc123`과 `xyz789`의 조합은 항상 `abc123_xyz789`가 된다. 누가 먼저 시작했는지와 관계없이 같은 ID.

채팅방을 생성할 때는 이 ID로 문서가 이미 있는지 확인하고, 없으면 만든다:

```dart
Future<void> startChat(String otherUid, String otherName) async {
  final chatId = _getChatId(myUid, otherUid);
  final doc = await FirebaseFirestore.instance.collection('chats').doc(chatId).get();

  if (!doc.exists) {
    await FirebaseFirestore.instance.collection('chats').doc(chatId).set({
      'participants': [myUid, otherUid],
      'participantNames': {myUid: myName, otherUid: otherName},
      'lastMessage': '',
      'lastMessageAt': FieldValue.serverTimestamp(),
      'unreadCount': {myUid: 0, otherUid: 0},
    });
  }

  // 채팅방 화면으로 이동
}
```

## 메시지 전송

```dart
Future<void> _sendMessage() async {
  final text = _controller.text.trim();
  if (text.isEmpty) return;
  _controller.clear();

  await FirebaseFirestore.instance
    .collection('chats').doc(chatId)
    .collection('messages').add({
      'content': text,
      'senderUid': myUid,
      'senderName': myName,
      'createdAt': FieldValue.serverTimestamp(),
      'deletedFor': [],
    });

  await FirebaseFirestore.instance.collection('chats').doc(chatId).update({
    'lastMessage': text,
    'lastMessageAt': FieldValue.serverTimestamp(),
    'unreadCount.${widget.otherUid}': FieldValue.increment(1),
  });
}
```

메시지를 보내면 두 가지 업데이트가 일어난다:

1. `messages` 서브컬렉션에 메시지 문서 추가
2. 부모 `chats` 문서의 `lastMessage`, `lastMessageAt`, 상대방의 `unreadCount` 업데이트

`unreadCount.${widget.otherUid}` dot notation으로 상대방의 읽지 않은 메시지 수만 증가시킨다. 내 카운트는 건드리지 않는다.

입력 필드를 먼저 비우고(`_controller.clear()`) 나서 네트워크 요청을 보낸다. 전송이 완료될 때까지 입력 필드가 남아있으면 사용자가 답답해하니까.

## 이미지 전송

```dart
Future<void> _sendImage() async {
  final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
  if (picked == null) return;

  // 압축
  final compressed = await FlutterImageCompress.compressWithFile(
    picked.path, quality: 80, minWidth: 1280, minHeight: 1280,
  );

  // Firebase Storage 업로드
  final path = 'chats/$chatId/${DateTime.now().millisecondsSinceEpoch}_$myUid.jpg';
  final ref = FirebaseStorage.instance.ref(path);
  await ref.putData(compressed);
  final url = await ref.getDownloadURL();

  // 이미지 URL을 메시지로 전송
  await _addMessage(imageUrl: url);
}
```

이미지는 선택 → 압축 → Storage 업로드 → URL을 메시지에 저장하는 순서다. 원본 대신 1280px, 80% 품질로 압축하여 용량을 줄인다. 채팅방마다 Storage 경로를 분리해서 정리도 쉽다.

## "나만 삭제"와 "모두에게서 삭제"

카카오톡처럼 두 가지 삭제 옵션이 있다.

### 나만 삭제

```dart
Future<void> _deleteForMe(String messageId) async {
  await FirebaseFirestore.instance
    .collection('chats').doc(chatId)
    .collection('messages').doc(messageId)
    .update({
      'deletedFor': FieldValue.arrayUnion([myUid]),
    });
}
```

메시지를 실제로 삭제하지 않고, `deletedFor` 배열에 내 uid를 추가한다. 메시지를 표시할 때 이 배열을 확인:

```dart
final deletedFor = List<String>.from(data['deletedFor'] ?? []);
if (deletedFor.contains(uid)) return const SizedBox.shrink();
```

내 uid가 `deletedFor`에 있으면 렌더링하지 않는다. 상대방에게는 여전히 보인다.

### 모두에게서 삭제

```dart
Future<void> _deleteForAll(String messageId) async {
  await FirebaseFirestore.instance
    .collection('chats').doc(chatId)
    .collection('messages').doc(messageId)
    .update({
      'deleted': true,
      'content': AppLocalizations.of(context)!.chat_deletedMessage,
    });
}
```

`deleted: true`로 표시하고 내용을 "삭제된 메시지"로 바꾼다. 양쪽 모두에게 "삭제된 메시지"가 보인다.

단, 조건이 있다: 보낸 지 1시간 이내이고 상대방이 아직 읽지 않았을 때만 가능하다.

```dart
canDeleteForAll = isWithinOneHour && (otherUnread > 0);
```

이미 읽은 메시지를 삭제하는 건 의미가 없으니까.

## 읽음 표시

`unreadCount`를 활용하여 읽음 표시를 구현한다.

채팅방에 들어가면 내 `unreadCount`를 0으로 초기화:

```dart
@override
void initState() {
  super.initState();
  FirebaseFirestore.instance.collection('chats').doc(chatId).update({
    'unreadCount.$myUid': 0,
  });
}
```

메시지 옆에 "읽음" 표시를 보여주는 로직은 상대방의 unreadCount를 역산하는 방식이다. 상대방이 3개를 안 읽었으면, 내가 보낸 최근 3개 메시지에는 "읽음"이 표시되지 않고 나머지에는 표시된다.

## 채팅 목록

```dart
FirebaseFirestore.instance
  .collection('chats')
  .where('participants', arrayContains: myUid)
  .orderBy('lastMessageAt', descending: true)
  .snapshots()
```

내가 참여한 채팅방을 최근 메시지 순으로 실시간 스트리밍한다. 새 메시지가 오면 목록이 자동으로 재정렬된다.

각 채팅방 아이템에는 상대 이름, 마지막 메시지, 시간, 읽지 않은 메시지 수가 표시된다. 읽지 않은 메시지가 있으면 빨간 뱃지가 뜬다.

## 채팅방 나가기

```dart
Future<void> _leaveChat() async {
  // 시스템 메시지 추가
  await messagesRef.add({
    'type': 'system',
    'content': '$myName님이 나갔습니다',
    'createdAt': FieldValue.serverTimestamp(),
  });

  // 참가자 목록에서 제거
  await chatRef.update({
    'participants': FieldValue.arrayRemove([myUid]),
    'lastMessage': '$myName님이 나갔습니다',
  });
}
```

채팅방을 나가면 시스템 메시지를 남기고 참가자 목록에서 제거된다. 상대방에게는 "○○님이 나갔습니다"가 표시된다.

## 돌아보면

채팅의 핵심은 "실시간"이라기보다 "상태 동기화"였다. 읽음/안읽음, 삭제됨/안삭제됨, 참가 중/나감 양쪽의 상태가 항상 일치해야 한다. Firestore의 실시간 스트리밍이 이 동기화를 거의 공짜로 해주지만, 구조를 잘 잡아야 그 혜택을 받을 수 있다.

uid 정렬로 채팅방 ID를 만드는 건 작은 결정이지만, 이 한 줄이 "중복 채팅방" 문제를 원천 차단했다. 작은 결정이 큰 버그를 예방하는 경험이었다.
