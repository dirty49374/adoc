---
title: npm scope를 @garage49로 (@agent-workshop은 deprecate)
status: OPEN
---

## Background

사용자가 2026-10-07에 결정했습니다. garage49 조직의 모든 npm 패키지는 `@garage49` scope를 씁니다. adoc의 `@agent-workshop/*` 9개도 다음 릴리스에서 `@garage49/*`로 이름을 바꾸고, npmjs의 옛 이름에는 새 이름을 가리키는 deprecate 안내를 붙입니다(sdfj_kr, hc #632, garage49/.github RULES.md). 저장소는 이미 `github.com/garage49/adoc`로 옮겼습니다.

## Findings

이름을 바꾸면 깨지는 곳(hc #629에서 정리):

| 어디 | 무엇 | 바꾸지 않으면 |
|---|---|---|
| 사용자 workspace의 `.adoc/adoc.yaml` | `adoc init`이 쓴 `npm:@agent-workshop/adoc-plugin-todo` 등 | 옛 이름만 계속 찾음 |
| 외부 plugin | `import … from '@agent-workshop/adoc-plugin-kit'`, `peerDependencies` | 실행 중인 adoc의 kit를 찾지 못함 |
| 설치 안내 | README, CONTRIBUTING, skill, samples의 `npm i -g @agent-workshop/adoc` | 옛 패키지를 설치 |
| 코드 | core, cli, webapp build, plugin 5개, 테스트, lockfile | 빌드 안 됨 |

## Decisions

- 9개 패키지 이름을 `@garage49/adoc`, `@garage49/adoc-core`, `@garage49/adoc-webapp`, `@garage49/adoc-plugin-kit`, `@garage49/adoc-plugin-<name>`으로 바꿉니다(뒷부분은 그대로). 비공개 `-testing`도 `@garage49/adoc-testing`.
- 한 번의 전환 기간 동안 adoc은 옛 이름도 받습니다.
  - `adoc.yaml`의 `npm:@agent-workshop/<name>`은 `npm:@garage49/<name>`으로 읽고, `adoc check`가 고치라는 경고(`renamed-package`)를 냅니다.
  - plugin이 import하는 `@agent-workshop/adoc-plugin-kit`도 실행 중인 kit로 연결하고, `peerDependencies`는 두 이름 중 있는 쪽을 봅니다.
- 옛 이름 지원은 나중에 따로 지웁니다(시점은 미정).
