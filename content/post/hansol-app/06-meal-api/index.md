---
title: "#6 - 급식 API, 80줄에서 320줄까지"
description: "Java getMealData 80줄 → Flutter MealDataApi 320줄. 캐싱, 월 단위 프리페치, SWR 패턴이 추가되기까지의 과정"
date: 2026-04-10
slug: meal-api
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - Dart
    - NEIS API
    - 캐싱
    - SWR
---

## Java 시절: 80줄짜리 API

Java 프로토타입의 `getMealData.java`는 80줄이었다. 하는 일은 단순했다:

1. URL 조립
2. HTTP 요청
3. JSON 파싱
4. 문자열 반환

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
        String 메뉴 = itemObject.getString("DDISH_NM");
        String 칼로리 = itemObject.getString("CAL_INFO");
        switch (type) {
            case "메뉴" -> result = 메뉴;
            case "칼로리" -> result = 칼로리;
        }
        return result.replace("<br/>", "\n");
    });
}
```

호출할 때마다 네트워크 요청을 보냈다. 캐싱? 없다. 오프라인 대응? 없다. 에러 핸들링? `try-catch`로 빈 문자열 반환이 전부. 그래도 동작했다. 학교 와이파이가 있으니까.

## Flutter 초기: Java를 그대로 옮기다

Flutter 첫 커밋(2023-12-07)에서 `GetMealData.dart`를 만들었을 때도 구조는 같았다. Java의 `CompletableFuture`가 Dart의 `Future`로 바뀌었을 뿐, URL을 조립하고, HTTP 요청을 보내고, JSON을 파싱해서 문자열을 돌려주는 것은 동일했다.

하지만 Flutter 버전이 커지기 시작한 건 테스터가 늘면서다.

## 문제 1: 매번 네트워크 요청

급식 화면을 열 때마다 NEIS API를 호출했다. 조식, 중식, 석식 화면 하나를 열면 API 호출 3번. 날짜를 넘기면 3번 더. 체감상 느렸고, NEIS API가 간헐적으로 느려지는 날에는 화면이 몇 초간 빈 채로 있었다.

## 해결: SharedPreferences 캐시

첫 번째 개선은 `SharedPreferences`에 API 응답을 캐싱하는 것이었다.

```dart
static String _cacheKey(DateTime date, int mealType) {
  return 'meal_${DateFormat('yyyyMMdd').format(date)}_$mealType';
}

static void _saveToCache(SharedPreferences prefs, String key, Meal meal) {
  prefs.setString(key, jsonEncode(meal.toJson()));
  prefs.setInt('$key-ts', DateTime.now().millisecondsSinceEpoch);
}
```

캐시 키는 `meal_20240415_2` 형태 날짜와 끼니(1=조식, 2=중식, 3=석식)의 조합이다. 한 번 불러온 급식 데이터는 로컬에 저장되어 다음에 같은 날짜를 볼 때 네트워크 요청 없이 바로 표시된다.

이것만으로도 체감 속도가 크게 좋아졌다. 하지만 문제가 하나 더 있었다.

## 문제 2: 날짜를 넘길 때마다 로딩

급식 화면에서 스와이프로 날짜를 넘기면, 그날 데이터가 캐시에 없으니 다시 API를 호출한다. 월요일부터 금요일까지 쭉 넘기면 호출이 15번(5일 × 3끼). 사용자 입장에서는 날짜를 넘길 때마다 잠깐 로딩이 보인다.

## 해결: 월 단위 프리페치

NEIS API는 `MLSV_FROM_YMD`와 `MLSV_TO_YMD` 파라미터로 기간 조회를 지원한다. 한 번의 요청으로 한 달 치 급식 데이터를 전부 가져올 수 있다.

```dart
static Future<void> _prefetchMonth(DateTime date) async {
  final monthKey = DateFormat('yyyyMM').format(date);

  // 같은 달을 중복 요청하지 않도록 guard
  if (_prefetchingMonths.containsKey(monthKey)) {
    await _prefetchingMonths[monthKey];
    return;
  }

  final firstDay = DateTime(date.year, date.month, 1);
  final lastDay = DateTime(date.year, date.month + 1, 0);

  final requestURL = 'https://open.neis.go.kr/hub/mealServiceDietInfo?'
      '&Type=json&pIndex=1&pSize=100'
      '&MLSV_FROM_YMD=$fromDate'
      '&MLSV_TO_YMD=$toDate';

  // 응답의 모든 급식 데이터를 각각 캐시에 저장
  for (var row in rows) {
    final key = _cacheKey(mealDate, mealCode);
    _saveToCache(prefs, key, meal);
  }
}
```

한 번의 API 호출로 해당 월의 모든 급식(보통 60~90개 항목)을 가져와서 각각 캐시에 저장한다. 이후 같은 달의 어떤 날짜를 보더라도 캐시에서 즉시 표시된다.

`_prefetchingMonths` Map으로 같은 달의 중복 요청을 방지한다. 급식 화면을 열면서 프리페치를 시작하고, 그 사이에 사용자가 날짜를 넘겨도 같은 달이면 이미 진행 중인 프리페치를 기다린다.

주간 프리페치도 있다:

```dart
static Future<void> prefetchWeek(DateTime baseDate) async {
  final monday = baseDate.subtract(Duration(days: baseDate.weekday - 1));
  final friday = monday.add(const Duration(days: 4));

  if (monday.month == friday.month) {
    await _prefetchMonth(monday);
  } else {
    // 월이 걸치면 두 달 모두 프리페치
    await Future.wait([
      _prefetchMonth(monday),
      _prefetchMonth(friday),
    ]);
  }
}
```

월~금이 월경계에 걸릴 수 있다. 예를 들어 3월 31일(월)~4월 4일(금)이면 3월과 4월 데이터를 모두 프리페치한다.

## 문제 3: 캐시가 오래되면?

급식 데이터는 학교 사정으로 바뀔 수 있다. 어제 캐시한 데이터가 오늘도 맞다는 보장이 없다. 그렇다고 캐시를 매번 무시하면 캐싱의 의미가 없다.

## 해결: SWR 패턴

SWR(Stale-While-Revalidate)은 웹 개발에서 온 패턴이다. 오래된 캐시를 일단 보여주고, 백그라운드에서 새 데이터를 가져온다. 사용자는 즉시 데이터를 보고, 데이터가 바뀌었으면 자동으로 갱신된다.

```dart
static Future<Meal?> getMeal({...}) async {
  final cached = _getFromCache(prefs, cacheKey);

  if (cached != null && cached.meal != null) {
    if (_isCacheStale(prefs, cacheKey)) {
      // SWR: 만료된 캐시를 즉시 반환하고 백그라운드에서 갱신
      _prefetchMonth(date);  // await 하지 않음
    }
    return cached;
  }

  // 캐시 없으면 네트워크 요청
  await _prefetchMonth(date);
  return _getFromCache(prefs, cacheKey);
}
```

핵심은 `_prefetchMonth(date)`를 `await` 하지 않는 것이다. 캐시가 stale이면 일단 오래된 데이터를 반환하고, 프리페치는 백그라운드에서 돌린다. 다음에 화면을 열면 갱신된 데이터가 표시된다.

캐시 만료 정책도 계층적이다:

```dart
static Meal? _getFromCache(SharedPreferences prefs, String key) {
  final age = DateTime.now().millisecondsSinceEpoch - ts;

  if (meal.meal == ApiStrings.mealNoData) {
    if (age > 5 * 60 * 1000) return null;  // "데이터 없음"은 5분만 캐시
  } else if (age > 24 * 60 * 60 * 1000) {
    if (age > 3 * 24 * 60 * 60 * 1000) return null;  // 3일 지나면 완전 만료
  }
  return meal;
}
```

- "데이터 없음" 응답: 5분만 캐시한다. 학교에서 아직 급식을 등록 안 했을 수 있으니 곧 다시 시도
- 정상 데이터: 24시간까지 fresh, 24시간~3일은 stale(SWR 대상), 3일 이후는 완전 삭제

## 오프라인 대응

```dart
if (await NetworkStatus.isUnconnected()) {
  if (cached != null) return cached;
  return Meal(meal: ApiStrings.mealNoInternet, ...);
}
```

네트워크가 없으면 캐시가 아무리 오래되었어도 반환한다. 오래된 데이터라도 "인터넷 연결 없음"보다는 낫다. 캐시도 없으면 그때 안내 메시지를 보여준다.

## Meal 모델의 등장

Java에서는 급식 데이터가 `String`이었다. "메뉴", "칼로리", "영양정보"를 별도 호출로 가져왔다.

Flutter에서는 `Meal` 모델 하나에 전부 담는다:

```dart
class Meal {
  final String? meal;      // 메뉴
  final String kcal;       // 칼로리
  final String ntrInfo;    // 영양정보
  final DateTime date;     // 날짜
  final int mealType;      // 1=조식, 2=중식, 3=석식
}
```

`toJson()`/`fromJson()`이 있어서 캐시 직렬화도 한 줄이다. Java에서 `getMeal(date, "1", "메뉴")`, `getMeal(date, "1", "칼로리")`로 따로 호출하던 걸, `getMeal(date: date, mealType: 1)`로 한 번에 전부 가져온다.

## 80줄 → 320줄, 뭐가 늘었나

| 구분 | Java (80줄) | Flutter (320줄) |
|------|------------|----------------|
| URL 조립 | O | O |
| HTTP 요청 | O | O |
| JSON 파싱 | O | O |
| 데이터 모델 | X (String) | O (Meal 클래스) |
| 캐시 | X | SharedPreferences |
| 월 단위 프리페치 | X | O |
| 중복 요청 방지 | X | Completer |
| SWR 갱신 | X | O |
| 캐시 만료 정책 | X | 3단계 (5분/24시간/3일) |
| 오프라인 대응 | X | O |
| 테스트 지원 | X | @visibleForTesting |

코드가 4배 늘었지만, 네트워크 요청은 수십 분의 1로 줄었다. 사용자가 체감하는 로딩 시간은 거의 0이 되었다. 80줄에서 320줄로 가는 과정이 곧 "동작하는 코드"에서 "쓸 만한 앱"으로 가는 과정이었다.

## 다음 글에서는

앱의 커뮤니티 기능을 뒷받침하는 Firestore 스키마 설계 게시판, 채팅, 사용자 관리까지의 구조와 초기 실수들을 다룬다.
