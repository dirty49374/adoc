---
title: iPad와 폰에서의 web UI (한글 입력, 입력창 배치, 목록, 고정 화면)
status: OPEN
---

## Background

iPad에서 터미널 패널(_Terminal_Panel_)에 한글을 치면 자모가 분리되어 들어갑니다(ㅎㅏㄴ). 댓글 입력창은 브라우저 기본 `textarea`라 문제가 없습니다.

## Findings

- 터미널 패널은 xterm.js입니다. xterm.js는 숨겨진 textarea로 키를 받아 조합(composition) 이벤트를 직접 처리하는데, iOS Safari의 한글 조합에서는 조합 중인 글자가 확정되지 않은 채 낱자로 흘러갑니다.
- 처음에는 터미널 아래에 한 줄 입력창을 두는 안을 만들었으나(6574ff5), 사용자 의견에 따라 되돌렸습니다.

## Decisions

- iPad류(터치 기기, `navigator.maxTouchPoints > 0`)에서는 한글을 메시지 입력창(_Comment_Composer_)으로 칩니다. 터미널에 직접 치는 한글은 고치지 않습니다.
- 일반 PC: _Comment_Composer_는 지금처럼 본문 아래쪽 위에 떠 있습니다.
- iPad류: _Comment_Composer_는 화면 아래에 가로를 다 차지하는 띠로, 위쪽 탭 영역(top bar)과 대칭되는 자리에 둡니다. 본문 위에 겹치지 않고(overlay 없음), 접히지 않습니다.
- iPad류: 목록 pane(_Document_List_Pane_)에서 문서를 고르면 목록을 바로 접습니다. iOS는 탭한 뒤에도 hover가 남아 목록이 열린 채로 있었습니다. rail을 탭하면 다시 열립니다(hover에 기대지 않고 명시적으로 열고 닫음).
- iPad·폰: 고정된 app처럼 씁니다. 페이지 자체는 스크롤되지 않고, 어떤 영역도 끝에서 튕기지 않으며(rubber-banding 없음), 두 번 탭해도 확대되지 않습니다. 높이는 브라우저 막대가 들어가고 나와도 보이는 창에 맞춥니다(`100dvh`).
