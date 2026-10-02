---
title: 웹 UI에서 문서 직접 편집 — 편집은 바로, diff는 다음 message로
status: MOVED
---

## Background

지금 사람은 문서를 읽고 comment만 달 수 있습니다. Open question에 답을 다는 것처럼 짧은 수정도 comment로 부탁하고 agent가 고쳐야 합니다. 웹 UI에서 문서를 직접 고치고, 고친 내용은 agent가 알 수 있게 합니다.

## Decisions

- **전체 편집:** 문서의 주 파일 전체를 편집합니다. 그 대신 편집기 안에서는 렌더링된 화면(그리고 변경 보기 diff)이 보이지 않습니다.
- **편집은 바로 반영:** 저장하면 파일이 바로 바뀝니다.
- **agent에게는 comment + diff:** 편집 내용은 diff로 draft에 들어가고, 다음 message와 함께 갑니다. comment에는 발췌가 들어 있으므로, comment와 편집 내용이 겹쳐도 괜찮습니다.

## Ideas (구현 설계)

- **모든 문서에 같은 방식:** "Markdown 편집"으로 시작했지만, plugin마다 따로 만들면 메커니즘이 둘이 됩니다. 그래서 주 파일이 텍스트인 모든 문서에 같은 편집기를 둡니다(TODO, TASK, NOTE의 Markdown, KANBAN의 YAML, SKETCH의 JSON). 폴더 문서는 주 파일만 편집합니다.
- **편집기:** 문서 헤더의 `edit` 버튼을 누르면 본문 자리에 주 파일 원문이 고정폭 글자로 열립니다. 저장 버튼이나 Ctrl+S로 저장하고, 취소로 닫습니다.
- **쓰기 경로:** 웹 UI는 파일을 직접 쓰지 않고 서버에 새 원문을 보냅니다. 서버는 action과 같은 version 검사를 거쳐 씁니다. 편집하는 동안 agent가 파일을 바꿨다면 저장이 거부되고, 입력한 글은 그대로 남습니다.
- **diff draft:** 저장하면 그 문서의 편집 draft 하나가 생깁니다. 내용은 "I edited docs/…:"와 unified diff입니다. 보내기 전에 다시 편집하면 같은 draft를 바꾸며, diff는 "보내지 않은 첫 편집 직전"부터 지금까지입니다. 원래대로 되돌리면 draft가 사라집니다. SKETCH의 변경 chip과 같은 "문서마다 하나인 draft"입니다.
- **내가 한 편집은 변경 보기를 켜지 않음:** 내가 보낸 action처럼, 저장 결과 version을 "본 것"으로 처리합니다.

## Open questions

- (없음)
