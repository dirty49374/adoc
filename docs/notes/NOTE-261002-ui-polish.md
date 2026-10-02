---
title: web UI 예쁘게 다듬기
status: OPEN
---

## Background

web UI는 동작하지만 아직 프로토타입처럼 보입니다. 이 노트는 지금 화면에서 어색한 점(NOTE, 홈, KANBAN 화면을 1440×900으로 찍어 진단)과 다듬는 방향을 정리합니다. 방향을 합의한 뒤 aterm으로 설계하고 TASK로 넘어갑니다.

## What is wrong today

- **터미널 글꼴:** 터미널의 한글이 글자 사이가 벌어져 보이고, 셸 프롬프트의 Powerline 기호가 네모로 나옵니다. 터미널 글꼴에 한글(CJK)과 Nerd Font 글리프가 없어서입니다.
- **두 세계:** 밝은 문서 영역과 검은 터미널이 서로 다른 색 체계를 씁니다. 오른쪽 패널에는 헤더가 두 개 겹쳐 있습니다("Agent terminal adoc-dev via herdr"와 터미널 헤더).
- **가운데가 좁음:** 목록(300px), 문서, 터미널 세 칸 때문에 문서 폭이 좁고, KANBAN 보드는 그 안에서 옆으로 스크롤됩니다.
- **위계가 약함:** plugin 탭은 숫자가 붙은 일반 글자일 뿐이고, 문서 헤더에서는 key, 제목, 상태, 경로가 서로 경쟁합니다. 배지, 버튼, chip도 저마다 스타일이 다릅니다.
- **무거운 입력창:** 쓰지 않을 때도 세 줄짜리 입력 상자와 큰 Send 버튼이 자리를 차지합니다.
- **타이포그래피:** 모든 곳에 시스템 글꼴을 쓰고, 한글용 글꼴을 따로 정하지 않았습니다. 문서 본문의 한 줄 길이에도 제한이 없습니다.

## Findings: opencode 스타일

사용자가 마음에 들어 하는 것은 opencode의 **TUI 테마**("opencode")입니다. opencode의 웹·데스크톱 앱은 기본 테마(oc-2)가 달라서 테두리가 있는 일반적인 스타일입니다. 출처는 `sst/opencode` dev 브랜치의 `packages/tui/src/theme/assets/opencode.json`이고, 이 컴퓨터에서 실행 중인 opencode 화면도 직접 읽어 같은 색을 확인했습니다.

| 토큰 | 다크 | 라이트 | 쓰임 |
|---|---|---|---|
| background | #0a0a0a | #ffffff | 전체 바탕 |
| backgroundPanel | #141414 | #fafafa | 블록(메시지, 도구 출력) |
| backgroundElement | #1e1e1e | #f5f5f5 | 입력창, hover |
| text / textMuted | #eeeeee / #808080 | #1a1a1a / #8a8a8a | 본문 / 메타 정보 |
| primary | #fab283 | #3b7dd8 | 선택 강조 |
| secondary / accent | #5c9cf5 / #9d7cd8 | #7b5bb6 / #d68c27 | agent 색, 제목 |
| success / warning / error / info | #7fd88f / #f5a742 / #e06c75 / #56b6c2 | #3d9a57 / #d68c27 / #d1383d / #318795 | 상태 |
| diff 추가 / 삭제 (글자, 배경) | #4fd6be, #20303b / #c53b53, #37222c | #1e725c, #d5e5d5 / #c53b53, #f7d8db | 변경 보기 |

Markdown과 코드 강조 색(같은 파일):

| 요소 | 다크 | 라이트 |
|---|---|---|
| 본문 | #eeeeee | #1a1a1a |
| 제목(heading) | #9d7cd8 | #d68c27 |
| 링크 / 링크 글자 | #fab283 / #56b6c2 | #3b7dd8 / #318795 |
| 인라인 코드 | #7fd88f | #3d9a57 |
| 인용, 기울임 | #e5c07b | #b0851f |
| 굵게 | #f5a742 | #d68c27 |
| 목록 기호 / 번호 | #fab283 / #56b6c2 | #3b7dd8 / #318795 |
| 가로줄 | #808080 | #8a8a8a |
| 코드: 주석 / 키워드 / 함수 | #808080 / #9d7cd8 / #fab283 | #8a8a8a / #d68c27 / #3b7dd8 |
| 코드: 변수 / 문자열 / 숫자 | #e06c75 / #7fd88f / #f5a742 | #d1383d / #3d9a57 / #d68c27 |
| 코드: 타입 / 연산자 | #e5c07b / #56b6c2 | #b0851f / #318795 |

규칙:

- **바탕 세 단계:** background → panel(블록) → element(입력창과 hover) 순서로 밝기만 바꿔 영역을 구분합니다. 테두리는 거의 쓰지 않습니다.
- **왼쪽 막대(`┃`):** 블록 왼쪽 가장자리에 굵은 막대를 둡니다. 사용자 메시지는 agent 색, 오류는 error 색, 입력창은 테두리색에 agent 색을 섞은 색입니다. 도구 출력 블록은 막대를 바탕색으로 그려 여백으로만 씁니다.
- **assistant 메시지:** 막대도 바탕도 없는 평문입니다. 끝에 `▣ agent · model` 한 줄을 흐리게 붙입니다.
- **목록과 대화상자의 선택:** 줄 전체를 primary로 채우고, 글자는 굵게 바탕색으로 씁니다.
- **글꼴:** TUI라 터미널 글꼴을 씁니다. 웹 앱은 시스템 UI 글꼴, 고정폭은 `ui-monospace`, 크기 13/14/16/20px입니다.

## Ideas

- **opencode 스타일을 adoc에:** 위 토큰을 그대로 쓰고, 영역은 바탕색 단계로만 나눕니다. 강조가 필요한 곳에는 왼쪽 막대(웹에서는 3px 정도의 굵은 선)를 붙입니다.
  - 목록의 선택된 문서: element 바탕 + primary 막대
  - 문서 본문: background 위에 평문. hover하거나 comment가 달린 anchor는 panel 바탕 + 막대
  - 전송 대기 message와 draft: panel 블록 + 종류별 색 막대(comment는 secondary, action은 warning)
  - 입력창: element 바탕 + agent 색 막대
  - 경고와 오류: panel 블록 + warning/error 막대
- **터미널과 하나로:** 터미널 테마의 배경과 글자색도 같은 토큰을 씁니다. herdr 화면이 opencode 같은 TUI라면 자연스럽게 이어집니다.
- **용어:** 업계 표준어로 바탕 단계는 **surface**(background, panel, element), 왼쪽 막대는 **accent bar**라고 부르겠습니다. spec과 CSS에서 이 이름 하나로 씁니다.
- **글꼴:**
  - 화면과 문서는 Pretendard를 씁니다. 한글과 영문이 모두 좋습니다.
  - 터미널과 코드는 한글과 Nerd Font 글리프를 갖춘 고정폭 글꼴을 씁니다. 예를 들어 D2Coding Nerd나 Sarasa Mono K이고, 없으면 JetBrains Mono로 대체합니다.
  - 내부망에서도 오프라인으로 동작하도록 web UI에 글꼴 파일을 함께 넣습니다.
- **배치:**
  - 문서를 열면 목록 칸이 좁은 레일로 접힙니다. 마우스를 올리거나 클릭하면 펼쳐집니다.
  - 문서는 읽기 좋은 폭(약 72자)으로 가운데에 놓습니다.
  - KANBAN 열은 화면 폭을 채우고, 넘치면 옆으로 스크롤하지 않고 줄바꿈합니다.
- **오른쪽 패널:**
  - 헤더 하나에 agent, pane, 상태, 제어 상태를 함께 담습니다. 나머지 공간은 터미널이 채웁니다.
  - 입력창은 한 줄로 시작해 입력하면 늘어납니다. 위에는 draft chip이 붙고, 보내기는 작은 아이콘으로 합니다.
- **plugin 탭:** 평문 탭으로 두고, 선택된 탭만 element 바탕과 아래쪽 primary 막대로 표시합니다. 숫자는 textMuted로 조용하게 씁니다.
- **문서 헤더:**
  - key는 작은 고정폭 글씨로 쓰고, 제목은 크게 씁니다.
  - 상태는 색 글씨(상태별 토큰)로 표시합니다. 둥근 배지는 쓰지 않습니다.
  - 경로와 변경 보기 버튼은 조용한 meta 줄에 둡니다.
- **컴포넌트:** 버튼과 chip(허용)도 테두리 없이 element 바탕으로만 그립니다. hover하면 한 단계 밝게, focus는 accent bar로 표시합니다. 모서리는 둥글리지 않고 모두 직각으로 그리며, 애니메이션은 짧게만 씁니다.

## Open questions

- (없음. 아래 Decisions로 옮김)

## Decisions

- 큰 틀은 opencode TUI의 "opencode" 테마를 따릅니다: surface(바탕색 단계)로 영역을 나누고, 강조는 왼쪽 accent bar로 하며, 테두리는 최소로 씁니다.
- 다만 TUI를 100% 따라 하면 웹의 장점을 잃으므로, 다음은 웹답게 허용합니다.
  - vector icon(SVG)
  - 본문보다 작은 글자(메타 정보, 캡션 등)
  - chip
- **글자 크기:** 가장 큰 글씨가 기본 본문 크기입니다(opencode처럼). 제목도 크기를 키우지 않고 색(heading 색)과 굵기로 구분합니다. 본문보다 작은 글씨는 허용합니다.
- **색:** opencode의 색 체계를 그대로 가져옵니다. surface와 상태 색뿐 아니라 Markdown 색과 코드 강조 색까지 위 표의 값을 씁니다.
- plugin이 같은 모양을 쉽게 쓰도록, 디자인 토큰(CSS 변수)과 공통 class를 plugin용 CSS로 제공하고 plugin 작성 가이드에 설명합니다.
- **테마:** 기본은 시스템 설정(라이트/다크)을 따르고, 상단 바의 전환 버튼으로 시스템 → 라이트 → 다크를 고릅니다. 고른 값은 브라우저마다 기억합니다.
- **글꼴:** web UI에 글꼴 파일을 함께 넣어 오프라인에서도 같게 보이게 합니다.
  - 화면과 문서: Pretendard(OFL)
  - 터미널과 코드: D2Coding(OFL, 한글 고정폭) + Symbols Nerd Font Mono(MIT, Powerline 등 기호)
- **아이콘:** Lucide(MIT)를 씁니다. 필요한 아이콘만 번들에 들어갑니다.
- **용어:** 디자인 토큰은 CSS 변수 `--adoc-*`로 씁니다. 바탕 단계는 surface(`--adoc-surface`, `--adoc-surface-panel`, `--adoc-surface-element`), 왼쪽 막대는 accent bar입니다. 지금까지 badge와 chip을 섞어 썼는데 chip 하나로 통일합니다(`adoc-badge` → `adoc-chip`).
- **모서리:** 둥근 모서리를 쓰지 않습니다(opencode TUI처럼 모두 직각). 2px만 둥글려도 왼쪽 accent bar가 모서리를 따라 휘어 보였기 때문입니다. 원형인 연결 상태 점은 테두리가 아니라 기호라서 그대로 둡니다.
- **입력창 위치:** 입력창(Comment_Composer)과 draft chip은 오른쪽 패널에서 빼서 main area(가운데 내용 영역) 아래에 둡니다. 터미널과 붙어 있으면 어디에 입력하는지 헷갈리기 때문입니다. 입력창은 세 줄 높이로 시작해 입력하면 늘어납니다.
- **용어:** 가운데 내용 영역은 spec에서 이미 쓰던 **main area**로 부릅니다(HTML `<main>`, ARIA main landmark).
- **입력창 폭과 접기:** 입력창은 문서 본문과 같은 폭(읽기 폭 860px)으로 가운데에 둡니다. 접으면 draft 수만 보이는 한 줄이 되고, 그 줄을 누르면 다시 펼쳐집니다. 접은 상태는 브라우저마다 기억합니다. 접힌 목록 레일은 폭을 차지하지 않고 본문 왼쪽 여백 위에 겹쳐서, 본문과 입력창이 같은 위치에 정렬됩니다.
