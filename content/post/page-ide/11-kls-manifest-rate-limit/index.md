---
title: "#11 - rate limit 한 줄에서 4계층 fallback 까지"
description: "'no version available' 한 줄에서 출발해 4계층 fallback 과 자동 갱신 파이프라인까지 도달한 회고"
date: 2026-05-21T20:00:00+09:00
slug: page-ide-kls-manifest-rate-limit
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "GitHub Actions", "rate limit", "caching", "automation"]
---

LSP 설치 다이얼로그를 열었더니 버전 목록 자리가 비어 있었다. 한 줄짜리 안내가 떠 있었다 "no version available (network or rate limit)". 네트워크는 안 죽었고, 다른 사이트는 다 잘 응답했다. 남은 단어 하나가 그날의 과제였다.

## 한 줄짜리 메시지의 뒤편

PAGE 의 KLS (Kotlin Language Server) 설치 흐름은 GitHub Releases API 두 곳을 호출한다 Monkshark fork 한 번, fwcd upstream 한 번. 다이얼로그를 열 때마다 두 번씩 친다. 문제는 GitHub API 의 익명 호출이 IP 당 시간당 60 회로 묶여 있다는 점이다. 한 명이 다이얼로그를 몇 번 여닫으면 두 자리수가 그어지고, NAT 뒤의 여러 사람이 같이 쓰는 IP 라면 한 사람이 열기 전에 이미 한도가 차 있을 수 있다.

배포 시나리오를 생각하면 더 분명해진다. PAGE 가 손에 닿는 사람이 늘수록 회사 네트워크, 학교 네트워크, 같은 ISP IP 한 자리에 한도가 누적된다. "no version available" 이 사람 손이 아니라 시간대의 함수가 된다. 처음 깔자마자 다이얼로그를 열었는데 비어 있으면 두 번 다시 열지 않을 사람이 많다.

## 첫 우회 cache + ETag, 응답 회로 한 번 줄이기

가장 가까운 해결은 응답 한 번을 디스크에 적어 두고, 다음 호출이 같은 시간대 안이면 그걸 그대로 쓰는 것. TTL 한 시간으로 잡았다.

```kotlin
object LspReleasesCache {

    data class Cached(
        val fetchedAt: Long,
        val source: String,
        val etagFork: String?,
        val etagUpstream: String?,
        val etagManifest: String?,
        val fork: List<TaggedRelease>,
        val upstream: List<TaggedRelease>,
    )

    const val DEFAULT_TTL_MS: Long = 60 * 60 * 1000L

    fun isFresh(cached: Cached?, now: Long = System.currentTimeMillis(), ttlMs: Long = DEFAULT_TTL_MS): Boolean {
        if (cached == null) return false
        return (now - cached.fetchedAt) < ttlMs
    }
}
```

TTL 한 시간 안에서는 디스크 한 번 읽고 끝. API 호출 0 회. 그 뒤에도 응답 자체가 안 바뀌었을 가능성이 높으니까 ETag 를 같이 들고 다닌다 `If-None-Match` 헤더로 보내면 서버가 304 만 돌려준다. 그 304 응답도 rate limit 카운터에는 잡힌다 (GitHub 쪽 정책이 그렇다) 는 점이 한 가지 함정. 그래서 ETag 는 호출 횟수의 절감이 아니라 응답 본문 다운로드의 절감이다.

여기까지만 했을 때 한 사람의 사용 패턴은 견딘다. 한 시간에 한 번씩 두 번 친다고 가정하면 시간당 두 자리 호출. 한도 안쪽. 그러나 한 IP 에 사람이 여럿이면 한 한도를 N 명이 나눠 쓰는 구조 이 계산은 N 으로 나뉜다. 한 계층 더 필요했다.

## 두 번째 우회 static manifest, API 의존 자체 빼기

다음 자리의 결정은 한 줄로 적으면 API 를 쓰지 않는 길을 메인 경로로 만들기. PAGE 의 docs 가 이미 `monkshark.github.io/page-ide` 로 Pages 서빙되고 있었다. 같은 자리에 fork + upstream 의 release 목록을 JSON 한 파일로 적어 두면, IDE 는 그 한 파일만 받아서 쓰면 된다.

```kotlin
object KlsReleasesManifest {

    const val DEFAULT_URL: String = "https://monkshark.github.io/page-ide/lsp/kotlin.json"

    fun fetch(url: String = DEFAULT_URL, ifNoneMatch: String? = null): FetchedManifest? {
        return runCatching { fetchOrThrow(url, ifNoneMatch) }.getOrNull()
    }
}
```

GitHub Pages 는 CDN 뒤에 있고, rate limit 이 없다. 한 명이든 만 명이든 같은 정적 파일을 받아 가는 사람이 누구든. fetch 가 실패하면 그제서야 live API 로 fall back. 평소 경로에서는 API 한 번 안 친다.

그래서 호출 우선순위가 이렇게 정렬됐다.

```
disk cache (fresh)
  → static manifest (ETag/304)
    → live API (Monkshark + fwcd)
      → installed labels (오프라인 마지막 보루)
```

네 계층 어디에서 끊겨도 다이얼로그는 비지 않는다. 한 자리에 한도가 차도 옆자리가 받는다.

## 자동화 manifest 를 누가 갱신할 것인가

문제는 그 manifest 가 stale 해지면 안 된다는 점이다. 새 KLS release 가 fork 든 upstream 이든 나왔는데 manifest 가 어제 자라면 IDE 는 새 버전을 모른다. 그래서 manifest 갱신은 사람 손이 아니라 GitHub Actions 한 잡이어야 했다.

```yaml
name: Update KLS release manifest

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate manifest
        uses: actions/github-script@v7
        with:
          script: |
            const fork = await fetchReleases('Monkshark', 'kotlin-language-server');
            const upstream = await fetchReleases('fwcd', 'kotlin-language-server');
            fs.writeFileSync('docs/lsp/kotlin.json', JSON.stringify({ fork, upstream }, null, 2) + '\n');
      - name: Create pull request
        id: cpr
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ secrets.MANIFEST_BOT_PAT }}
          branch: chore/kls-manifest-refresh
      - name: Enable auto-merge
        if: steps.cpr.outputs.pull-request-number
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh pr merge --auto --squash --delete-branch "${{ steps.cpr.outputs.pull-request-number }}"
```

매일 03:00 UTC 에 fork + upstream release 목록을 다시 그려서 PR 을 띄우고, 그 PR 에 즉시 auto-merge 플래그를 켠다. CI 가 통과하면 사람 손 없이 머지된다. 사람이 손댈 일은 이론상 0.

이론상.

## 두 함정

처음 굴렸을 때 두 자리에서 멈췄다.

첫째는 workflow 정의 스냅샷 타이밍. workflow_dispatch 로 첫 실행을 손으로 트리거했더니 이전 워크플로 정의로 돌았다. peter-evans 의 PR 생성까지는 됐는데 auto-merge step 이 없는 옛 버전이라 PR 이 그냥 떠 있었다. 두 번째 실행부터는 새 정의로 갈아엎혔다. GitHub Actions 의 workflow_dispatch 가 트리거 시점의 정의를 잡는다는 점, 그리고 그 시점이 항상 main 의 가장 최근이라고는 못 한다는 점을 그때 알았다.

두 번째 함정이 더 무거웠다. auto-merge 플래그가 켜졌는데 PR 이 BLOCKED 로 멈췄다. 이유 "Required status check 'Gradle build' is expected." 그런데 CI 가 아예 돌지 않았다. peter-evans 가 push 를 `GITHUB_TOKEN` 으로 했고, GitHub 의 보안 정책상 `GITHUB_TOKEN` 으로 push 된 commit 은 자식 워크플로 (CI) 를 트리거하지 않는다. 무한 재귀 방지의 안전장치인데, 이 자리에서는 정확히 안전장치가 자동화를 막는 자리가 됐다.

해결은 fine-grained PAT (Personal Access Token) 을 따로 발급해서 secret 으로 박는 것. peter-evans 가 그 토큰으로 push 하면, GitHub 입장에서는 사용자 권한의 commit 이라 자식 워크플로가 정상적으로 트리거된다.

```yaml
- name: Create pull request
  id: cpr
  uses: peter-evans/create-pull-request@v6
  with:
    token: ${{ secrets.MANIFEST_BOT_PAT }}
```

이 한 줄을 더한 다음 실행에서 PR #74 가 12:34:17Z 에 생성됐고, 같은 워크플로 안에서 auto-merge 가 12:34:20Z 에 켜졌고, CI 가 정상적으로 트리거돼서 12:35:00Z 에 머지됐다. 43 초, 사람 손 0 회.

## 돌아보면

"no version available" 한 줄이 보였을 때 그게 GitHub Actions 의 자식 워크플로 트리거 정책까지 들춰 보게 될 일이라고는 짐작 못 했다. 한 자리에서 시작해서 인접한 자리를 한 번씩 옮겨 가며 cache → ETag → static manifest → automation → PAT → child workflow trigger 정책 한 계열의 결정이 줄로 이어졌다. 한 발이 다음 한 발의 자리를 정하는 식의 진행.

네 계층 fallback 이라는 결과 자체보다, 그 네 계층이 같은 IP 한 자리에 응답을 누가 줄 거냐 라는 한 질문의 네 가지 답이라는 점이 더 기억에 남는다. cache 는 자기 디스크가 답하고, manifest 는 CDN 이 답하고, live API 는 GitHub 이 답하고, installed labels 는 이미 받아 둔 파일이 답한다. 어느 한 자리가 멈춰도 옆자리가 답을 한다. rate limit 한 줄이 가르친 게 있다면 한 응답의 근거를 한 자리에만 두지 않기.

그리고 자동화의 마지막 한 자리. `gh pr merge --auto --squash --delete-branch` 가 띄운 그 43 초가 사람 손이 닿을 자리를 한 자리 더 줄였다. 매일 03:00 UTC 의 cron 한 줄이, 다음 사람이 PAGE 를 깔았을 때 다이얼로그에 든 버전 목록 한 칸이 비어 있지 않게 한다.
