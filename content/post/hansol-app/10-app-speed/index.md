---
title: "#10 - 앱 시작 속도 줄이기"
description: "runApp 전 초기화를 최소화하고 _deferredInit으로 나머지를 백그라운드 처리한 과정"
date: 2026-04-14
slug: app-speed
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - 성능
    - 초기화
---

## 느린 시작

앱을 켜면 흰 화면이 2~3초. 그 동안 사용자는 앱이 멈춘 건지, 로딩 중인 건지 모른다. 실제로는 `main()` 함수에서 Firebase, 타임존, 알림, FCM, AppCheck, Analytics, 시간표 프리로드 등을 전부 초기화하느라 시간이 걸리는 것이었다.

## 원래 구조

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(...);
  await FirebaseAppCheck.instance.activate(...);
  await FirebasePerformance.instance.setPerformanceCollectionEnabled(true);
  await FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(true);
  await SettingData().init();
  await setupServiceLocator();
  await initializeDateFormatting();

  final meal = DailyMealNotification();
  await meal.initializeNotifications();
  await meal.scheduleDailyNotifications();

  await FcmService.initialize();
  await DeepLinkService.initialize();
  // ...

  runApp(const MyApp());
}
```

`await`가 줄줄이 이어진다. 각각은 빠르지만, 직렬로 실행하면 합산된다. Firebase 초기화 200ms, AppCheck 300ms, 알림 설정 200ms, FCM 200ms... 합치면 1~2초. 여기에 네트워크가 느린 날이면 더 길어진다.

문제는 이 중 화면을 띄우는 데 정말 필요한 것은 일부뿐이라는 거다.

## 핵심 질문: runApp 전에 뭐가 꼭 필요한가

`runApp()` 이전에 완료되어야 하는 것:
- Firebase 초기화 거의 모든 기능이 의존
- SettingData 테마, 언어 설정을 읽어야 첫 화면을 그릴 수 있음
- ServiceLocator DI 컨테이너 설정
- 날짜 포맷 화면에 날짜를 표시하려면 필요

`runApp()` 이후에 해도 되는 것:
- AppCheck 보안 검증이지만 첫 화면에 바로 필요하지 않음
- Performance/Analytics 수집 시작이 몇 초 늦어도 상관없음
- 알림 스케줄링 앱이 뜬 후에 설정해도 됨
- FCM 푸시 토큰 등록이 약간 늦어도 사용자가 모름
- 딥링크 앱이 뜬 후 처리해도 UX에 영향 없음
- 시간표 프리로드 화면을 열 때 로드해도 되는 데이터
- 홈 위젯 백그라운드에서 갱신하면 됨

## 바뀐 구조

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([...]);

  await Firebase.initializeApp(...);

  KakaoSdk.init(...);
  tz.initializeTimeZones();
  tz.setLocalLocation(tz.getLocation('Asia/Seoul'));
  providerContainer = ProviderContainer();

  // 필수: SettingData + ServiceLocator만 await
  await Future.wait([SettingData().init(), setupServiceLocator()]);
  await initializeDateFormatting();

  runApp(...);  // ← 여기서 화면이 뜬다

  // UI가 뜬 후 나머지를 백그라운드로
  unawaited(_deferredInit());
}
```

`runApp()` 전에는 진짜 필수적인 것만 남기고, 나머지는 `_deferredInit()`으로 뺐다. `Future.wait()`으로 독립적인 초기화 2개를 병렬 실행하는 것도 포인트다.

`unawaited()`는 "이 Future의 완료를 기다리지 않겠다"는 명시적 선언이다. `_deferredInit()`을 그냥 호출해도 되지만, `unawaited()`로 감싸면 의도가 분명하고, lint 경고도 안 뜬다.

## _deferredInit: 안전한 백그라운드 초기화

```dart
Future<void> _deferredInit() async {
  unawaited(_safeInit('AppCheck', () => FirebaseAppCheck.instance.activate(
    androidProvider: const bool.fromEnvironment('dart.vm.product')
        ? AndroidProvider.playIntegrity
        : AndroidProvider.debug,
  )));
  unawaited(_safeInit('Performance', () =>
    FirebasePerformance.instance.setPerformanceCollectionEnabled(true)));
  unawaited(_safeInit('Analytics', () =>
    FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(
      const bool.fromEnvironment('dart.vm.product'),
  )));

  unawaited(_preloadSubjects(2));
  unawaited(_preloadSubjects(3));

  final meal = DailyMealNotification();
  await meal.initializeNotifications();
  await meal.scheduleDailyNotifications();

  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  unawaited(FcmService.initialize());
  unawaited(DeepLinkService.initialize());
  unawaited(WidgetService.initialize().then((_) {
    WidgetService.updateAll();
    HomeWidget.registerInteractivityCallback(widgetBackgroundCallback);
  }));
}
```

`_deferredInit()` 안에서도 독립적인 것들은 `unawaited()`로 병렬 실행한다. AppCheck, Performance, Analytics는 서로 의존하지 않으니 동시에 시작한다. 시간표 프리로드도 2학년, 3학년을 병렬로.

알림 초기화(`meal.initializeNotifications()`)만 `await`로 순서를 보장하는데, 알림 플러그인이 초기화되어야 스케줄링이 가능하기 때문이다.

### _safeInit: 하나가 실패해도 나머지는 계속

```dart
Future<void> _safeInit(String name, Future<void> Function() fn) async {
  try {
    await fn();
  } catch (e) {
    log('$name init failed: $e', name: 'main');
  }
}
```

백그라운드 초기화에서 하나가 실패하면? AppCheck가 터져도 앱은 돌아가야 한다. `_safeInit()`으로 각 초기화를 try-catch로 감싸서, 실패하면 로그만 남기고 넘어간다.

## 결과

`runApp()`까지 걸리는 시간이 체감상 절반 이하로 줄었다. Firebase 초기화 + SettingData + ServiceLocator + 날짜 포맷 이것만 기다리면 화면이 뜬다. 나머지는 사용자가 첫 화면을 보는 동안 백그라운드에서 완료된다.

## 핵심 원칙

1. **`runApp()` 전에는 화면에 필요한 것만** 나머지는 전부 후순위
2. 독립적인 초기화는 병렬로 `Future.wait()`과 `unawaited()`
3. 하나의 실패가 전체를 막지 않게 `_safeInit()`으로 격리
4. 의도를 명시 `unawaited()`는 "기다리지 않는 게 의도"라는 선언

앱 시작 속도는 사소해 보이지만, 매일 여는 앱에서 2초와 0.5초의 차이는 크다.
