---
title: archive — _archive 폴더로 옮긴 문서
status: OPEN
---

## Background

끝난 TASK나 지난 NOTE가 쌓이면 list pane과 agent의 검색 결과가 길어집니다. 지우지 않고 치워 두는 archive가 필요합니다. 사람이 제안한 방식은 "`_archive` 폴더 아래에 넣으면 archive"입니다.

## Findings

- **plugin과 상관없는 메커니즘 하나:** 상태값(`status: ARCHIVED`)으로 하면 plugin마다 따로 만들어야 하고, TODO처럼 상태가 없는 plugin은 할 수 없습니다. 폴더로 하면 모든 plugin에 같은 방식이 됩니다.
- **참조가 깨지지 않음:** 파일 이름이 그대로라 document key도 그대로입니다. `[[KEY]]` 참조는 계속 연결됩니다.
- **업계 사례:** Backlog.md(git 기반 task 도구)는 `backlog/archive/` 폴더로 같은 일을 합니다. 밑줄로 시작하는 폴더를 특수 폴더로 쓰는 것은 Jekyll(`_drafts`, `_posts`) 등에서 익숙한 관례입니다.
- **지금 CLI에는 문서 목록이나 검색 명령이 없습니다.** agent는 `ls`, `grep`으로 파일을 직접 찾으므로, `_archive` 안의 문서도 검색 결과에 섞여 context를 낭비합니다.

## Ideas

- **위치:** watch path 안 어디든 `_archive`라는 이름의 폴더에 있으면 archive로 봅니다. 예: `docs/tasks/_archive/TASK-x.md`. 원래 폴더 구조가 유지되어 어디서 왔는지 알 수 있습니다.
- **누가 옮기나:** list pane이나 문서 화면의 archive 요청은 agent에게 message로 가고, agent가 `git mv`로 옮깁니다("파일은 agent가 고친다", 지금의 기본 action handler와 같은 방식). agent가 쓰기 편하게 `adoc archive <KEY>`(그리고 되돌리는 `adoc unarchive <KEY>`) 명령을 둘 수 있습니다.
- **표시:** archive된 문서는 참조 tooltip과 문서 헤더에 "archived"로 표시하고, plugin tab 옆 문서 수에서는 뺍니다.
- **같은 key가 양쪽에 있으면:** 지금처럼 duplicate key 경고를 냅니다.
- **CLI 검색(안):** `adoc document list [--plugin KEY] [--archived]`와 `adoc document search <text> [--archived]`. 기본은 archive를 빼고, `--archived`를 주면 archive만(또는 포함해서) 봅니다. agent skill(`adoc` guide)은 문서를 찾을 때 `ls`/`grep` 대신 이 명령을 쓰라고 안내합니다.

## Open questions

- (없음. 남은 질문은 사람의 위임으로 agent가 추천안대로 정해 Decisions에 적음)

## Decisions

- **방식:** watch path 안의 `_archive` 폴더 아래에 있는 문서가 archive입니다.
- **UI:** list pane(`_Document_List_Pane_`)에 archive를 보는 버튼을 둡니다. 누르면 archive 목록만 따로 보입니다.
- **CLI:** archive는 옵션으로만 검색되게 합니다(기본은 제외). agent의 context를 낭비하지 않기 위해서입니다.
- **`--archived`는 "archive만":** UI의 archive 버튼과 같은 뜻입니다. 전부 보려면 두 번 실행합니다. (agent가 추천안으로 정함)
- **CLI 명령:** `adoc document list`와 `adoc document search <text>`를 둘 다 만듭니다. agent guide는 문서를 찾을 때 `ls`/`grep` 대신 이 명령을 쓰라고 안내합니다. (agent가 추천안으로 정함)
- **archive 요청 버튼:** 문서 헤더(`_Document_Header_`)에 둡니다. 버튼은 기존 action 메커니즘으로 `archive`/`unarchive`를 보내고, plugin이 처리하지 않으면 기본 action handler가 agent에게 요청 message로 전달합니다. 새 전달 경로를 만들지 않습니다. (agent가 추천안으로 정함)
- **같은 key가 양쪽에 있으면:** archive가 아닌 쪽을 쓰고 duplicate key 경고를 냅니다.

