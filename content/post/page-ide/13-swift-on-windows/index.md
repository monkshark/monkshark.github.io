---
title: "#13 - `swift hello.swift` 한 줄이 Windows SDK 링킹까지 닿기까지"
description: "`swift {file}` 한 줄로 끝날 줄 알았던 Swift 실행이 Windows 에서는 immediate 모드 부재부터 막혀, MSVC 헤더·링킹·tar long-name 까지 일곱 겹의 벽을 지난 회고"
date: 2026-05-30T13:00:00+09:00
slug: page-ide-swift-on-windows
categories: ["PAGE 개발기"]
tags: ["PAGE", "Kotlin", "Swift", "Windows", "MSVC", "xwin", "Foundation", "tar", "toolchain"]
---

PAGE 의 Run 버튼은 언어를 가리지 않는 자리다. `.py` 도, `.go` 도, `.rs` 도 같은 버튼 하나로 돌아간다. 새 언어를 붙이는 일은 대개 실행 명령 한 줄을 템플릿에 추가하는 정도로 끝난다.

```kotlin
"swift" -> RunTemplate(command = listOf("swift", "{file}"))
```

Swift 도 그렇게 끝날 줄 알았다. macOS 나 Linux 였다면 그랬을 것이다. 그런데 Windows 에서 이 한 줄은 시작점이었을 뿐, 그 뒤로 한참을 더 가야 했다. 이 글은 `swift hello.swift` 한 줄이 Windows SDK 링킹과 tar 파서 교체까지 닿는 동안 지나온 벽들의 기록이다.

## 시작 — swiftc 를 머신에 올리는 일

벽을 이야기하기 전에, 애초에 `swiftc` 가 머신에 있어야 한다. Windows 사용자에게 Swift 툴체인 설치를 직접 시킬 수는 없으니, PAGE 는 다른 언어와 같은 방식으로 풀었다. 미리 빌드해 둔 툴체인 번들을 `page-ide-assets` 릴리스에서 받아 사용자 디렉터리에 푼다.

```kotlin
private fun assetNamePattern(): Regex =
    Regex("^page-swift-toolchain-$osKey-$arch-(.+?)\\.tar\\.gz$")
```

번들은 500MB에서 1.2GB에 이른다. 다른 언어 인스톨러와 같은 모양이라, 받아서 풀고 `swiftc`·`sourcekit-lsp` 경로를 잡아 두면 이 단계는 끝난다. 적어도 그렇게 보였다. 진짜 벽은 이 `swiftc` 를 실제로 굴리려 할 때부터 하나둘 드러났다 — 그리고 그중 하나는 방금 푼 이 번들 안에 숨어 있었다.

## 첫 번째 벽 — immediate 모드가 없다

다른 언어와 똑같이 `swift {file}` 를 실행했더니, Windows 에서는 즉시 죽었다. macOS·Linux 의 `swift foo.swift` 는 파일을 그 자리에서 해석·실행하는 immediate 모드를 쓴다. 이 모드는 LLVM 의 ORC JIT 위에서 동작하는데, Windows 용 Swift 툴체인은 이 JIT 실행을 지원하지 않는다. 인터프리터처럼 한 번에 돌릴 방법이 없는 것이다.

그래서 Swift 만은 다른 길로 보냈다. 한 줄 실행 대신 "먼저 컴파일하고, 나온 exe 를 실행한다" 는 2단계 모델이다. PAGE 의 Run 설정에는 본 실행 전에 돌릴 사전 명령(prelaunch)을 넣을 자리가 있어서, 여기에 `swiftc` 컴파일을 끼워 넣었다.

```kotlin
fun swiftWindowsPrelaunch(file: String, base: String): List<String> = listOf(
    "swiftc", file,
    "-use-ld=lld",
    "-o", "$base.exe",
)
```

Run 을 누르면 `swiftc` 가 먼저 돌아 `hello.exe` 를 만들고, 그다음 그 exe 를 실행한다. 화면상으로는 여전히 버튼 하나지만, 안에서는 컴파일과 실행이 나뉘어 돌아간다. 여기까지는 순조로웠다. `print("hello")` 한 줄짜리는 잘 돌았다.

## 두 번째 벽 — `import Foundation` 이 빌드되지 않는다

문제는 그다음이었다. `print` 만 쓰는 코드는 드물다. 날짜를 다루든 문자열을 포매팅하든, 조금만 실용적인 코드가 되면 `import Foundation` 이 등장한다. 그리고 Windows 에서 이 한 줄을 넣은 순간 `swiftc` 가 헤더를 찾지 못해 무너졌다.

원인을 따라가 보니 Foundation 은 Windows 에서 C 런타임과 Windows SDK 위에 얹혀 있었다. 즉 Swift 코드를 컴파일하려는데 MSVC 의 C 헤더와 Windows SDK 헤더·라이브러리가 있어야 했다. Swift 툴체인만 깔아서는 절반만 갖춘 셈이었다. 평범한 Windows 개발자라면 Visual Studio 를 통째로 설치해 해결하겠지만, PAGE 는 IDE 안에서 필요한 것만 내려받아 설치하는 흐름을 지향한다. 수 GB짜리 Visual Studio 설치를 사용자에게 강요할 수는 없었다.

여기서 `xwin` 을 찾았다. Microsoft 의 재배포 가능 패키지에서 MSVC CRT 와 Windows SDK 의 헤더·라이브러리만 골라 받아오는 도구다. 이걸 감싸는 `WindowsSdkInstaller` 를 만들어, xwin 으로 받은 산출물(splat)에서 `INCLUDE`·`LIB` 경로를 구성하고 컴파일 환경에 주입하도록 했다.

```kotlin
fun buildEnv(splat: Path): Map<String, String> = mapOf(
    "INCLUDE" to includeDirs(splat).joinToString(File.pathSeparator),
    "LIB" to libDirs(splat).joinToString(File.pathSeparator),
)
```

`File.pathSeparator` 를 쓴 건 나중에 CI 에서 톡톡히 값을 했는데, 그 이야기는 뒤에서 다시 한다.

## 세 번째 벽 — 사라진 `corecrt_math.h`

헤더 경로를 다 맞췄는데도 컴파일이 깨졌다. 이번엔 메시지가 구체적이었다. `corecrt_math.h` 를 찾을 수 없다는 것이다.

xwin 이 받아온 SDK 버전은 최신(26100)이었는데, 이 버전에서 `corecrt_math.h` 헤더가 제거되어 있었다. 그런데 같은 SDK 안의 ucrt modulemap 은 여전히 이 헤더를 참조하는 모듈을 선언하고 있었다. 헤더는 없는데 모듈 정의는 그 헤더를 가리키니, Clang 이 모듈을 구성하려다 없는 파일에 걸려 넘어진 것이다.

해결은 외과적으로 갔다. modulemap 에서 없는 헤더를 가리키는 그 서브모듈만 도려내는 패치를 만들었다. 헤더가 실제로 있으면 건드리지 않고, 없을 때만 해당 선언을 제거한다.

```kotlin
fun patchMissingCorecrtMath(modulemap: String): String =
    modulemap.replace(MATH_SUBMODULE_REGEX, "")
```

이걸 splat 배포 단계(`deployModulemaps`)에 끼워, 헤더 누락 여부를 보고 조건부로 적용했다. 헤더가 있는 구버전 SDK 에서는 원본을 그대로 두고, 없는 신버전에서만 패치가 작동한다. 테스트도 두 경우를 모두 고정해 두었다 — 누락 시 도려내고, 존재 시 보존한다.

## 네 번째 벽 — 링크는 또 별개였다

컴파일이 통과하자 이번엔 링크에서 막혔다. Foundation 의 심볼을 찾지 못한다는 것이다. 헤더로 컴파일이 되는 것과, 실제 Foundation 구현을 실행 파일에 이어 붙이는 것은 별개의 일이었다. Foundation 의 import 라이브러리(`Foundation.lib`)를 링커에 명시적으로 넘겨줘야 했다.

prelaunch 명령에 링커 인자를 더 얹었다.

```kotlin
listOf(
    "swiftc", file,
    "-use-ld=lld",
    "-Xcc", "-Xclang", "-Xcc", "-fbuiltin-headers-in-system-modules",
    "-Xlinker", foundationLib,
    "-o", "$base.exe",
)
```

`-fbuiltin-headers-in-system-modules` 는 Clang 의 빌트인 헤더가 시스템 모듈과 충돌하는 걸 막는 플래그였고, `-Xlinker` 로 Foundation import 라이브러리를 직접 물렸다. 이 조합을 맞추고서야 `import Foundation` 을 쓴 코드가 빌드·링크·실행까지 한 번에 흘렀다.

## 다섯 번째 벽 — tar 가 긴 경로를 잘라먹었다

컴파일·링크가 풀리고 나서야, 앞서 넘어왔다고 생각한 설치 단계에 사실은 금이 가 있었다는 걸 알았다. 맨 앞에서 받아 푼 그 툴체인 번들 말이다. 추출은 끝났는데도 일부 `.swiftmodule` 을 import 할 때 모듈을 찾지 못했다. 경로가 미묘하게 잘려 있었다.

PAGE 의 옛 tar 추출기는 직접 구현한 ustar 리더였다. ustar 포맷은 파일 이름을 100바이트 필드에 담는데, Swift 툴체인의 모듈 경로는 이 한계를 넘는 것들이 있었다. GNU tar 는 이런 긴 이름을 `@LongLink`(typeflag 'L') 라는 별도 엔트리로, 혹은 PAX 확장 헤더로 따로 기록한다. 우리 리더는 이 확장 엔트리를 해석하지 못하고 100바이트에서 그냥 잘랐다. 그러니 긴 경로의 모듈이 엉뚱한 이름으로 풀려 import 가 실패한 것이다.

직접 짠 리더로 tar 의 온갖 확장 포맷을 다 떠받치는 건 무리였다. 옛 리더(TarReader)를 들어내고 Apache Commons Compress 의 `TarArchiveInputStream` 으로 추출 경로를 통일했다. `@LongLink` 도 PAX 헤더도 알아서 처리하는 검증된 구현이다.

```kotlin
TarArchiveInputStream(input).use { tar ->
    var entry = tar.nextEntry
    while (entry != null) {
        val target = dest.resolve(entry.name).normalize()
        // ... 긴 경로도 entry.name 에 온전히 담겨 온다
        entry = tar.nextEntry
    }
}
```

리더를 바꾸자 잘림이 사라졌고, 모듈 경로가 온전히 복원됐다.

## 여섯 번째 벽 — Duplicate values for key 'Path'

이제 진짜 다 됐다고 생각했을 때, 실행 단계에서 낯선 크래시를 만났다. Swift 런타임이 `Fatal error: Duplicate values for key 'Path'` 를 뱉으며 죽었다.

Swift 의 `ProcessInfo.environment` 는 키를 대소문자 구분 없이(case-insensitive) 다룬다. 그런데 Windows 환경 변수에는 `Path` 와 `PATH` 가 둘 다 있을 수 있다. Swift 입장에서는 같은 키가 둘이니, 딕셔너리를 만들다 중복으로 터진 것이다.

처음엔 PAGE 가 자식 프로세스에 환경을 넘기면서 `Path` 를 중복으로 집어넣은 줄 알았다. 그래서 재현을 시도했는데, 아무리 해도 Java 경로에서는 중복이 재현되지 않았다. 파고들어 보니 Java 의 `ProcessBuilder` 는 자식을 띄우는 순간 환경 블록을 만들면서 대소문자가 같은 키를 이미 한 번 정리해서 넘긴다. 즉 Java 가 띄운 자식은 애초에 중복 `Path`/`PATH` 를 볼 수 없었다. 그 크래시는 깨진 설치 상태에서 비정상적으로 흘러든 환경이었던 것으로 결론지었다 — PAGE 코드가 만든 버그가 아니었다.

그래도 같은 모양의 사고가 다시 나는 건 막고 싶었다. 자식 프로세스 환경을 넘기기 직전에 대소문자가 겹치는 키를 한 번 정리하는 방어 코드를 넣었다. 버그를 고친다기보다, 환경 변수 충돌의 여지 자체를 닫아두는 쪽이다.

## 일곱 번째 벽이라기보단, 기다림

마지막은 벽이 아니라 체감 속도였다. `import Foundation` 한 줄을 처음 컴파일하면 Clang 이 모듈 캐시를 통째로 구워야 한다. 이 캐시가 100MB를 훌쩍 넘는다. 측정해 보니 첫 실행이 약 10초였다. Run 한 번에 10초를 기다리는 건 인터프리터 언어의 즉시성에 익숙한 손에는 한참이었다.

다만 이 비용은 한 번뿐이다. 모듈 캐시가 자리를 잡고 나면 재실행은 약 2.5초로 떨어졌다. 그래서 소스가 바뀌지 않았다면 굳이 다시 컴파일할 이유가 없었다. make 가 하는 일을 작게 흉내 낸 `BuildCache` 를 두어, 출력물이 모든 입력 소스보다 새것이고 빌드 명령이 그대로면 컴파일 단계를 통째로 건너뛰게 했다.

```kotlin
fun upToDate(output: Path, inputs: List<Path>, buildKey: String): Boolean {
    if (!Files.exists(output)) return false
    val marker = output.resolveSibling("${output.fileName}.pagebuild")
    if (!Files.exists(marker) || Files.readString(marker).trim() != buildKey) return false
    val outTime = Files.getLastModifiedTime(output).toMillis()
    return inputs.isNotEmpty() && inputs.all { Files.getLastModifiedTime(it).toMillis() <= outTime }
}
```

빌드 명령 동일성까지 키에 넣은 건, 컴파일 플래그가 바뀌었는데 산출물 시각만 보고 "최신" 이라 착각하는 걸 막기 위해서다. 소스도 플래그도 그대로일 때만 캐시가 적중한다.

## CI 가 잡아준 마지막 한 줄

여담 하나. `buildEnv` 가 `INCLUDE`·`LIB` 를 이을 때 `File.pathSeparator` 를 쓴다고 앞에서 적었다. 이걸 검증하는 테스트를 짜면서, 처음엔 입력 경로를 `Path("C:", "splat")` 같은 Windows 스타일로 박아 넣었다. 로컬(Windows)에서는 멀쩡히 통과했다.

그런데 CI 는 ubuntu 에서 돈다. Linux 에서 경로 구분자는 `:` 다. `C:` 의 콜론이 경로 문자열에 그대로 남아 `:` 로 split 하는 검증과 충돌하면서 테스트가 깨졌다. 코드가 아니라 테스트가 OS 에 의존하고 있었던 것이다. `Files.createTempDirectory` 로 OS 가 알아서 만들어 주는 경로를 쓰도록 고쳐, 어느 플랫폼에서 돌든 같은 결과가 나오게 했다.

```kotlin
val splat: Path = Files.createTempDirectory("page-splat-env")
val env = windows().buildEnv(splat)
val sep = File.pathSeparator
assertEquals(windows().includeDirs(splat).size, env.getValue("INCLUDE").split(sep).size)
```

Windows 를 지원하려고 시작한 작업의 테스트가 Linux 에서 깨진 건, 돌이켜보면 이 글 전체를 요약하는 장면 같기도 하다. 한 플랫폼의 당연함이 다른 플랫폼에서는 당연하지 않다.

## 돌아보며

`swift {file}` 한 줄로 끝날 줄 알았던 작업은, immediate 모드의 부재로 시작해 swiftc 2단계 모델, MSVC·Windows SDK 확보, 사라진 헤더의 modulemap 패치, Foundation 링크, tar long-name, 환경 변수 중복, 그리고 증분 캐시까지 일곱 겹의 벽을 지나서야 다른 언어와 같은 자리에 섰다.

벽 하나하나는 사실 Windows 와 Swift 가 서로를 전제하지 않아 생긴 틈이었다. macOS 라면 OS 가 메워 줬을 틈을, Windows 에서는 IDE 가 직접 메워야 했다. PAGE 가 "필요한 걸 IDE 안에서 받아 설치한다" 는 방향을 고집하는 한, 이런 틈을 메우는 일은 계속 나올 것이다. 다음 언어에서는 또 어떤 당연함이 당연하지 않을지, 그건 그때 가서 또 부딪혀 보기로 한다.
