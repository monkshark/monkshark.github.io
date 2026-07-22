---
title: "#5 - Flutter 첫 한 달"
description: "2023년 12월 7일 first commit부터 35개 커밋, 화면 구조부터 API 연동까지 한 달간의 기록"
date: 2026-04-09
slug: first-month
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - Dart
    - NEIS API
    - 초기 개발
---

## 12월 7일, 같은 날의 두 커밋

2023년 12월 7일. [Java 레포](https://github.com/Monkshark/hansol_hs_java_app)에 v0.12.3 Beta 마지막 커밋을 남기고, 같은 날 Flutter 레포에 first commit을 찍었다. 하나를 끝내고 바로 다음을 시작한 것이다.

첫 커밋은 `flutter create` 그 자체였다. 137개 파일, 5,126줄. Flutter가 자동 생성하는 프로젝트 템플릿이다. android, ios, web, linux, macos, windows 모든 플랫폼의 보일러플레이트가 포함되어 있었다.

하지만 이 커밋에 이미 Java에서 가져온 파일 3개가 들어 있었다:

```
lib/GetMealData.dart
lib/GetNoticeData.dart
lib/GetTimeTableData.dart
```

Java의 `getMealData.java`, `getNoticeData.java`, `getTimetableData.java`를 Dart로 포팅한 것이다. 프로젝트를 만들자마자 가장 먼저 한 일이 NEIS API 연동 코드를 옮기는 것이었다.

## 첫째 주: 뼈대 잡기 (12/7 ~ 12/13)

### 화면 구조

둘째 커밋(12/8)에서 화면 4개의 껍데기를 만들었다:

```
lib/Screens/homeScreen.dart    +28줄
lib/Screens/mainScreen.dart    +11줄
lib/Screens/mealScreen.dart    +29줄
lib/Screens/noticeScreen.dart  +29줄
```

Java 프로토타입과 동일한 구조다. 홈, 급식, 공지. BottomNavigation으로 전환하는 방식도 같았다. 이미 Java에서 검증한 화면 흐름을 그대로 가져왔다.

### 파일 구조 리팩토링

셋째 커밋(12/10)에서 바로 파일 구조를 정리했다:

```
GetMealData.dart     → Data/mealDataApi.dart
GetNoticeData.dart   → Data/noticeDataApi.dart
GetTimeTableData.dart → Data/tiemtableDataApi.dart
```

루트에 흩어져 있던 API 파일들을 `Data/` 폴더로 모았다. 파일명도 PascalCase에서 camelCase로 바꿨다. Java 습관을 Dart 컨벤션으로 전환하는 과정이었다. (참고로 `tiemtable`은 오타다. 나중에 `timetable`로 고쳤다.)

### 알림 첫 시도 (12/12 ~ 12/13)

Flutter 시작 5일 만에 알림 기능에 손을 댔다. [#3](/p/meal-notification/)에서 자세히 다뤘지만, `NotificationManager.dart` 165줄을 만들고, `FirebaseCloudMessaging.dart`를 넣었다 4시간 만에 삭제하는 사건이 이때 일어났다.

돌이켜보면 너무 일찍 손을 댄 것이었다. 화면 구조도 다 안 잡힌 상태에서 알림까지 만들려고 했으니.

## 둘째 주: 기능 구현 (12/15 ~ 12/20)

12월 17일에 커밋이 9개다. 하루에 9번. 이 시기가 가장 집중적으로 개발한 때였다.

이 주에 만든 것들:
- 급식 화면 NEIS API 연동, 조식/중식/석식 표시, 날짜 이동
- 시간표 화면 학년/반 선택, 요일별 시간표 표시
- 설정 화면 학년/반 저장, 알림 on/off
- 로그인/회원가입 Firebase Auth 연동
- 달력 학사일정 표시

12월 20일에는 커밋이 7개. 이 이틀(17일, 20일)에 전체 첫 달 커밋의 거의 절반이 몰려 있다. 기숙사에서 자습 시간과 주말을 전부 개발에 쏟은 날들이다.

## 셋째 주: API 안정화 (12/20 ~ 12/27)

12월 25일, 크리스마스에도 코딩했다. 이날 커밋은 API 3개를 전부 리팩토링한 것이다:

```
lib/API/MealDataApi.dart       +72줄, -65줄
lib/API/NoticeDataApi.dart     +54줄, -38줄
lib/API/TimetableDataApi.dart  +38줄, -27줄
```

Java에서 포팅한 초기 코드가 Dart답지 않았다. `HttpURLConnection` 스타일로 작성했던 걸 `http` 패키지의 `get()` 방식으로 바꾸고, 에러 핸들링을 추가하고, JSON 파싱을 정리했다.

12월 27일에는 파일명을 Dart 컨벤션(snake_case)으로 전환했다:

```
MealDataApi.dart → meal_data_api.dart
NoticeDataApi.dart → notice_data_api.dart
TimetableDataApi.dart → timetable_data_api.dart
```

Java의 PascalCase → Dart의 snake_case. 이런 사소한 컨벤션 전환이 프로젝트 초기에 계속 있었다.

## 넷째 주: Meal 모델 (1/7)

1월 7일 커밋에서 `Meal` 데이터 모델이 처음 등장한다:

```
lib/Data/meal.dart  +13줄
```

그 전까지는 급식 데이터를 `String`으로만 다뤘다. Java 시절과 똑같이 API 응답을 문자열로 받아서 화면에 바로 뿌렸다. 하지만 급식 정보에는 메뉴, 칼로리, 영양정보, 날짜, 끼니 구분 등 여러 필드가 있고, 이걸 하나의 모델 클래스로 묶어야 코드가 정리된다.

`Meal` 모델을 만들면서 동시에 `meal_card.dart`가 95줄이나 추가되었다. 급식 카드 위젯이 별도 파일로 분리된 것이다. Java에서는 `MealFragment` 하나에 271줄이 전부 들어 있었는데, Flutter에서는 위젯 단위로 분리하기 시작했다.

## 첫 달의 숫자

| 항목 | 수치 |
|------|------|
| 기간 | 2023-12-07 ~ 2024-01-07 |
| 커밋 수 | 36 |
| 가장 많은 날 | 12/17 (9커밋), 12/20 (7커밋) |
| 커밋 0개인 날 | 12/9, 12/11, 12/14, 12/16, 12/21\~24, 12/26, 12/28\~1/6 |

커밋이 없는 날이 꽤 많다. 매일 코딩한 게 아니라, 할 수 있는 날에 몰아서 했다. 기숙사 생활이라 평일 저녁 자습 시간과 주말이 개발 시간이었고, 시험이나 학교 일정이 있으면 며칠씩 손을 못 대기도 했다. (근데 사실 공부는 안했다.)

## 돌아보면

첫 한 달의 핵심은 Java에서 검증한 구조를 Dart로 옮기는 것이었다. 화면 구조, API 파싱, 데이터 흐름 전부 Java에서 한 번 해봤던 것들이다. 덕분에 "무엇을 만들어야 하는지"는 고민하지 않았고, "Flutter에서는 이걸 어떻게 만드는지"에만 집중할 수 있었다.

동시에 Java 습관을 하나씩 버리는 과정이기도 했다. 파일 이름, 폴더 구조, 코딩 컨벤션을 Dart 방식으로 바꿔가면서, 코드가 점점 "Flutter다워"졌다. 이 전환은 첫 달에 끝나지 않고 이후 몇 달간 계속되었다.

## 다음 글에서는

첫 달에 포팅한 NEIS API 급식 파싱이 이후 어떻게 진화했는지 캐싱, 월 단위 프리페치, SWR 패턴까지의 과정을 다룬다.
