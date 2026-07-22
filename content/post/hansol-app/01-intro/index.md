---
title: "#1 - 프로젝트를 시작한 이유"
description: "고등학교 재학 중 직접 느낀 불편함을 해결하기 위해 Flutter + Firebase로 학교 앱을 만들기 시작했다"
date: 2026-04-05
slug: hansol-app-intro
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - Firebase
    - Riverpod
    - 프로젝트 시작
draft: false
---

## 왜 만들었나

고등학교 재학 중에 직접 느낀 불편함이 시작점이었다.

급식 확인이 번거롭다. 오늘 뭐 나오는지 알려면 매번 학교 홈페이지에 들어가서 주간 급식표를 찾아야 했다. 모바일에서 학교 홈페이지는 반응형도 아니라서, 핀치 줌으로 표를 확대해서 오늘 날짜를 찾는 과정을 매일 반복했다. 아침마다.

시간표 관리가 불편하다. 종이 시간표를 사진 찍어 갤러리에 넣어두거나, 기억에 의존했다. 시간표가 바뀌면 다시 사진 찍고, 예전 사진은 삭제하고. 특히 2·3학년은 선택과목 때문에 반 친구와 시간표가 다른 경우가 많았는데, 이건 나중에 직접 부딪혀서야 알게 된 문제였다.

학교 커뮤니티가 없다. 학생들끼리 소통할 수 있는 공간이 마땅치 않았다. 단체 카톡방은 있었지만, 익명 게시판이나 학년을 넘어선 소통 채널은 없었다.

이 세 가지 문제를 하나의 앱으로 해결하고 싶었다. 급식, 시간표, 학사일정을 한눈에 보고, 게시판과 채팅으로 학교 구성원들이 소통할 수 있는 통합 플랫폼.

## 기술 스택 선택

프로그래밍 기초는 있었지만 모바일 앱 개발은 처음이었다. 어떤 기술을 써야 하는지부터 조사해야 했다.

### Flutter를 선택한 이유

처음에는 Java로 Android 네이티브 앱을 만들었다. Java를 조금 알고 있었으니까 진입이 가장 쉬웠다. 하지만 이후 학교에서 부스를 운영하면서 iOS 사용자가 절반이라는 걸 알게 되었고, 크로스플랫폼이 필수라는 결론에 도달했다. ([#2 Java에서 Flutter로](/p/java-to-flutter/)에서 자세히 다룬다.)

Flutter를 선택한 이유:

- 크로스 플랫폼 Android + iOS를 하나의 코드베이스로. 1인 개발에서 두 플랫폼을 따로 만드는 건 비현실적이었다
- Dart 언어 Java에서 넘어오기에 문법이 친숙했다. 타입 안전성이 있으면서도 컬렉션 API가 간결해서 데이터 파싱에 유리했다
- 핫 리로드 코드를 수정하면 앱을 재시작하지 않아도 바로 화면에 반영된다. Java + XML 시절에는 빌드 후 에뮬레이터에 올리는 데 수십 초가 걸렸는데, 그 시간이 거의 0으로 줄었다

### Firebase를 선택한 이유

백엔드를 직접 만들 수 있는 능력이 없었다. 서버 구축, DB 관리, API 설계 전부 처음이었다. Firebase는 이 모든 걸 건너뛸 수 있게 해줬다.

- Firestore NoSQL 문서 데이터베이스. 스키마가 유연해서 프로토타이핑이 빠르다. 실시간 스트림으로 게시글이나 채팅이 작성 즉시 다른 사용자에게 반영된다
- Firebase Auth Google, Apple, Kakao, GitHub 4종 OAuth 로그인을 빠르게 붙일 수 있었다 ([인증 서비스 문서](https://monkshark.github.io/hansol_hs_flutter_app/#data/auth_service.md))
- Cloud Storage 게시글 이미지, 프로필 사진 저장
- FCM 댓글, 채팅, 공지 등 13종 푸시 알림 ([FCM 서비스 문서](https://monkshark.github.io/hansol_hs_flutter_app/#notification/fcm_service.md))
- 무료 한도 학교 앱 규모(1,000명 이내)에서는 Spark 플랜으로 월 $0~3 운영이 가능했다

### 상태 관리: Riverpod

처음에는 Provider를 썼다. 간단한 CRUD에서는 문제가 없었지만, 기능이 복잡해지면서 한계가 드러났다. Provider는 BuildContext에 의존하기 때문에 위젯 트리 바깥에서 상태에 접근하기가 번거롭고, 테스트도 까다로웠다.

Riverpod 2.5로 전환했다. 결정적인 이유 세 가지:

- **`AsyncNotifier`** 비동기 작업의 로딩/성공/에러 상태를 분기하는 코드가 깔끔해졌다. `.when(loading: ..., data: ..., error: ...)`으로 한 줄에 처리
- **`family` + `autoDispose`** 파라미터별로 별도 상태를 만들되, 사용하지 않으면 자동으로 메모리에서 해제. 게시글 목록처럼 화면을 벗어나면 필요 없는 상태를 관리하기에 적합
- BuildContext 독립 위젯 트리 바깥(서비스 레이어, 백그라운드 로직)에서도 상태에 접근 가능

BLoC도 고려했지만, 단순 CRUD에도 Event 클래스와 State 클래스를 별도로 만들어야 하는 보일러플레이트가 과도하다고 판단했다. 학교 앱의 대부분의 기능은 "Firestore에서 데이터를 가져와서 보여주는" 패턴이라, Riverpod의 간결한 API가 더 맞았다.

## 처음 설계한 핵심 기능

1. NEIS API 연동 교육부 공공데이터 API로 [급식](https://monkshark.github.io/hansol_hs_flutter_app/#api/meal_data_api.md), [시간표](https://monkshark.github.io/hansol_hs_flutter_app/#api/timetable_data_api.md), 학사일정 자동 수집
2. 4종 OAuth 로그인 Google, Apple, Kakao, GitHub ([인증 서비스 문서](https://monkshark.github.io/hansol_hs_flutter_app/#data/auth_service.md))
3. 게시판 + 1:1 채팅 학생·교사·졸업생·학부모 모두 사용
4. 역할 기반 권한 일반 사용자, 매니저, 관리자 3단계
5. 푸시 알림 댓글, 채팅, 공지 등 13종 ([FCM 서비스 문서](https://monkshark.github.io/hansol_hs_flutter_app/#notification/fcm_service.md))

처음부터 이 모든 기능을 계획한 건 아니었다. 급식과 시간표로 시작해서, 부스에서 받은 피드백으로 선택과목 시간표를 만들고, 사용자가 늘면서 게시판과 채팅을 붙이고, 관리가 필요해져서 역할 시스템을 추가했다. 하나씩 필요에 의해 붙여나간 결과가 지금의 프로젝트다.

2023년 12월 첫 커밋부터 지금까지, 312개의 커밋, 110개의 Dart 파일, 32,000줄 이상의 코드. 이 시리즈는 그 과정에서 겪은 기술적 결정들을 기록한다.

## 다음 글에서는

Java 프로토타입 159커밋을 만들고, 학교 부스에서 결정적인 피드백을 받고, Flutter로 전환하기까지의 과정을 다룬다.
