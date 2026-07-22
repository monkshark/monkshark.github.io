---
title: "#12 - `gem install solargraph` 한 줄에서 prebuilt 번들 다중 버전까지"
description: "한 줄짜리 설치 명령으로 끝날 줄 알았던 Ruby LSP 가 prebuilt 번들 다중 버전까지 늘어진 회고 — Windows 의 부재, MSYS2 의 무게, 마지막에 닿은 자리"
date: 2026-05-23T22:00:00+09:00
slug: page-ide-ruby-bootstrap-rabbit-hole
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "Ruby", "Windows", "MSYS2", "prebuilt", "GitHub Releases"]
---

처음 잡았을 때 한 줄로 적었다. `gem install solargraph`. PAGE 의 LSP 자동 설치를 모든 언어에 펴는 작업에서 Ruby 자리에 들어갈 명령이었다. 다른 언어들 Perl 의 `cpan`, R 의 `Rscript`, OCaml 의 `opam` 도 한 줄짜리 매니저 호출로 끝났다. Ruby 도 같은 줄에 들어갈 거라고 봤다.

그 한 줄이 매니저 한 호출이 아니라 prebuilt 번들 다운로드와 안티바이러스 감지와 다중 버전 노출까지 늘어지는 동안, 같은 자리에 다른 운영체제가 다른 가정을 깔고 있었다는 점을 그때마다 한 번씩 다시 배웠다.

## 한 자리, 세 가정

PAGE 의 LSP 자동 설치는 매니저별로 한 어댑터를 두는 구조다. GitHub Releases 갈래는 `GitHubReleaseInstaller`, npm 갈래는 `NpmGlobalInstaller`, 시스템 패키지 매니저 갈래는 `ShellPackageInstaller`. Ruby 는 첫 가정상 `ShellPackageInstaller` 한 자리에 들어가면 됐다. `gem install --no-document solargraph` 한 줄.

```kotlin
internal fun shellRubyInstaller(): LspInstaller = ShellPackageInstaller(
    ShellPackageDescriptor(
        languageId = "ruby",
        displayName = "solargraph",
        managerName = "gem",
        managerInstallUrl = "https://www.ruby-lang.org/en/downloads/",
        binaryName = "solargraph",
        packageName = "solargraph",
        buildInstallCommand = { mgr, pkg, _ -> listOf(mgr, "install", "--no-document", pkg) },
    ),
)
```

리눅스와 맥은 시스템에 ruby 가 깔려 있다는 가정 `/usr/bin/ruby` 든 Homebrew 의 `ruby` 든 위에서 같은 자리에 들어갈 거라고 봤다. `gem` 한 명령에 solargraph 한 줄. 같은 자리의 다른 매니저들 (`cpan`, `opam`, `Rscript`) 과 같은 모양. 실제 그 두 OS 에서 한 번씩 돌려 검증한 자리는 손에 그 자리가 없어서 비어 있다. 다만 코드 자리에 그 모양으로 어댑터를 끼워 둔 상태였고, 다음 자리에서 들춰 볼 수 있게 했다. Windows 만 시작부터 자리가 비어 있었다.

## Windows 의 첫 벽 ruby 가 없다

Windows 는 ruby 자체가 시스템에 없다. macOS 가 `/usr/bin/ruby` 를 가진 것과도, 리눅스 배포판 대부분이 `apt`/`dnf` 한 번으로 ruby 를 받을 수 있는 것과도 다르다. RubyInstaller2 라는 사실상의 표준 배포가 있긴 하지만 그것 자체가 설치 마법사 한 번을 사용자가 끝내야 하고, MSYS2 와 MinGW devkit 의 추가 설치 단계가 있고, 그 모든 게 PATH 변경과 환경변수 설정을 동반한다.

PAGE 의 자동 설치 약속은 한 클릭으로 설치 다이얼로그를 끝내는 것이었다. 사용자가 따로 RubyInstaller 를 받아 마법사를 돌리고 PATH 를 설정하라는 한 줄을 띄우는 자리에서는 이 약속이 깨진다.

첫 시도는 RubyInstaller2 의 silent installer + MSYS2 부트스트랩이었다. 다운로드 → `/silent` 플래그로 실행 → 끝난 자리에서 `ridk install` 로 devkit 까지. 코드는 짧았다. 실행은 길었다.

## UAC 와 Defender 가 멈춘 자리

Silent installer 가 UAC 동의창을 띄웠다. 한 사용자가 "예" 를 누르지 않으면 다음 한 줄로 못 갔다. "예" 를 누른 뒤에도, MSYS2 의 패키지 매니저 `pacman` 이 첫 동기화에서 Windows Defender 의 행위 기반 차단에 자식 프로세스 fork 가 막혔다. 어떤 사용자의 환경에서는 됐고, 어떤 환경에서는 30 분 동안 멈춰 있었다.

원인의 한 줄은 단순했다. MSYS2 의 fork 에뮬레이션은 Windows 의 ASR (Attack Surface Reduction) 규칙 한 갈래에 닿는다. 사용자가 그 규칙을 만지지 않은 상태에서는 그게 기본값이다 부트스트랩이 한 줄에서 멈춘다. 사람 손이 닿아야 하는 자리가 다시 한 자리 생겼다.

이 시점에서 한 결정이 필요했다 Windows 에서의 부트스트랩을 계속 사용자 컴퓨터 안에서 돌릴 것인가, 아니면 결과물만 배달할 것인가.

## prebuilt 번들로 자리 옮기기

두 번째 시도는 자리 자체를 옮기는 결정이었다. 부트스트랩의 모든 단계 Ruby + MSYS2 + MinGW UCRT64 + solargraph + 의존 gem 들 을 한 zip 으로 만들어 둔 자리에서 받아 가게.

```kotlin
const val DEFAULT_RUBY_VERSION = "3.4.6"
const val DEFAULT_SOLARGRAPH_VERSION = "0.55.4"

const val DEFAULT_RUBY_BUNDLE_RELEASE = "ruby-bundle"
const val DEFAULT_RUBY_BUNDLE_REPO = "monkshark/page-ide-assets"

internal val WINDOWS_BUNDLE_NAME = Regex("^page-ruby-solargraph-windows-x86_64-(.+?)\\.zip$")
```

`monkshark/page-ide-assets` 라는 별도 GitHub 레포에 GitHub Actions 워크플로 한 잡을 두고, 그 잡이 Windows runner 한 자리에서 RubyInstaller + MSYS2 + solargraph 까지 다 굴린 다음 결과 디렉토리를 zip 한 파일로 압축해서 release asset 에 올린다. PAGE 의 Windows 클라이언트는 그 zip 하나만 받아서 풀면 끝. 사용자 컴퓨터에서는 fork 가 없고 ASR 가 끼어들 자리가 없고 UAC 가 뜰 일이 없다.

설치 단계는 한 줄로 줄었다. 다운로드 + 압축 해제. 부트스트랩이 아니라 배달.

```kotlin
private fun installFromPrebuiltBundle(version: String, onProgress: (LspInstaller.Progress) -> Unit) {
    val target = rubyRoot(version)
    Files.createDirectories(target.parent)

    detectThirdPartyAntivirus(target, onProgress)
    requestDefenderExclusion(target, onProgress)

    val bundle = obtainBundleZip(version, onProgress)
    zipExtractor(bundle.path, target, 0)

    val solargraph = solargraphBinary(version)
    if (!Files.exists(solargraph)) {
        throw IOException(
            "solargraph.bat missing after bundle extraction: $solargraph",
        )
    }
}
```

## 다섯 자리의 graceful

자리 자체는 옮겼지만, 같은 자리에서 막힌 사람들이 옮긴 뒤에도 막혔다. 사용자 환경에 따라 다섯 가지 자리가 더 필요했다.

3rd-party AV 감지. Defender 가 아니라 노턴/카스퍼스키/맥아피 같은 다른 안티바이러스가 깔린 자리. 그쪽도 zip 추출 후의 `.exe` / `.dll` 를 검역하는 경우가 있다. 압축 해제 전에 한 번 감지해 두고 사용자에게 미리 안내한다.

```kotlin
detectThirdPartyAntivirus(target, onProgress)
```

Defender 자동 exclusion. 정책 허용 한도 안에서 설치 디렉토리를 Defender 검사 대상에서 빼는 PowerShell 한 줄을 시도한다. 사용자가 관리자 권한을 가진 자리에서는 통과하고, 아닌 자리에서는 거부됐다는 신호를 받고 그 자리에 매뉴얼 안내를 띄운다.

UAC 거부 graceful. exclusion 요청이 UAC 에서 거부된 자리에서 설치를 멈추지 않는다. AV 검역이 일어날 수 있다는 한 줄의 경고와 함께 그대로 진행한다. 사용자가 손해를 보는 자리가 더 적은 쪽을 택했다.

환경변수 fallback. 사내망이나 에어갭 환경에서 GitHub Releases 에 못 닿는 자리. `PAGE_RUBY_BUNDLE_OVERRIDE` 환경변수 한 자리에 로컬 zip 경로를 박을 수 있게 했다.

```kotlin
private val bundleOverridePath: () -> String? = { System.getenv("PAGE_RUBY_BUNDLE_OVERRIDE") },
```

실 컴파일 검증. assets 레포 워크플로가 빌드한 번들이 실제로 설치 가능한지 그리고 solargraph 가 정말 시동되는지 같은 워크플로 끝에서 다른 runner 한 자리를 띄워 검증했다. 빌드 잡과 검증 잡을 분리해서, 검증이 실패하면 release 자체가 발행되지 않게.

## 다중 버전 한 자리에 여러 답

처음에는 한 버전만 받았다. `DEFAULT_RUBY_VERSION = "3.4.6"`. 그 자리에 한 자리만 있었다. Ruby 3.3 을 쓰는 프로젝트가 있을 수 있고 3.5 의 새 기능을 쓰는 자리가 있을 수 있는데, IDE 의 설치 다이얼로그에는 단일 버전만 떠 있었다.

다중 버전은 빌드 시점에 한 자리 더 만들고, IDE 에서 그 자리들을 동적으로 노출하는 두 단계로 갈라졌다.

빌드 시점은 assets 레포 워크플로의 매트릭스에 ruby 버전 한 축을 더하는 것. `3.3.x` / `3.4.x` / `3.5.x` 셋이 같은 release 에 다른 자산 이름으로 올라간다 `page-ruby-solargraph-windows-x86_64-3.3.6.zip`, `...-3.4.6.zip`, `...-3.5.1.zip`.

런타임 노출은 IDE 가 GitHub Releases API 로 그 release 의 asset 목록을 받아서, 자산 이름 정규식으로 버전을 추출하는 것.

```kotlin
override fun availableVersions(): List<String> {
    val discovered = when (osKey) {
        "windows" -> discoverWindowsBundleVersions()
        "macos" -> discoverMacPortableVersions()
        else -> emptyList()
    }
    return (discovered + defaultRubyVersion).distinct().sortedWith(VERSION_DESC)
}

private fun discoverWindowsBundleVersions(): List<String> {
    val (owner, repo) = parseRepo(rubyBundleRepo) ?: return emptyList()
    return runCatching {
        versionsFetcher(owner, repo, rubyBundleRelease)
            .mapNotNull { WINDOWS_BUNDLE_NAME.find(it)?.groupValues?.get(1) }
            .filter { CLEAN_VERSION_REGEX.matches(it) }
    }.getOrDefault(emptyList())
}
```

assets 레포에 ruby 3.6 zip 한 자리가 새로 올라가면, IDE 의 설치 다이얼로그는 다음 열렸을 때 그 한 줄을 더 보여준다. 코드 변경 없이.

macOS 자리는 Homebrew 의 `homebrew-portable-ruby` 라는 별도 자리에서 비슷한 방식으로 받았다. 한쪽이 자체 빌드 매트릭스라면 한쪽은 외부 portable 자산 목록이라는 차이가 있을 뿐, 한 자리에서 여러 버전을 동적으로 채운다는 결정은 같다.

## 돌아보면

한 줄로 끝낼 수 있다고 봤던 자리가 여러 단계로 갈라졌다. 그 한 줄이 늘어진 자리들은 다시 적으면 모두 같은 한 질문의 자리였다.

> 사용자의 컴퓨터 안에서 무엇을 어디까지 돌릴 것인가.

리눅스/맥에서는 그 답이 한 줄짜리 매니저 호출. Windows 에서는 부트스트랩 단계가 ASR 와 UAC 와 Defender 사이로 흘러 들어가는 자리에서는 그 답이 prebuilt 번들 한 자리에서 받아 가기. 사용자 컴퓨터에서 안 돌릴 수 있는 자리는 안 돌리는 쪽이 사람 손이 닿을 자리를 줄이는 쪽이 결국 약속을 지키는 자리였다.

다른 한 가지는 한 자리에 답을 하나만 두지 않는다는 점. 다운로드 한 자리에 GitHub Releases 가 답하고, 그 자리가 막힌 사용자에게는 `PAGE_RUBY_BUNDLE_OVERRIDE` 환경변수가 답하고, 그 자리에서도 막힌 경우에는 매뉴얼 가이드 한 줄이 답한다. AV 검역의 자리에 Defender exclusion 시도가 답하고, UAC 거부의 자리에 graceful 한 줄이 답한다. 같은 자리에 답이 여러 개 있으면, 그 자리의 어느 한 답이 막혀도 다음 답이 자기 자리를 받는다.

`gem install solargraph` 한 줄로 끝났을 자리가 여러 자리로 갈라졌는데, 그 자리들을 다시 한 줄에 응축하면 한 명령의 약속을 한 클릭이 지키게 만드는 자리들 결국 같은 한 결정이 반복된 자리였다. 다음 언어 자리 다음 운영체제 자리 가 같은 식으로 늘어질 때, 이번 자리에서 깔아 둔 어댑터 계층이 그 자리들을 한 줄로 다시 줄여 줄 거라고 본다.
