---
title: "#4 - Java 코드에서 가져온 것, 버린 것"
description: "Java 프로토타입의 코드를 Flutter로 옮기면서 가져간 설계와 버린 습관들"
date: 2026-04-08
slug: java-to-dart
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Java
    - Dart
    - Flutter
    - 리팩토링
    - 삽질
---

## 159커밋의 유산

[#2](/p/java-to-flutter/)에서 Java 프로토타입 159커밋을 버리고 Flutter로 전환한 이야기를 했다. 코드는 버렸지만, 모든 걸 버린 건 아니었다. Java에서 삽질하며 만든 설계와 경험은 그대로 가져갔고, 동시에 초보 시절의 나쁜 습관은 버렸다.

Java 프로토타입의 실제 코드를 보면서, 뭘 가져가고 뭘 버렸는지 정리해본다.

## 가져간 것: NEIS API 파싱 구조

### Java `getMealData.java`

```java
public static CompletableFuture<String> getMeal(String date, String mealScCode, String type) {
    String requestURL =
        "https://open.neis.go.kr/hub/mealServiceDietInfo?" +
            "&Type=json" +
            "&MMEAL_SC_CODE=" + mealScCode +
            "&ATPT_OFCDC_SC_CODE=" + niesAPI.ATPT_OFCDC_SC_CODE +
            "&SD_SCHUL_CODE=" + niesAPI.SD_SCHUL_CODE +
            "&MLSV_YMD=" + date;

    return CompletableFuture.supplyAsync(() -> {
        // HTTP 연결, JSON 파싱...
        String 메뉴 = itemObject.getString("DDISH_NM");
        String 칼로리 = itemObject.getString("CAL_INFO");
        String 영양정보 = itemObject.getString("NTR_INFO");

        switch (type) {
            case "메뉴" -> result = 메뉴;
            case "칼로리" -> result = 칼로리;
            case "영양정보" -> result = 영양정보;
        }
        return result.replace("<br/>", "\n");
    });
}
```

### Flutter `MealDataApi`

```dart
static Future<Meal> _fetchSingleMeal(...) async {
    final requestURL = 'https://open.neis.go.kr/hub/mealServiceDietInfo?'
        'key=${niesApiKeys.NIES_API_KEY}'
        '&Type=json&MMEAL_SC_CODE=$mealType'
        '&ATPT_OFCDC_SC_CODE=${niesApiKeys.ATPT_OFCDC_SC_CODE}'
        '&SD_SCHUL_CODE=${niesApiKeys.SD_SCHUL_CODE}'
        '&MLSV_YMD=$formattedDate';

    // ...
    final meal = Meal(
      meal: (row['DDISH_NM'] as String).replaceAll('<br/>', '\n'),
      kcal: row['CAL_INFO'] as String,
      ntrInfo: (row['NTR_INFO'] as String?)?.replaceAll('<br/>', '\n') ?? '',
    );
}
```

URL 구조가 거의 동일하다. `ATPT_OFCDC_SC_CODE`, `SD_SCHUL_CODE`, `MMEAL_SC_CODE` NEIS API의 파라미터 이름은 바뀌지 않으니까. Java에서 이미 API 문서를 파고들어서 필요한 파라미터를 정리해뒀기 때문에, Flutter에서는 URL을 그대로 가져다 쓸 수 있었다.

`<br/>` → `\n` 변환도 그대로다. NEIS API는 메뉴 항목을 `<br/>` 태그로 구분해서 보내주는데, 이걸 줄바꿈으로 바꿔야 화면에 제대로 표시된다. Java에서 이미 알아낸 사실이라 Dart에서는 고민 없이 처리했다.

JSON 응답 구조도 동일하다. `mealServiceDietInfo` → `row` 배열 → 각 항목에서 `DDISH_NM`, `CAL_INFO`, `NTR_INFO` 추출. 이 구조를 파악하는 데 Java 시절에 꽤 시간을 썼는데, 한 번 알면 두 번 다시 삽질할 필요가 없다.

## 가져간 것: 알러지 괄호 제거

### Java `HomeFragment.java`

```java
private String deleteBracket(String msg) {
    msg = msg.replaceAll("[().1234567890]", "");
    return msg;
}
```

### Flutter `DailyMealNotification`

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

같은 목적, 다른 구현. NEIS API의 급식 메뉴에는 `비빔밥(5.6.13)` 형태로 알러지 정보가 붙어 있다. 사용자에게 보여줄 때는 이 괄호를 제거해야 한다.

Java 버전은 단순했다. 괄호, 점, 숫자를 전부 지워버리는 방식. 하지만 이러면 메뉴 이름에 포함된 숫자까지 날아갈 수 있다. Flutter 버전에서는 정규식을 `\([0-9.,\s]+\)` 괄호 안에 숫자/점/쉼표/공백만 있는 패턴으로 좁혀서, 알러지 정보만 정확히 제거하도록 개선했다.

Java에서 "알러지 괄호를 제거해야 한다"는 문제 자체를 발견한 것이 가장 큰 유산이었다. 해결 방법은 더 나은 걸로 바꿨지만, 문제를 아는 것과 모르는 것의 차이는 크다.

## 가져간 것: 급식 알림의 기본 구조

### Java `FirebaseMessaging.java`

```java
public void setAlarms(@NonNull Context context) {
    AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

    Calendar currentCalendar = Calendar.getInstance();
    int dayOfWeek = currentCalendar.get(Calendar.DAY_OF_WEEK);
    if (dayOfWeek == Calendar.SATURDAY || dayOfWeek == Calendar.SUNDAY) return;

    PendingIntent pendingIntent1 = createPendingIntent(context, 1, "조식", 6, 30);
    PendingIntent pendingIntent2 = createPendingIntent(context, 2, "중식", 12, 0);
    PendingIntent pendingIntent3 = createPendingIntent(context, 3, "석식", 17, 0);

    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, calendar1.getTimeInMillis(), pendingIntent1);
}
```

### Java `AlarmReceiver.java`

```java
public void onReceive(Context context, Intent intent) {
    String 분류 = intent.getStringExtra("분류");
    final String[] 메뉴 = new String[1];
    메뉴[0] = getMenu(분류, spDate).join();
    NotificationUtil.sendMealNotification(context, 분류 + " 정보", 메뉴[0]);
}
```

여기가 아이러니한 부분이다. [#3](/p/meal-notification/)에서 Flutter로 급식 알림을 만드는 데 1년이 걸렸다고 했는데, Java 프로토타입에는 이미 동작하는 급식 알림이 있었다.

`AlarmManager` + `setExactAndAllowWhileIdle` + `BroadcastReceiver` Android 네이티브 API를 직접 쓰는 방식이었다. 알림이 울리면 `AlarmReceiver`가 NEIS API를 호출해서 실제 메뉴를 가져오고, `NotificationUtil`이 BigTextStyle로 보여준다. 주말은 건너뛴다.

Flutter에서 이 기능을 다시 만들 때, 처음에는 `flutter_local_notifications`로 시작했다가 안정성 문제로 Kotlin 네이티브(`MealNotificationReceiver.kt` + `MealWorker.kt`)로 갔다가, 결국 다시 Flutter로 돌아왔다. 1년간의 삽질 끝에 도달한 `exactAllowWhileIdle` 이건 Java의 `setExactAndAllowWhileIdle`과 같은 Android API를 Flutter 래퍼로 호출하는 것이다.

돌고 돌아 원점이었다. 다만 Java 시절에는 "이게 왜 동작하는지" 이해하지 못한 채 코드를 썼고, Flutter에서 삽질한 후에야 `AlarmManager`의 exact alarm이 Doze 모드에서도 동작하는 이유를 이해하게 되었다.

## 버린 것: 한글 변수명

Java 프로토타입에서 가장 눈에 띄는 특징은 한글 변수명이다.

```java
String 메뉴 = itemObject.getString("DDISH_NM");
String 칼로리 = itemObject.getString("CAL_INFO");
String 영양정보 = itemObject.getString("NTR_INFO");

// AlarmReceiver.java
String 분류 = intent.getStringExtra("분류");
final String[] 메뉴 = new String[1];
```

Java는 유니코드 식별자를 허용하기 때문에 기술적으로 문제는 없다. 그리고 솔직히 코드를 읽을 때 `String meal`보다 `String 메뉴`가 직관적이긴 하다.

하지만 Flutter로 전환하면서 전부 영어로 바꿨다. 이유:

- 라이브러리/프레임워크와의 일관성 Flutter의 모든 API가 영어다. 내 코드만 한글이면 섞여서 읽기 어렵다
- 자동완성 IDE에서 `me`까지 치면 `meal`, `mealType` 같은 후보가 뜨는데, 한글이면 `ㅁ`을 치고 한영 전환을 해야 한다
- 협업 가능성 혼자 만드는 앱이지만, 코드를 GitHub에 올리는 이상 영어가 맞다

## 버린 것: 커밋 메시지 "Update"

Java 레포의 159커밋 중 대부분의 메시지가 이렇다:

```
Update
Update
Update
Update
Merge remote-tracking branch 'origin/main'
Update
```

9월 12일 하루에 커밋이 20개가 넘는데, 전부 "Update". 뭘 바꿨는지 메시지만 봐서는 전혀 알 수 없다. Git을 처음 쓰면서 "저장" 버튼처럼 사용했던 것 같다.

Flutter 레포로 넘어오면서 커밋 메시지에 변경 내용을 적기 시작했다. 처음에는 "Migration"이 많았지만, 점차 구체적으로 바뀌어 갔다.

## 버린 것: `static` 남용

```java
// getMealData.java
static String result = null;

public static CompletableFuture<String> getMeal(...) {
    // result에 직접 대입
    result = 메뉴;
    return result.replace("<br/>", "\n");
}
```

`static` 필드에 결과를 직접 대입하는 방식. 여러 곳에서 동시에 `getMeal`을 호출하면 `result`가 덮어씌워질 수 있다. 실제로 HomeFragment에서 급식과 시간표를 동시에 비동기 호출하고 있었는데, 운 좋게 문제가 안 터졌을 뿐이다.

Flutter 버전에서는 각 함수가 독립적인 반환값을 가지고, 상태를 공유하지 않는다.

## 버린 것: 배터리 최적화 해제 강제 요청

```java
// HomeFragment.java
private void checkBatteryOptimization(Context context) {
    PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
    if (!pm.isIgnoringBatteryOptimizations(packageName)) {
        Intent intent = new Intent();
        intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + packageName));
        context.startActivity(intent);
    }
}
```

앱을 열 때마다 배터리 최적화 해제를 요청하는 코드. 알림이 안정적으로 오게 하려는 의도였지만, 사용자 경험이 최악이다. 앱을 열 때마다 시스템 팝업이 뜬다. Google Play 정책에서도 이런 방식은 권장하지 않는다.

Flutter 버전에서는 이런 강제 요청 대신, `exactAllowWhileIdle` 모드로 시스템의 정상적인 알림 경로를 사용한다.

## 돌아보면

Java 프로토타입은 "이것도 되나? 저것도 되나?" 하면서 마구 시도한 코드였다. 정리되지 않았고, 위험한 패턴도 있었다. 하지만 그 덕분에:

- NEIS API의 구조를 완전히 파악했다
- 급식, 시간표, 알림의 핵심 로직을 한 번 구현해봤다
- 뭘 하면 안 되는지(한글 변수명, static 남용, 강제 권한 요청)를 경험으로 배웠다

코드는 버렸지만 경험은 전부 가져갔다. Flutter 프로젝트의 첫 커밋이 Java 마지막 커밋과 같은 날(2023년 12월 7일)인 건, 하나를 끝내고 바로 다음을 시작할 수 있을 만큼 준비가 되어 있었다는 뜻이다.

## 다음 글에서는

Flutter 첫 커밋부터 한 달간 무엇을 만들었는지, 초기 개발의 속도와 순서를 다룬다.
