---
title: "#3 - 급식 알림의 삽질기"
description: "FCM → 로컬 알림 → Kotlin 네이티브 → 다시 Flutter. 1년간의 알림 구현 여정"
date: 2026-04-07
slug: meal-notification
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - 알림
    - Kotlin
    - flutter_local_notifications
    - 삽질
draft: false
---

## 단순해 보였던 기능

"매일 아침에 오늘 급식 메뉴를 알림으로 보내준다."

한 줄로 설명 가능한 기능이다. 사용자 입장에서는 당연히 있어야 할 것 같고, 구현도 간단해 보인다. 알림 예약하고, 시간 되면 보내면 되는 거 아닌가?

이 "간단한" 기능을 제대로 동작하게 만드는 데 1년이 걸렸다. 2023년 12월부터 2024년 12월까지, 접근 방식을 네 번 바꾸고, 파일을 만들었다 지우기를 반복하고, 결국 처음과 전혀 다른 구조로 끝났다.

## 1차 시도: NotificationManager (2023년 12월)

Flutter로 전환한 직후, 가장 먼저 만들고 싶었던 기능이 급식 알림이었다. Java 프로토타입에서도 알림 기능이 있었으니까, Flutter에서도 금방 만들 수 있을 거라고 생각했다.

`NotificationManager.dart`를 만들었다. 165줄. `flutter_local_notifications` 패키지를 사용해서 로컬 알림을 예약하는 구조였다.

```dart
// 2023-12-12, 첫 번째 시도
// NotificationManager.dart — 165줄
```

같은 커밋에서 `FirebaseCloudMessaging.dart`라는 빈 파일도 만들었다. 이름에서 알 수 있듯이, FCM(Firebase Cloud Messaging)으로 서버에서 푸시를 보내는 것도 고려하고 있었다.

## 2차 시도: FCM을 넣었다 뺐다 (같은 주)

다음 날, `FirebaseCloudMessaging.dart`에 60줄의 코드를 채워 넣었다. FCM 토큰을 받고, 메시지를 수신하는 기본 구조를 작성했다. 동시에 `NotificationManager.dart`도 대폭 수정했다. 90줄 분량의 변경.

그리고 같은 날 밤, FCM 코드 60줄을 통째로 삭제했다.

```
2023-12-13 20:05  FirebaseCloudMessaging.dart  +60줄
2023-12-13 23:53  FirebaseCloudMessaging.dart  -60줄
```

4시간 만에 되돌린 것이다. 이유는 단순했다. 급식 알림은 서버가 보내는 게 아니라 기기가 스스로 보내야 하는 알림이었다. FCM은 서버에서 클라이언트로 푸시를 보내는 도구인데, 매일 아침 급식 메뉴를 보내려면 서버 측에서 스케줄러를 돌려야 한다. Firebase Functions를 쓰면 가능하지만, 당시에는 무료 플랜(Spark)을 쓰고 있었고, Functions 배포가 불가능했다.

그래서 방향을 틀었다. `ScheduledNotification.dart`를 새로 만들고, 기기 로컬에서 알림을 예약하는 방식으로 갔다.

이때까지만 해도 "방향만 잡으면 금방 끝나겠지"라고 생각했다.

## 7개월의 공백, 그리고 다시 시작 (2024년 7월)

급식 알림은 한동안 손을 대지 못했다. 게시판, 채팅, 로그인 같은 핵심 기능들이 우선이었고, 알림은 "나중에 제대로 하자" 목록에 들어갔다.

2024년 7월, 다시 `notification_manager.dart`를 열었다. 150줄 이상을 수정하는 대규모 리팩토링이었다. 7개월 전에 작성한 코드를 다시 보니, 당시에는 이해가 부족해서 엉성하게 작성한 부분이 많았다. 알림 채널 설정, 권한 요청, 스케줄링 로직을 전부 다시 썼다.

하지만 근본적인 문제가 남아 있었다. 앱이 꺼져 있을 때 알림이 안 왔다.

`flutter_local_notifications`의 `zonedSchedule`은 앱이 살아 있거나 백그라운드에 있을 때는 잘 동작한다. 하지만 사용자가 앱을 강제 종료하거나, 시스템이 메모리 부족으로 앱을 죽이면? 예약된 알림도 같이 사라진다. 특히 Android 제조사(삼성, 샤오미 등)의 배터리 최적화가 공격적으로 백그라운드 프로세스를 죽이는 환경에서, Flutter 앱의 로컬 알림은 불안정했다.

매일 아침 급식 알림이 가끔 오고 가끔 안 온다. 이건 없느니만 못한 기능이었다.

## 3차 시도: Kotlin 네이티브로 (2024년 8월)

"Flutter 레벨에서는 한계가 있다. 네이티브로 내려가자."

2024년 8월 1일, 결정을 내렸다. Android의 네이티브 알림 시스템을 직접 사용하기로 했다. 하루 만에 세 개의 파일을 새로 만들었다:

- **`MealNotificationReceiver.kt`** (78줄) `BroadcastReceiver`를 상속. AlarmManager에서 트리거되면 실제 알림을 생성하는 역할
- **`MealWorker.kt`** (61줄) `Worker`를 상속. WorkManager에 등록되어, 시스템이 적절한 시점에 급식 데이터를 가져오고 알림을 예약
- **`MainActivity.kt`** Flutter와 네이티브 코드를 연결하는 MethodChannel 설정 (+61줄)

동시에 `notification_manager.dart`에서 160줄을 삭제했다. Flutter 측의 알림 로직을 대부분 걷어내고, Kotlin 네이티브에 위임하는 구조로 바꾼 것이다.

```
2024-08-01 커밋 stat:
  MealNotificationReceiver.kt  +78줄 (신규)
  MealWorker.kt                +61줄 (신규)
  MainActivity.kt              +61줄
  notification_manager.dart    -160줄
```

이 접근의 핵심 아이디어는 이랬다:

1. WorkManager가 시스템 수준에서 작업을 스케줄링한다. 앱이 죽어도 시스템이 살려서 실행한다
2. MealWorker가 NEIS API를 호출해서 급식 데이터를 가져온다
3. MealNotificationReceiver가 실제 알림을 사용자에게 보여준다

Android의 WorkManager는 앱이 종료되어도 시스템이 보장하는 백그라운드 작업이다. 이론적으로는 완벽한 해법이었다.

### 그런데 문제가 또 터졌다

이후 일주일간의 커밋 기록을 보면 상황이 얼마나 힘들었는지 알 수 있다:

```
2024-08-04  Migration (MealWorker, Receiver 수정)
2024-08-06  Migration (notification_manager +105줄)
2024-08-07  Migration (Kotlin + notification_manager 동시 수정)
2024-08-07  commit    (같은 날 또 수정)
```

일주일 동안 거의 매일 커밋이 있었고, 같은 날 두 번 커밋한 날도 있었다. 네이티브 코드와 Flutter 코드를 동시에 수정하고 있다는 건, 둘 사이의 통신이 제대로 안 된다는 뜻이었다.

문제들:

- MethodChannel 통신 불안정 Flutter에서 Kotlin으로, Kotlin에서 Flutter로 데이터를 주고받는 과정에서 타이밍 이슈가 발생. 앱이 cold start 상태일 때 채널이 준비되기 전에 호출이 가는 경우가 있었다
- NEIS API를 Kotlin에서 직접 호출해야 하는 문제 Flutter 쪽에 이미 잘 동작하는 MealDataApi가 있는데, 같은 로직을 Kotlin으로 다시 작성해야 했다. 코드 중복에 버그 가능성까지 두 배
- iOS는? Kotlin으로 네이티브를 작성하면 iOS에서는 별도로 Swift 코드를 작성해야 한다. AppDelegate.swift도 78줄이 추가되었지만, 플랫폼별로 다른 코드를 유지보수하는 건 크로스플랫폼의 이점을 스스로 버리는 것이었다

8월 27일, `MealNotificationReceiver.kt`에서 줄을 빼기 시작했다. 동시에 Flutter 쪽에 `meal_notification_worker.dart`(33줄)를 새로 만들었다. 네이티브에서 다시 Flutter로 로직을 옮기기 시작한 것이다.

## Kotlin 포기 (2024년 9월)

2024년 9월 25일의 커밋이 결정적이었다:

```
MealNotificationReceiver.kt  -65줄 (삭제)
MealWorker.kt                -63줄 (삭제)
notification_manager.dart    +215줄
meal_notification_worker.dart  수정
```

Kotlin 네이티브 파일 두 개를 완전히 삭제했다. 2개월 전에 "이게 정답이다"라고 확신하며 작성한 코드를 통째로 버렸다. 동시에 `notification_manager.dart`에 215줄을 추가하며, 알림 로직을 전부 Flutter로 되돌렸다.

Java 프로토타입 159커밋을 버릴 때도 그랬지만, 코드를 버리는 건 매번 아프다. 특히 이번에는 "Flutter로는 안 되니까 네이티브로 가야 한다"는 나름의 기술적 판단을 했던 것이라 더 그랬다. 그 판단이 틀렸다는 걸 인정하는 것이기도 했으니까.

하지만 돌아보면 틀린 게 아니라 맞는 방향을 찾아가는 과정이었다. 네이티브로 내려가봤기 때문에 네이티브의 한계와 복잡성을 직접 체감했고, "Flutter 안에서 해결하되, 더 똑똑하게 하자"라는 결론에 도달할 수 있었다.

## 구조 전환: DailyMealNotification (2024년 12월)

2024년 12월 2일, 대규모 구조 전환을 했다.

```
notification_manager.dart          -253줄 (삭제)
meal_notification_worker.dart       -33줄 (삭제)
daily_meal_notification.dart       +259줄 (신규)
daily_alarm_notification.dart       +82줄 (신규)
MainActivity.kt                   -155줄
AppDelegate.swift                   -92줄
```

기존의 `notification_manager.dart`(253줄)를 삭제하고, `daily_meal_notification.dart`(259줄)를 새로 만들었다. 동시에 `MainActivity.kt`에서 155줄, `AppDelegate.swift`에서 92줄을 제거했다. 네이티브 쪽의 알림 관련 코드를 전부 걷어낸 것이다.

### `matchDateTimeComponents`의 발견

이 구조 전환에서 가장 결정적이었던 건 `flutter_local_notifications`의 이 옵션이다:

```dart
await _localNotificationsPlugin.zonedSchedule(
  ...
  matchDateTimeComponents: DateTimeComponents.dayOfWeekAndTime,
);
```

`dayOfWeekAndTime`으로 설정하면, 매주 같은 요일 같은 시간에 반복되는 알림을 시스템이 직접 관리한다. 앱이 살아 있든 죽어 있든, 시스템 알람 스케줄러가 처리하기 때문에 안정적이다. `exactAllowWhileIdle` 모드와 결합하면 Doze 모드에서도 동작한다.

1년 전에 이 옵션을 알았으면 Kotlin 네이티브로 내려갈 필요가 없었을지도 모른다. 하지만 이 옵션이 "정답"이라는 걸 확신하려면, 다른 방법들이 왜 안 되는지를 직접 경험해봐야 했다.

### 그래도 남은 문제

구조는 잡혔지만, 이 버전에는 치명적인 문제가 있었다. 앱을 일정 기간 열지 않으면 알림이 오지 않았다.

원인은 알림 스케줄링 시점에 있었다. 당시 코드는 스케줄링할 때 미래의 특정 날짜 급식을 미리 가져와서 알림 내용에 박아넣는 구조였다:

```dart
// 2024-12 버전 — 스케줄링 시점에 특정 날짜의 급식을 가져옴
String bigText = (await MealDataApi.getMeal(
    date: DateTime(scheduledDate.year, scheduledDate.month, scheduledDate.day),
    mealType: mealType,
    type: MealDataApi.MENU,
))?.meal ?? '급식 정보가 없습니다';
```

`matchDateTimeComponents: DateTimeComponents.dayOfWeekAndTime`은 매주 반복 알림을 시스템에 등록한다. 하지만 알림의 내용은 등록 시점에 고정된다. 월요일에 스케줄링하면 그 주 월요일 급식 메뉴가 알림에 박히고, 다음 주 월요일에도 똑같은 내용이 표시된다.

그래서 앱을 열 때마다 `scheduleDailyNotifications()`를 호출해서 알림을 새로 등록하는 방식으로 우회했는데, 문제는 앱을 오래 안 열면 갱신이 안 된다는 것이었다. 2주 동안 앱을 안 열면 2주 전 급식 메뉴가 계속 뜨거나, NEIS API에 해당 날짜 데이터가 없어서 "급식 정보가 없습니다"만 반복되었다.

알림이 오긴 오는데 내용이 엉뚱하거나, 아예 의미 없는 메시지가 뜨니까 사용자 입장에서는 "알림이 안 온다"와 다름없었다.

## 현재 버전으로의 진화 (2026년 3~4월)

이 문제를 해결하면서 동시에 여러 개선을 적용한 게 현재 버전이다.

### 알림 내용 갱신 방식 변경

가장 핵심적인 변경은 급식 데이터를 가져오는 방식이다:

```dart
// 현재 버전 — 항상 오늘 날짜 기준으로 가져옴
final meal = await MealDataApi.getMeal(
  date: DateTime.now(),
  mealType: mealType,
  type: MealDataApi.MENU,
);
menuPreview = _cleanMenu(meal?.meal);
```

`scheduledDate` 대신 `DateTime.now()`를 사용한다. 어차피 앱이 열릴 때마다 `scheduleDailyNotifications()`가 호출되면서 알림을 전부 취소하고 다시 등록하기 때문에, 가장 최신 급식 데이터로 갱신된다. 그리고 데이터를 못 가져왔을 때의 폴백도 달라졌다:

```dart
// 2024-12 버전
'급식 정보가 없습니다'

// 현재 버전
'오늘의 $mealLabel 메뉴를 확인하세요'  // (i18n 적용 후: l.noti_mealConfirm(mealLabel))
```

데이터가 없을 때 "정보가 없다"고 보여주는 대신, 앱을 열어보도록 유도하는 문구로 바꿨다. 월이 바뀔 때 데이터가 없거나, 예약 시점에 인터넷이 연결되지 않았을 수 있기 때문이다.

### 알러지 정보 정리

NEIS API에서 내려오는 급식 메뉴에는 알러지 번호가 붙어 있다. `비빔밥(5.6.13)` 이런 식으로. 알림에 이게 그대로 들어가면 지저분하다.

```dart
String _cleanMenu(String? menu) {
  if (menu == null || menu.isEmpty) return '';
  return menu
      .split('\n')
      .map((e) => e.replaceAll(RegExp(r'\([0-9.,\s]+\)'), '').trim())
      .where((e) => e.isNotEmpty)
      .join(' · ');
}
```

`_cleanMenu()`가 알러지 괄호를 제거하고, 줄바꿈을 `·`로 연결해서 한 줄 미리보기를 만든다. "비빔밥 · 미역국 · 배추김치 · 요구르트" 이런 깔끔한 형태로.

### 알림 탭 → 급식 화면 이동

2024-12 버전에서는 알림을 탭해도 아무 일도 안 일어났다. 그냥 앱이 열리거나, 아예 반응이 없었다.

현재 버전은 `payload`를 활용한다:

```dart
await _localNotificationsPlugin.zonedSchedule(
  ...
  payload: 'meal_screen',
);
```

알림을 탭하면 `notificationStream`에 `'meal_screen'`이 전달되고, 앱이 이를 받아서 급식 화면으로 바로 이동한다. 앱이 꺼져 있었더라도 cold start 후 급식 화면까지 자동으로 네비게이션된다.

```dart
void _onNotificationTap(NotificationResponse response) {
  log('Notification tapped: ${response.payload}');
  notificationStream.add(response.payload);
}
```

### 권한 요청 분리

2024-12 버전에서는 알림 초기화 과정에서 바로 권한을 요청했다. 앱을 처음 열자마자 "알림을 허용하시겠습니까?" 팝업이 뜨는 방식이었는데, 맥락 없이 갑자기 뜨는 권한 요청은 거부율이 높다.

현재 버전에서는 `_requestPermissions()`를 `DailyMealNotification` 클래스에서 제거하고, 설정 화면에서 알림을 켤 때 바텀시트로 권한을 요청하는 방식으로 바꿨다. 사용자가 "급식 알림을 받겠다"는 의도를 먼저 표현한 상태에서 권한을 요청하니까 허용율이 훨씬 높다.

### 다국어 지원

하드코딩되어 있던 한국어 문자열을 전부 `AppLocalizations`로 교체했다:

```dart
// 2024-12 버전
'🍽️ $mealLabel 알림'
'급식 정보 알림을 제공합니다.'
'한솔고등학교'

// 현재 버전
l.noti_mealBreakfast          // 알림 제목
l.noti_mealChannelName        // 채널 이름
l.noti_mealChannelDesc        // 채널 설명
l.noti_schoolName             // 학교 이름
```

영어를 사용하는 학생도 알림을 이해할 수 있게 되었다.

### 조식·중식·석식 개별 설정

사용자가 원하는 끼니만 골라서 알림을 받을 수 있다. 기숙사생은 조식·중식·석식 전부, 통학생은 중식만. 시간도 각각 다르게 설정 가능하다.

```dart
if (settings.isBreakfastNotificationOn) {
  await _scheduleWeeklyNotification(
    id: 1,
    mealLabel: l.meal_breakfast,
    notiTitle: l.noti_mealBreakfast,
    time: _parseTimeOfDay(settings.breakfastTime),
    weekdays: weekdays,
  );
}
```

월~금 각 요일별로 별도의 알림 ID를 부여해서 (조식×5 + 중식×5 + 석식×5 = 최대 15개) 개별적으로 관리한다. 주말에는 급식이 없으니까 토·일은 제외.

> 📎 알림 기능의 전체 구조는 [DailyMealNotification 문서](https://monkshark.github.io/hansol_hs_flutter_app/#notification/daily_meal_notification.md)에서 확인할 수 있다.

### 2024-12 버전 vs 현재 버전

| 항목 | 2024-12 버전 | 현재 버전 |
|------|-------------|----------|
| 급식 데이터 | `scheduledDate` 기준 (고정) | `DateTime.now()` 기준 (갱신) |
| 데이터 없을 때 | "급식 정보가 없습니다" | "메뉴를 확인하세요" (유도) |
| 알러지 정보 | 그대로 노출 | `_cleanMenu()`로 제거 |
| 알림 탭 | 반응 없음 | 급식 화면으로 딥링크 |
| 권한 요청 | 앱 시작 시 즉시 | 설정 바텀시트에서 맥락적으로 |
| 언어 | 한국어 하드코딩 | i18n (한국어 + 영어) |
| 디버깅 | `print()` 남발 | `log()` 정리 |
| 테스트 | 없음 | `sendTestNotification()` 제공 |

코드 줄 수는 259줄에서 239줄로 오히려 줄었다. 기능은 훨씬 많아졌는데 코드가 줄어든 건, 권한 요청 로직을 분리하고 `print()` 디버깅 코드를 정리한 덕분이다.

## 1년 반의 기록

급식 알림 하나를 만드는 데 거친 경로를 정리하면:

| 시기 | 접근 방식 | 결과 |
|------|----------|------|
| 2023-12 | NotificationManager + FCM | FCM은 서버 필요 → 당일 삭제 |
| 2023-12 | ScheduledNotification (로컬) | 기본 동작은 하지만 불안정 |
| 2024-07 | notification_manager 리팩토링 | 앱 종료 시 알림 누락 |
| 2024-08 | Kotlin 네이티브 (WorkManager) | 플랫폼별 코드 중복, 통신 복잡 |
| 2024-09 | Kotlin 삭제, Flutter 복귀 | 구조 정리 시작 |
| 2024-12 | DailyMealNotification 구조 전환 | 동작하지만 장기 미접속 시 내용 갱신 불가 |
| 2026-03~04 | 현재 버전 | 딥링크, i18n, 메뉴 프리뷰, 권한 UX 개선 |

파일 생성과 삭제 횟수를 세면:

- `FirebaseCloudMessaging.dart` → 생성 → 삭제
- `ScheduledNotification.dart` → 생성 → 삭제
- `MealNotificationReceiver.kt` → 생성 → 삭제
- `MealWorker.kt` → 생성 → 삭제
- `meal_notification_worker.dart` → 생성 → 삭제
- `notification_manager.dart` → 생성 → 수차례 대규모 수정 → 삭제
- `daily_meal_notification.dart` → 최종 생존

6개의 파일이 만들어졌다 사라졌고, 1개만 살아남았다.

## 배운 것

"간단해 보이는 기능"은 없다. 사용자에게 간단하게 보이는 기능일수록 뒤에서 처리해야 할 것이 많다. "매일 아침 알림 보내기"라는 한 문장 뒤에는 타임존, 배터리 최적화, 백그라운드 제약, 플랫폼별 차이, API 호출 타이밍 같은 문제들이 숨어 있었다.

네이티브로 내려가는 건 최후의 수단이어야 한다. 크로스플랫폼 프레임워크를 쓰면서 네이티브 코드를 작성하는 순간, 유지보수 비용이 플랫폼 수만큼 곱해진다. 특히 1인 개발에서는 치명적이다.

"동작한다"와 "제대로 동작한다"는 다르다. 2024년 12월 버전은 동작했다. 알림이 왔다. 하지만 일정 기간 앱을 안 열면 내용이 갱신되지 않았고, 알림을 탭해도 아무 일도 안 일어났고, 권한 요청 타이밍이 나빴다. 기능이 "있는" 것과 "쓸 만한" 것 사이에는 이런 디테일들이 잔뜩 있다.

삽질은 낭비가 아니다. FCM을 시도해봤기 때문에 서버 푸시와 로컬 알림의 차이를 이해했고, Kotlin 네이티브를 경험했기 때문에 Flutter의 한계와 가능성을 정확히 알게 되었다. 최종 코드 239줄에는 1년 반의 시행착오가 전부 녹아 있다.

