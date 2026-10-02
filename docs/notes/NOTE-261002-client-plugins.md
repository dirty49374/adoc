---
title: 브라우저에서 도는 plugin 코드 — 첫 사례는 그림판
status: OPEN
---

## Background

지금 plugin은 서버에서 HTML 문자열만 만들고, 브라우저에서는 plugin 코드가 전혀 돌지 않습니다. 그래서 그림판처럼 마우스로 직접 조작하는 화면은 만들 수 없습니다. plugin이 브라우저 쪽 코드(client-side code)와 그 라이브러리를 함께 실을 수 있는 메커니즘을 설계합니다.

첫 사례는 **그림판**입니다. 사람이 UI 같은 것을 그려서 agent에게 전달하는 기능입니다. 말로 설명하기 어려운 화면 배치를 그림으로 보여 주면, agent가 그것을 보고 NOTE나 spec, 코드로 옮깁니다.

(서버 쪽 라이브러리, 즉 `index.ts`가 쓰는 npm 패키지는 설치 작업에서 다룹니다. [[NOTE-261002-installation]] 참고.)

## What is wrong today

- render는 HTML 문자열만 돌려줍니다. 브라우저에서 plugin JS를 실행할 방법이 없습니다.
- 사람이 agent에게 보낼 수 있는 것은 글(comment, composer 입력)과 버튼 같은 action뿐입니다. 그림을 보낼 방법이 없습니다.
- 가이드가 plugin의 import를 `@adoc/plugin-kit`과 Node 내장 모듈로 제한합니다.

## Findings

**브라우저 코드를 싣는 방식(업계):**

| 방식 | 예 | 장점 | 단점 |
|---|---|---|---|
| Web Component(custom element) | Jupyter의 anywidget, 여러 문서 도구 | 페이지와 같은 DOM이라 테마 토큰(`--adoc-*`), anchor, comment를 그대로 씀. 가벼움 | 격리가 약함: plugin 코드가 페이지 전체에 접근 가능 |
| iframe + postMessage | VS Code webview, Figma plugin UI | 격리가 강함: plugin이 페이지를 망가뜨리지 못함 | 테마, 크기 조절, comment 연결을 메시지로 따로 이어야 함 |
| 같은 페이지에서 직접 실행 | Obsidian plugin | 가장 자유로움 | 격리 없음, adoc 내부 API에 묶임 |

**그림판 라이브러리** (2026-10-02, npm 기준):

| 라이브러리 | 버전 | 라이선스 | 비고 |
|---|---|---|---|
| Excalidraw (`@excalidraw/excalidraw`) | 0.18.1 | MIT | 손그림 느낌의 wireframe에 많이 쓰임. 파일은 JSON(`.excalidraw`)이고 도형, 글자, 위치가 텍스트로 들어 있음. React 컴포넌트(React 19 지원). 패키지가 큼(풀었을 때 약 47MB, 실제 번들은 훨씬 작음) |
| tldraw | 5.5.2 | 자체 라이선스(LICENSE.md) | 상용·배포에는 라이선스 조건 확인이 필요함(자세한 조건은 아직 확인하지 않음) |
| 직접 만든 SVG 그림판 | — | — | 가볍지만 도형 편집, 글자, 선택 등을 모두 만들어야 함 |

**agent가 그림을 받는 방법:**

- Claude Code는 이미지 파일(PNG 등)을 Read로 열어 볼 수 있습니다. Codex도 이미지를 입력으로 받을 수 있지만, 방법은 아직 확인하지 않았습니다.
- herdr로 보내는 message는 글자뿐입니다. 그래서 그림은 **파일로 저장**하고 message에는 경로를 적는 방식이 자연스럽습니다.
- Excalidraw JSON은 글로도 읽힙니다. agent가 "어떤 상자에 어떤 글자가 어디에 있는지"를 구조로 알 수 있어서, 그림(PNG)과 함께 주면 더 정확합니다.

## Ideas

- **메커니즘(안): plugin client module.** plugin이 브라우저용 모듈 파일(라이브러리까지 하나로 묶은 ESM)을 함께 싣습니다.
  - 서버는 그 파일을 `/assets/plugins/<KEY>/…`로 내줍니다.
  - render는 `<adoc-sketch data-…>` 같은 custom element 태그만 출력합니다.
  - 파일 쓰기는 지금처럼 **action으로만** 합니다. 그러면 "파일은 서버만 쓴다, version 검사는 한 곳"이 유지됩니다. plugin-kit에 브라우저 쪽 helper(예: `sendAction`, 현재 version 받기)를 둡니다.
- **묶기(bundle):** 라이브러리는 plugin 작성자가 배포할 때 하나의 파일로 미리 묶어 둡니다. 내부망과 오프라인에서도 동작하고, 서버에 빌드 도구가 필요 없습니다.
- **그림판 plugin(안): `SKETCH`.**
  - 문서는 `SKETCH-<id>.excalidraw`(JSON)이고, 저장할 때 브라우저가 PNG도 만들어 같은 이름으로 함께 씁니다(`SKETCH-<id>.png`).
  - 저장은 action입니다(`save`: 새 JSON과 PNG를 돌려줌).
  - **agent에게 전달:** composer로 보내는 comment의 대상이 이 문서이면, message에 PNG와 JSON 경로가 함께 실립니다. agent는 두 파일을 읽고 작업합니다.
  - **comment 연결:** 도형 id를 anchor로 써서 "이 상자" 같은 comment를 붙입니다.
  - agent도 JSON을 고쳐 그림을 바꿀 수 있습니다(예: 정리된 wireframe으로 다시 그림). 사람이 그리는 중에 바뀌면 지금처럼 "새 버전이 있음" 처리를 합니다.

## Open questions

- 그림이 바뀌었다는 chip을 일반 draft comment와 같은 것으로 볼까요? 지금 draft는 "대상 + 글"인데, 이 chip은 글이 없고 "변경 알림"입니다. 같은 메커니즘으로 하려면 draft에 "글 없이 변경만 알림" 형태를 허용해야 합니다(추천: 허용. 한 가지 chip 목록, 한 가지 보내기).

## Decisions

- 첫 사례는 그림판: 사람이 UI 같은 것을 그려서 agent에게 전달하는 기능입니다.
- **방식:** Web Component(custom element)로 합니다.
- **라이브러리:** Excalidraw(MIT).
- **문서 형태:** JSON과 PNG를 같은 이름, 다른 확장자로 둡니다(예: `SKETCH-login.excalidraw`, `SKETCH-login.png`).
  - 그런데 지금 스캔 규칙에서는 `SKETCH-login.png`가 SKETCH 문서의 확장자와 맞지 않아 "layout-mismatch" 경고가 납니다. 그래서 plugin layout에 **companion file**(같은 이름의 짝 파일) 개념을 추가해야 합니다. 예: `layout: { kind: 'file', extension: '.excalidraw', companions: ['.png'] }`. companion file은 같은 문서의 일부라서 `doc.files`와 문서 version에 포함됩니다.
- **plugin key:** `SKETCH`(agent가 골라도 된다고 하셔서 고름. "그림판"을 뜻하는 가장 흔한 영어 단어이고 wireframe 용도에도 맞음).
- **보내는 방식:** 따로 "보내기" 없이, 평소처럼 composer로 message를 보낼 때 함께 갑니다. 그림이 바뀌면 "그림이 바뀌었다"는 chip이 `_Draft_Chip_List_`에 들어가고, 보내면 그 chip이 message에 실립니다(PNG와 JSON 경로 포함). 그림 안의 영역은 구분하지 않으므로 chip은 문서마다 1개입니다.
