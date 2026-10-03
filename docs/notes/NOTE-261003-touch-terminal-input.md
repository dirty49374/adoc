---
title: iPad에서 터미널에 한글 입력
status: OPEN
---

## Background

iPad에서 터미널 패널(_Terminal_Panel_)에 한글을 치면 자모가 분리되어 들어갑니다(ㅎㅏㄴ). 댓글 입력창은 브라우저 기본 `textarea`라 문제가 없습니다.

## Findings

- 터미널 패널은 xterm.js입니다. xterm.js는 숨겨진 textarea로 키를 받아 조합(composition) 이벤트를 직접 처리하는데, iOS Safari의 한글 조합에서는 조합 중인 글자가 확정되지 않은 채 낱자로 흘러갑니다.
- iOS 버전마다 이벤트 순서가 달라 xterm.js 쪽을 보정하는 방법은 불안정합니다.
- 조합을 브라우저 기본 입력창에 맡기고, 완성된 문자열만 터미널로 보내면 xterm.js를 거치지 않습니다.

## Decisions

- 터치 기기(`navigator.maxTouchPoints > 0`, iPad 포함)에서는 터미널 패널 아래에 한 줄 입력창(_Terminal_Input_Line_)을 둡니다. 데스크톱에서는 보이지 않습니다.
- Enter는 입력한 글과 Enter를, Shift+Enter는 입력한 글과 새 줄(ESC CR)을 pane으로 보내고 입력창을 비웁니다. 조합 중의 Enter는 조합을 끝낼 뿐 보내지 않습니다.
- 입력창이 비어 있을 때의 Backspace, 방향키, Esc, Tab, Ctrl+C는 그대로 pane으로 보냅니다. agent의 선택지 고르기나 중단을 입력창에서 할 수 있게 하려는 것입니다.
- 터치 기기에서 터미널을 누르면 초점이 입력창으로 갑니다. xterm.js의 입력은 쓰지 않습니다.

## Open questions

- 하드웨어 키보드를 붙인 iPad에서도 입력창을 쓸지: 지금 결정은 "터치 기기면 항상"입니다.
