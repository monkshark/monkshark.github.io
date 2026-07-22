---
title: "#11 - 작업이 전부 날아갔다"
description: "OneDrive 폴더에서 작업하다 clean build 때문에 백업 설정을 끄고, UI 전면 개편 작업이 통째로 사라진 이야기"
date: 2026-04-15
slug: lost-changes
image:
categories:
    - 한솔고 앱 개발기
tags:
    - Flutter
    - Git
    - 삽질
    - OneDrive
---

## 날아갔다

2026년 4월 3일. 전날부터 UI 전면 개편 작업을 하고 있었다. 앱의 거의 모든 화면을 건드리는 큰 작업이었다. 게시판 레이아웃을 바꾸고, 채팅에 읽음 표시를 넣고, 개인정보 동의 화면을 만들고, 교사용 시간표를 추가하고, Cloud Functions로 푸시 알림을 연결하고 한 마디로 앱 전체를 뜯어고치는 중이었다.

그리고 한순간에 전부 사라졌다.

## 배경: OneDrive 폴더

프로젝트 폴더가 OneDrive 동기화 경로 안에 있었다. 처음부터 의도한 건 아니고, 바탕화면이 OneDrive에 연결되어 있었는데 거기서 프로젝트를 만든 거다.

평소에는 별 문제가 없었다. 파일을 수정하면 OneDrive가 알아서 클라우드에 올리고, 혹시 모를 상황에 백업도 되니까 오히려 편하다고 생각했다. 실제로 한동안 아무 탈 없이 잘 돌아갔다.

문제는 이 구조가 Flutter 프로젝트와 근본적으로 맞지 않는다는 점이다. `build/`, `.dart_tool/`, `node_modules/` 같은 폴더는 빌드할 때마다 수천 개의 파일을 생성하고 삭제한다. OneDrive는 이 파일들을 전부 동기화하려고 한다. 파일 잠금이 걸리고, 동기화 충돌이 나고, 결국 빌드 자체가 안 되는 상황이 온다.

## 터진 순간

빌드가 안 됐다. 정확한 에러는 기억 안 나지만, 캐시나 빌드 파일이 꼬인 전형적인 증상이었다. `flutter clean`을 해야 하는 상황.

그런데 OneDrive 동기화가 걸려 있으면 clean이 제대로 안 된다. 파일을 지워도 OneDrive가 클라우드에서 다시 복원하거나, 동기화 중인 파일이라 삭제가 안 되거나, 잠금이 걸려서 빌드 디렉토리를 못 지운다.

그래서 OneDrive 백업 설정을 껐다. "이 폴더 동기화 중지." 이러면 깔끔하게 clean build를 할 수 있을 거라고 생각했다.

OneDrive는 동기화를 중지하면서 로컬 파일을 클라우드에 마지막으로 저장된 상태로 되돌렸다. 마지막 커밋 시점. 커밋하지 않은 모든 변경사항 UI 전면 개편의 모든 작업이 증발했다.

터미널에서 `git status`를 쳤을 때 `nothing to commit, working tree clean`이 뜬 그 순간의 기분은 설명하기 어렵다. 분명 수십 개 파일을 수정했는데, clean이라니.

## 날아간 것들

커밋 메시지에 남긴 복구 목록이다:

```
Restored (lost from git reset --hard):
- Category chips Wrap, post action sheet, bookmark, chat icon
- Chat: leave, message delete, read receipts, system messages, limit(30)
- Privacy consent checkbox, privacy policy in-app screen
- Home refresh (WidgetsBindingObserver, RefreshIndicator), board→recent order
- Crashlytics + crash log to Firestore
- Onboarding→login flow, HomeScreen tab refresh
- My activity 3 tabs (posts/comments/bookmarks)
- Teacher timetable, today highlight, font 12px
- Cloud Functions: chat push, reply notifications
- Firestore rules: crash_logs, field-level post update
```

실제로는 `git reset --hard`를 한 게 아니라 OneDrive가 파일을 되돌린 건데, 효과는 같았기에 커밋 메시지에 그렇게 적었다. 핵심은 커밋하지 않은 작업이 전부 사라졌다는 것이다.

하나씩 보면:

채팅 시스템 대규모 개선. 읽음 표시, 메시지 삭제, 나가기 기능, 시스템 메시지, 메시지 30개 제한. 채팅 화면만 344줄이 바뀌었다. 이건 단순 UI가 아니라 Firestore 쿼리, Cloud Functions, 클라이언트 로직이 엮인 기능이다.

개인정보 처리방침. 회원가입 시 동의 체크박스, 인앱 개인정보처리방침 화면. 법적으로 필요한 기능이라 빠뜨릴 수 없었다.

내 활동 3탭. 내 글, 내 댓글, 북마크를 탭으로 나눠 보여주는 화면. 각 탭이 별도 Firestore 쿼리를 가지고 있었다.

교사 시간표. 일반 학생 시간표와 구조가 다르다. 교사는 여러 학급에서 수업하니까 학년/반 선택이 필요하고, 멀티 클래스 선택을 지원해야 했다.

Cloud Functions. 채팅 푸시 알림, 댓글 답글 알림. 클라이언트가 아니라 서버 사이드 코드라 별도로 테스트하고 배포한 거였다.

전부 커밋 전이었다. Git에 흔적이 없다.

## 복구: 6시간

같은 날 오전 6시 반에 복구 작업을 시작해서, 12:26에 복구 커밋을 찍었다.

```
18 files changed, 1,432 insertions(+), 314 deletions(-)
```

6시간 만에 18개 파일, 1,432줄을 다시 쳤다. 거기에 원래 계획에 없던 피드백 시스템(버그 신고 + 학생회 건의함)까지 새로 추가했다.

한 번 만들어본 코드를 다시 치는 건 확실히 빠르다. "이 화면에 이 위젯이 필요하고, 이 Firestore 쿼리를 써야 하고, 이 Cloud Function이 이 트리거로 동작한다" 설계를 처음부터 고민할 필요가 없으니까. 머릿속에 완성된 그림이 있고, 타이핑만 하면 된다.

하지만 원본과 같은 코드는 아니다. 처음 만들 때는 시행착오를 거친다. 이 변수명이 맞나, 이 조건 분기가 맞나, 이 에러 핸들링은 충분한가 그 과정에서 다듬어진 디테일들이 있다. 복구할 때는 "대충 이랬다"로 넘어간다. 복구한 코드는 기능은 같지만, 처음 코드가 가졌던 미세한 개선들은 빠져 있다.

그래도 전부 잃는 것보단 훨씬 낫다.

## 이후 바꾼 것들

### 프로젝트 폴더 이동

OneDrive 동기화 경로 밖으로 프로젝트를 옮겼다. `C:\Users\Desktop\` 아래에 두되, OneDrive 동기화 대상에서 제외했다. 백업은 Git이 하면 된다. 클라우드 동기화 서비스는 코드 저장소가 아니다.

### 커밋 습관

"큰 작업 끝나면 한 번에 커밋하자" → "작은 단위로 자주 커밋하자"로 바꿨다.

이전에는 여러 기능을 한꺼번에 만들고 한 커밋에 몰아넣었다. 커밋 메시지에 "Major update: board, notifications, admin web, UI overhaul" 같은 게 나오는 이유다. 깔끔한 커밋 히스토리보다 작업 흐름을 끊지 않는 게 더 중요하다고 생각했다.

사건 이후에는 기능 하나가 완성되면 바로 커밋한다. 완벽하지 않아도. 커밋 메시지가 좀 지저분해져도. 커밋하지 않은 코드는 존재하지 않는 코드다.

### .gitignore

OneDrive와 무관하게, `.gitignore`를 꼼꼼하게 관리하기 시작했다. `build/`, `.dart_tool/`, `node_modules/` 같은 폴더가 동기화되거나 추적되지 않도록. 이건 OneDrive 사건과 직접 관련은 없지만, 빌드 아티팩트가 소스 코드와 섞이면 안 된다는 걸 체감한 뒤로 더 신경 쓰게 됐다.

## 돌이켜보면

클라우드 동기화 폴더에서 개발하는 건 시한폭탄이다. OneDrive, Dropbox, iCloud Drive 전부 마찬가지다. 이 서비스들은 문서, 사진, 일반 파일을 동기화하도록 설계되었지, 수천 개의 임시 파일을 초 단위로 생성하고 삭제하는 개발 프로젝트를 위한 게 아니다.

Git은 이미 완벽한 분산 백업 시스템이다. `git push`만 해도 코드는 원격 저장소에 안전하게 보관된다. 그 위에 OneDrive까지 겹치면 동기화 충돌, 파일 잠금, 빌드 실패가 생기고, 최악의 경우 이 글처럼 작업이 통째로 날아간다.

개발 폴더는 동기화 범위 밖에 둬라. 백업은 Git에 맡겨라. 그리고 커밋은 자주 해라.
