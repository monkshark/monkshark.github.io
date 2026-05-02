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

Java로 코드를 시작해 Android, Flutter, 웹과 백엔드까지 다뤄왔습니다. 한 영역에 머물기보다 끝과 끝을 모두 만져보고, 그 사이의 거리감을 익히는 데 관심이 있습니다.

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
  <div class="tech-icon"><i class="devicon-java-plain colored"></i><span class="tech-tooltip">Java</span></div>
  <div class="tech-icon"><i class="devicon-kotlin-plain colored"></i><span class="tech-tooltip">Kotlin</span></div>
  <div class="tech-icon"><i class="devicon-javascript-plain colored"></i><span class="tech-tooltip">JavaScript</span></div>
  <div class="tech-icon"><i class="devicon-typescript-plain colored"></i><span class="tech-tooltip">TypeScript</span></div>
  <div class="tech-icon"><i class="devicon-cplusplus-plain colored"></i><span class="tech-tooltip">C++</span></div>
  <div class="tech-icon"><i class="devicon-csharp-plain colored"></i><span class="tech-tooltip">C#</span></div>
  <div class="tech-icon"><i class="devicon-objectivec-plain colored"></i><span class="tech-tooltip">Obj-C</span></div>
  <div class="tech-icon"><i class="devicon-dart-plain colored"></i><span class="tech-tooltip">Dart</span></div>
  <div class="tech-icon"><i class="devicon-python-plain colored"></i><span class="tech-tooltip">Python</span></div>
</div>
</div>

<div class="tech-section">
<h3>Mobile</h3>
<div class="tech-icons">
  <div class="tech-icon"><i class="devicon-android-plain colored"></i><span class="tech-tooltip">Android</span></div>
  <div class="tech-icon"><i class="devicon-jetpackcompose-plain colored"></i><span class="tech-tooltip">Jetpack Compose</span></div>
  <div class="tech-icon"><i class="devicon-apple-original"></i><span class="tech-tooltip">iOS</span></div>
  <div class="tech-icon"><i class="devicon-swift-plain colored"></i><span class="tech-tooltip">SwiftUI</span></div>
  <div class="tech-icon"><i class="devicon-flutter-plain colored"></i><span class="tech-tooltip">Flutter</span></div>
  <div class="tech-icon"><i class="devicon-react-original colored"></i><span class="tech-tooltip">React Native</span></div>
</div>
</div>

<div class="tech-section">
<h3>Web</h3>
<div class="tech-icons">
  <div class="tech-icon"><i class="devicon-html5-plain colored"></i><span class="tech-tooltip">HTML</span></div>
  <div class="tech-icon"><i class="devicon-css3-plain colored"></i><span class="tech-tooltip">CSS</span></div>
  <div class="tech-icon"><i class="devicon-sass-original colored"></i><span class="tech-tooltip">SCSS</span></div>
  <div class="tech-icon"><i class="devicon-tailwindcss-original colored"></i><span class="tech-tooltip">Tailwind CSS</span></div>
  <div class="tech-icon"><i class="devicon-react-original colored"></i><span class="tech-tooltip">React</span></div>
  <div class="tech-icon"><i class="devicon-nextjs-plain"></i><span class="tech-tooltip">Next.js</span></div>
</div>
</div>

<div class="tech-section">
<h3>Backend</h3>
<div class="tech-icons">
  <div class="tech-icon"><i class="devicon-nodejs-plain colored"></i><span class="tech-tooltip">Node.js</span></div>
  <div class="tech-icon"><i class="devicon-express-original"></i><span class="tech-tooltip">Express</span></div>
  <div class="tech-icon"><i class="devicon-spring-original colored"></i><span class="tech-tooltip">Spring Boot</span></div>
  <div class="tech-icon"><i class="devicon-mysql-original colored"></i><span class="tech-tooltip">MySQL</span></div>
  <div class="tech-icon"><i class="devicon-mongodb-plain colored"></i><span class="tech-tooltip">MongoDB</span></div>
  <div class="tech-icon"><i class="devicon-firebase-plain colored"></i><span class="tech-tooltip">Firebase</span></div>
</div>
</div>

<div class="tech-section">
<h3>CI/CD</h3>
<div class="tech-icons">
  <div class="tech-icon"><i class="devicon-gradle-original colored"></i><span class="tech-tooltip">Gradle</span></div>
  <div class="tech-icon"><i class="devicon-githubactions-plain colored"></i><span class="tech-tooltip">GitHub Actions</span></div>
  <div class="tech-icon"><i class="devicon-docker-plain colored"></i><span class="tech-tooltip">Docker</span></div>
  <div class="tech-icon"><i class="devicon-kubernetes-plain colored"></i><span class="tech-tooltip">Kubernetes</span></div>
  <div class="tech-icon"><i class="devicon-vercel-original"></i><span class="tech-tooltip">Vercel</span></div>
  <div class="tech-icon"><i class="devicon-junit-plain colored"></i><span class="tech-tooltip">JUnit</span></div>
  <div class="tech-icon"><i class="devicon-codecov-plain colored"></i><span class="tech-tooltip">Codecov</span></div>
</div>
</div>

<div class="tech-section">
<h3>Tools</h3>
<div class="tech-icons">
  <div class="tech-icon"><i class="devicon-intellij-plain colored"></i><span class="tech-tooltip">IntelliJ</span></div>
  <div class="tech-icon"><i class="devicon-webstorm-plain colored"></i><span class="tech-tooltip">WebStorm</span></div>
  <div class="tech-icon"><i class="devicon-rider-plain colored"></i><span class="tech-tooltip">Rider</span></div>
  <div class="tech-icon"><i class="devicon-clion-plain colored"></i><span class="tech-tooltip">CLion</span></div>
  <div class="tech-icon"><i class="devicon-vscode-plain colored"></i><span class="tech-tooltip">VS Code</span></div>
  <div class="tech-icon"><i class="devicon-git-plain colored"></i><span class="tech-tooltip">Git</span></div>
  <div class="tech-icon"><i class="devicon-github-original"></i><span class="tech-tooltip">GitHub</span></div>
  <div class="tech-icon"><i class="devicon-figma-plain colored"></i><span class="tech-tooltip">Figma</span></div>
  <div class="tech-icon"><i class="devicon-postman-plain colored"></i><span class="tech-tooltip">Postman</span></div>
  <div class="tech-icon"><i class="devicon-notion-plain"></i><span class="tech-tooltip">Notion</span></div>
</div>
</div>

## 연락처

- **GitHub**: [monkshark](https://github.com/monkshark)
- **Instagram**: [@void___main](https://instagram.com/void___main)
- **Mail**: [justinchoo0814@gmail.com](mailto:justinchoo0814@gmail.com)
