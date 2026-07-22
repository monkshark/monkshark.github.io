---
title: "GitHub Actions로 프로필 README에 최신 블로그 글 띄우기"
description: "blog-post-workflow로 5분이면 될 줄 알았던 자동화가 code 128, 2026-00-30, 사라진 첫 줄, 권한까지 네 번 막힌 과정"
date: 2026-06-08
slug: github-readme-blog-automation
image:
categories:
    - 기술
tags:
    - GitHub Actions
    - 자동화
    - 삽질
---

프로필 README(`monkshark/monkshark`)에 블로그 최신 글을 자동으로 띄우고 싶었다. 글을 쓸 때마다 직접 README를 고치는 건 귀찮다.

[`gautamkrishnar/blog-post-workflow`](https://github.com/gautamkrishnar/blog-post-workflow)를 쓰면 된다. README에 마커를 두 개 박아두면, 액션이 RSS를 읽어 그 사이를 최신 글로 채워준다.

```markdown
## 📝 Latest Posts

<!-- BLOG-POST-LIST:START -->
<!-- BLOG-POST-LIST:END -->
```

처음 작성한 워크플로우는 이랬다.

```yaml
name: Latest blog posts
on:
  push:
    branches: [main]
  schedule:
    - cron: "0 */6 * * *"
permissions:
  contents: write
jobs:
  update-readme:
    runs-on: ubuntu-latest
    steps:
      - uses: gautamkrishnar/blog-post-workflow@v1
        with:
          feed_list: "https://monkshark.github.io/index.xml"
          template: "- [$title]($url) <sub>$newline_$date</sub>$newline"
          date_format: "yyyy-MM-dd"
```

5분이면 끝날 줄 알았다. 네 번 막혔다.

## `code: 128` checkout이 없었다

push하니 워크플로우는 돌았는데 실패했다. 로그를 보면 피드는 멀쩡히 가져왔다.

```
https://monkshark.github.io/index.xml runner succeeded. Post count: 29
##[error]{"code":128,"outputData":""}
```

글은 잘 읽었는데 마지막 커밋 단계에서 `code: 128`. git의 exit 128은 보통 "여긴 git 저장소가 아니다"다. 당연했다. 워크플로우에 `actions/checkout`이 없으니, 러너에는 README는커녕 `.git`조차 없었다. 액션이 커밋하려는데 저장소가 없으니 터진 것.

```yaml
    steps:
      - uses: actions/checkout@v4        # 이게 없었다
      - uses: gautamkrishnar/blog-post-workflow@v1
```

체크아웃을 넣으니 다음 단계로 넘어갔다. 그리고 더 황당한 게 기다리고 있었다.

## `2026-00-30` dateformat의 `MM`은 월이 아니다

이제 글 목록은 채워졌는데 날짜가 이랬다.

```
- [#13 - ...] 2026-00-30
- [#11 - ...] 2026-55-14
```

`00`월? `55`월? `date_format: "yyyy-MM-dd"`를 줬는데 월 자리에 이상한 숫자가 들어갔다.

원인은 이 액션이 쓰는 [`dateformat`](https://www.npmjs.com/package/dateformat) 라이브러리의 토큰 규칙이었다. 흔히 아는 Java `SimpleDateFormat`이나 date-fns와 다르다.

| 토큰 | dateformat에서의 의미 |
| --- | --- |
| `mm` | 월 (01–12) |
| `MM` | 분 (00–59) |

즉 `MM`은 월이 아니라 분이다. `2026-00-30`은 "분이 00", `2026-55-14`는 "분이 55"였던 것. 글이 작성된 시각의 분이 월 자리에 박혀 있었다.

```yaml
          date_format: "yyyy-mm-dd"   # MM → mm
```

`mm`으로 바꾸니 `2026-05-30`이 제대로 나왔다. 대소문자 하나 차이로 한참 들여다봤다.

## 첫 글이 사라진다 HTML 주석에 붙은 리스트

날짜는 고쳤는데, 이번엔 첫 번째 글만 렌더링이 깨졌다. 나머지 넷은 멀쩡한 불릿인데 첫 줄만 텍스트로 풀려버렸다.

원인은 마커였다. 액션은 `START` 주석 바로 뒤에 내용을 이어 붙인다. 내 템플릿이 `...$newline`으로 끝나니, 결과가 이렇게 됐다.

```markdown
<!-- BLOG-POST-LIST:START -->- [#13 - ...] <sub>2026-05-30</sub>
- [#12 - ...] <sub>2026-05-23</sub>
```

첫 글이 `<!-- ... -->`와 같은 줄에 붙어 있다. Markdown에서 리스트 항목의 `-`는 줄 맨 앞에 와야 하는데, 앞에 주석이 있으니 첫 줄은 리스트로 인식되지 않는다.

해결은 템플릿 앞쪽에 줄바꿈을 두는 것. 그러면 첫 글이 주석 다음 줄에서 시작한다.

```yaml
          template: "$newline- [$title]($url) <sub>$date</sub>"
```

```markdown
<!-- BLOG-POST-LIST:START -->
- [#13 - ...] <sub>2026-05-30</sub>   ← 이제 자기 줄에서 시작
```

## 권한: 워크플로우가 저장소 설정을 못 이긴다

사실 위 세 개를 고치는 사이, 더 먼저 막혔던 게 권한이었다. 워크플로우에 분명히 이렇게 적어뒀는데도 커밋이 거부됐다.

```yaml
permissions:
  contents: write
```

워크플로우 레벨의 `permissions`는 저장소 기본 설정을 넘어설 수 없다. 저장소 기본이 read-only면, YAML에서 write를 선언해도 토큰은 read-only로 발급된다. 워크플로우 권한은 "상한선 안에서 줄이는" 용도지, "상한선을 올리는" 용도가 아니다.

저장소 설정에서 한 번 열어줘야 한다.

> Settings → Actions → General → Workflow permissions → Read and write permissions

이걸 켜고 나서야 커밋이 통과했다.

## 최종 워크플로우

네 번을 거쳐 정착한 형태.

```yaml
name: Latest blog posts
on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  update-readme:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Pull latest posts into README
        uses: gautamkrishnar/blog-post-workflow@v1
        with:
          feed_list: "https://monkshark.github.io/index.xml"
          max_post_count: 3
          template: "$newline- [$title]($url) <sub>$date</sub>"
          date_format: "yyyy-mm-dd"
          commit_message: "chore: update latest blog posts"
```

## 마무리

네 번의 실패는 종류가 전부 달랐다.

1. checkout 누락 액션이 동작할 전제를 안 깔아줬다
2. **`MM` vs `mm`** 라이브러리마다 포맷 토큰이 다르다는 걸 잊었다
3. 주석에 붙은 첫 줄 출력이 어디에 어떻게 삽입되는지 안 봤다
4. 권한 상한선 선언한 권한과 실제 발급되는 권한은 다르다

네 개를 관통하는 한 줄은, "되겠지" 하고 넘긴 전제마다 정확히 한 번씩 막혔다는 것이다. 5분짜리 액션도 남의 추상 위에서 돌아가는 한, 그 추상이 어디서 새는지는 직접 밟아봐야 안다.
