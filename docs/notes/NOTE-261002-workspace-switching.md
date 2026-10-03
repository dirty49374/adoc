---
title: 한 브라우저로 이 계정의 모든 adoc 오가기
status: MOVED
moved_to: NOTE-261002-ranch-adoc-hub
---

## Background

한 사람이 여러 프로젝트에서 adoc을 동시에 띄우는 일이 많아질 것입니다(프로젝트마다 서버 하나, agent 하나). 지금은 프로젝트마다 다른 주소(포트)의 탭을 따로 열어야 하고, 어느 agent가 일하는 중인지 한눈에 볼 수 없습니다. 이 계정에서 떠 있는 모든 adoc을 **한 브라우저 화면**에서 오가며 처리하게 합니다.

## Decisions (사람이 정한 방향)

- 브라우저의 select box에 이 계정에서 떠 있는 adoc 목록이 나오고, 하나를 고르면 전환용 tab(또는 버튼)이 생깁니다. 한 브라우저 안에서 그 tab들을 오가며 일합니다.
- adoc은 user scope 파일에 떠 있는 서버 목록을 저장합니다. 서버끼리 HTTP와 WebSocket을 중계(routing)합니다.
- 다른 workspace agent의 상태는 herdr에서 가져와 동그라미로 표시합니다(working, done 등).
- agent가 `adoc ui open`으로 화면을 옮기면, 브라우저가 자동으로 그 서버의 tab으로 넘어갑니다.
- tab을 옮길 때 저장하지 않은 입력은 브라우저 local storage에 남고, 다시 그 tab으로 오면 이전 화면과 입력이 그대로 복구됩니다.

## Findings

- **목록 파일은 이미 있습니다:** 서버는 시작할 때 `$XDG_RUNTIME_DIR/adoc/<hash>.json`에 자기 기록(`_Server_Record_`: pid, url, workspace)을 쓰고, 끝날 때 지웁니다. 지금 이 컴퓨터에는 7700(이 저장소)과 7701(데모) 두 개가 있습니다. 새 목록 파일을 만들지 않고 이 기록들을 그대로 "떠 있는 adoc 목록"으로 쓰면 됩니다. 죽은 pid의 기록은 목록에서 뺍니다.
- **브라우저 저장소는 origin마다 따로입니다:** 서버마다 포트가 다르므로, 각 서버에 직접 접속하면 local storage도 따로 쓰게 됩니다. 브라우저가 서버 **하나**(처음 연 서버)에만 접속하고 그 서버가 나머지로 중계하면, 한 origin 안에서 모든 workspace의 저장소를 함께 쓸 수 있습니다. 대신 지금 저장소 key(`adoc.drafts`, `adoc.composer`, 마지막으로 본 version 등)를 workspace별로 나눠야 합니다.
- **draft와 입력 중인 글은 이미 local storage에 있습니다:** draft chip, composer 글, 열려 있던 comment 입력, 마지막으로 본 version이 이미 남습니다. workspace별로 key를 나누기만 하면 "돌아오면 복구"가 거의 그대로 됩니다. 남는 것은 편집기(`_Document_Editor_`)에서 저장하지 않은 글과 마지막 화면 위치(route)입니다.
- **agent 상태는 서버가 이미 압니다:** 각 서버는 claim한 pane의 상태를 herdr 이벤트로 받고 있습니다(지금 dock 헤더에 보이는 working/idle 등). 중계하는 서버는 다른 서버의 `/api/workspace`에서 이 값을 받아 동그라미로 보여 주면 됩니다.

## Ideas

- **workspace tab bar:** 상단 바 맨 앞(지금 `adoc <이름>`이 있는 자리)에 이렇게 둡니다.
  - 열어 둔 workspace마다 tab 하나, 그리고 그 workspace agent의 상태 동그라미.
  - 끝에 select box(또는 `+`)가 있고, 여기서 떠 있지만 아직 열지 않은 workspace를 고르면 tab이 생깁니다.
  - 열어 둔 tab 목록은 브라우저가 기억합니다.
- **중계 주소:** 브라우저가 연 서버(입구 서버)가 `/w/<id>/…` 아래를 그 workspace 서버로 넘깁니다. `/w/<id>/api/…`, `/w/<id>/api/events`(WebSocket), `/w/<id>/assets/plugins/…`이 대상입니다. 입구 서버 자신의 workspace는 지금처럼 `/`입니다. id는 기록 파일 이름(workspace 경로의 hash)을 씁니다.
  - 웹 UI는 API 주소 앞에 현재 workspace의 접두어를 붙이기만 하면 됩니다. route도 `/w/<id>/p/TASK/…` 꼴이 됩니다.
- **안전:** 입구 서버는 이 계정의 기록 파일에 있는 서버로만 중계합니다. 임의 주소로는 넘기지 않습니다.
- **상태 동그라미:** working(작업 중, 밝은 색), idle/done(대기, 흐린 색), no agent(빈 동그라미), pane gone(error 색)으로 표시합니다. 색은 테마 토큰을 씁니다. 입구 서버가 각 서버의 상태를 모아 WebSocket으로 알립니다.
- **agent가 화면을 옮길 때:** 다른 workspace 서버의 `adoc ui open`은 그 서버에 붙어 있는 browser session으로 갑니다(중계된 WebSocket도 그 서버의 session입니다). 브라우저는 그 message를 받으면 해당 workspace tab으로 바꾼 뒤 그 문서를 엽니다. 어느 브라우저로 갈지는 지금처럼 "가장 최근에 쓴 session"입니다.
- **복구:** local storage key를 `adoc.<workspace id>.<이름>`으로 나눕니다. tab을 떠날 때 현재 route와 편집기의 저장하지 않은 글도 저장하고, 돌아오면 그 route로 가서 복구합니다.

## Open questions

- 입구 서버는 어떤 서버여야 할까요? 지금 안은 "브라우저가 처음 연 서버"이므로 어느 서버든 입구가 될 수 있습니다. 입구 서버가 꺼지면 그 브라우저 탭은 끊깁니다.
- "계정"은 이 컴퓨터의 같은 OS 사용자로 볼까요? (원격 컴퓨터의 adoc까지는 넣지 않는 안)
- 터미널(`_Terminal_Panel_`)도 다른 workspace tab에서 그대로 보여 줄까요? 중계 WebSocket으로 가능하지만, tab을 바꿀 때마다 터미널 제어권이 옮겨 다니게 됩니다.
- 이 기능을 켜고 끄는 설정이 필요할까요, 아니면 서버가 둘 이상 떠 있으면 항상 보일까요?
