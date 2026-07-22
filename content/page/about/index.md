---
title: About
description: 블로그 소개
date: 2026-04-14
menu:
    main:
        weight: -90
        params:
            icon: user
---

## 소개

만들고 싶은 것이 생기면, 끝까지 만들어보는 편입니다. 프로토타입에서 멈추지 않고 출시 가능한 형태로 끌고 가는 데 재미를 느낍니다.

기술 선택은 정답을 찾는 일이 아니라 무엇을 포기할지를 정하는 일이라고 생각합니다. "이 기술이 좋다"보다 "이 상황에서는 이 트레이드오프가 맞다"고 말할 수 있는 쪽이 되고 싶습니다.

Java로 코드를 시작해 Android, Flutter, 웹과 백엔드, UX 디자인까지 다뤄왔습니다. 한 영역에 머물기보다 끝과 끝을 모두 만져보고, 그 사이의 거리감을 익히는 데 관심이 있습니다.

이 블로그는 그 과정의 기록입니다. 기술 선택의 이유, 삽질한 과정, 구조를 바꾼 배경 같은 것들을 담습니다. 튜토리얼이라기보다는 개발 일지에 가깝습니다.

## 기술 스택

<style>
.tech-section { margin-bottom: 1.5rem; }
.tech-section h3 { font-size: 0.95rem; margin-bottom: 0.6rem; color: var(--card-text-color-secondary); }
.tech-icons { display: flex; flex-wrap: wrap; gap: 12px; }
.tech-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--card-background);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: default;
}
.tech-icon:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.tech-icon--link { cursor: pointer; }
.tech-icon--link::after {
  content: "";
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-color);
  opacity: 0.55;
}
.tech-icon--link:hover::after { opacity: 1; }
.tech-icon i { font-size: 28px; }
.tech-icon .tech-tooltip {
  position: absolute;
  bottom: -28px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--card-text-color-main);
  color: var(--card-background);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}
.tech-icon:hover .tech-tooltip { opacity: 1; }
</style>

<div class="tech-section">
<h3>Language</h3>
<div class="tech-icons">
{{< tech "Java" "devicon-java-plain colored" >}}
{{< tech "Kotlin" "devicon-kotlin-plain colored" >}}
{{< tech "JavaScript" "devicon-javascript-plain colored" >}}
{{< tech "TypeScript" "devicon-typescript-plain colored" >}}
{{< tech "C++" "devicon-cplusplus-plain colored" >}}
{{< tech "C#" "devicon-csharp-plain colored" >}}
{{< tech "Obj-C" "devicon-objectivec-plain colored" >}}
{{< tech "Dart" "devicon-dart-plain colored" >}}
{{< tech "Python" "devicon-python-plain colored" >}}
</div>
</div>

<div class="tech-section">
<h3>Mobile</h3>
<div class="tech-icons">
{{< tech "Android" "devicon-android-plain colored" >}}
{{< tech "Jetpack Compose" "devicon-jetpackcompose-plain colored" >}}
{{< tech "iOS" "devicon-apple-original" >}}
{{< tech "SwiftUI" "devicon-swift-plain colored" >}}
{{< tech "Flutter" "devicon-flutter-plain colored" >}}
{{< tech "React Native" "devicon-react-original colored" >}}
</div>
</div>

<div class="tech-section">
<h3>Web</h3>
<div class="tech-icons">
{{< tech "HTML" "devicon-html5-plain colored" >}}
{{< tech "CSS" "devicon-css3-plain colored" >}}
{{< tech "SCSS" "devicon-sass-original colored" >}}
{{< tech "Tailwind CSS" "devicon-tailwindcss-original colored" >}}
{{< tech "React" "devicon-react-original colored" >}}
{{< tech "Next.js" "devicon-nextjs-plain" >}}
</div>
</div>

<div class="tech-section">
<h3>Backend</h3>
<div class="tech-icons">
{{< tech "Node.js" "devicon-nodejs-plain colored" >}}
{{< tech "Express" "devicon-express-original" >}}
{{< tech "Spring Boot" "devicon-spring-original colored" >}}
{{< tech "MySQL" "devicon-mysql-original colored" >}}
{{< tech "MongoDB" "devicon-mongodb-plain colored" >}}
{{< tech "Firebase" "devicon-firebase-plain colored" >}}
</div>
</div>

<div class="tech-section">
<h3>CI/CD</h3>
<div class="tech-icons">
{{< tech "Gradle" "devicon-gradle-original colored" >}}
{{< tech "GitHub Actions" "devicon-githubactions-plain colored" >}}
{{< tech "Docker" "devicon-docker-plain colored" >}}
{{< tech "Kubernetes" "devicon-kubernetes-plain colored" >}}
{{< tech "Vercel" "devicon-vercel-original" >}}
{{< tech "JUnit" "devicon-junit-plain colored" >}}
{{< tech "Codecov" "devicon-codecov-plain colored" >}}
</div>
</div>

<div class="tech-section">
<h3>Tools</h3>
<div class="tech-icons">
{{< tech "IntelliJ" "devicon-intellij-plain colored" >}}
{{< tech "WebStorm" "devicon-webstorm-plain colored" >}}
{{< tech "Rider" "devicon-rider-plain colored" >}}
{{< tech "CLion" "devicon-clion-plain colored" >}}
{{< tech "VS Code" "devicon-vscode-plain colored" >}}
{{< tech "Git" "devicon-git-plain colored" >}}
{{< tech "GitHub" "devicon-github-original" >}}
{{< tech "Figma" "devicon-figma-plain colored" >}}
{{< tech "Postman" "devicon-postman-plain colored" >}}
{{< tech "Notion" "devicon-notion-plain" >}}
</div>
</div>

## 연재 중

{{< series-board >}}

## 연락처

- **GitHub**: [monkshark](https://github.com/monkshark)
- **Instagram**: [@void___main](https://instagram.com/void___main)
- **Mail**: [justinchoo0814@gmail.com](mailto:justinchoo0814@gmail.com)
