---
title: plugin 출처 등록, 업데이트, hot reload — 안
status: OPEN
---

## Background

plugin은 지금 손으로 폴더를 만들거나 복사해서 `.adoc/plugins/`, `~/.config/adoc/plugins/`, 또는 경로로 둡니다. 다른 사람이 만든 plugin을 받거나 새 버전으로 바꿀 방법이 없습니다. 또 서버의 hot reload는 plugin 폴더 최상위의 `index.ts`만 다시 불러오므로, 여러 파일로 나눈 plugin은 일부만 새로 읽힙니다. 이 셋을 한 번에 정리하는 안입니다.

## What is wrong today

- plugin을 어디서 받았는지 기록이 없어서 업데이트할 수 없습니다.
- `index.ts`가 `./lib.ts`를 import하면, hot reload 때 `index.ts`만 새로 읽고 `lib.ts`는 Node의 module cache에 남은 옛 코드를 씁니다.
- plugin 폴더를 재귀로 감시하면 `node_modules`, `client/`까지 감시하게 되어 지금은 최상위만 감시합니다.

## Findings

| 도구 | 받는 곳 | 기록 | 업데이트 |
|---|---|---|---|
| VS Code 확장 | marketplace, `.vsix` | 설치 폴더의 manifest | marketplace가 새 버전 확인 |
| Obsidian community plugin | GitHub release(빌드된 `main.js`, `manifest.json`) | `.obsidian/plugins/<id>/` | release의 새 버전 확인 |
| Claude Code plugin | git 저장소 marketplace | plugin cache + 버전 | `/plugin update` |
| Vercel `skills` | GitHub, URL, 로컬 경로 | `skills-lock.json` | `skills update` |
| npm 패키지 | registry | `package-lock.json` | `npm update` |

공통점은 셋입니다. 첫째, **출처와 고정한 버전을 lock 파일 하나에 적습니다.** 둘째, **설치하는 곳은 정해진 폴더 하나입니다.** 셋째, **배포물은 빌드된 상태입니다.** 받는 쪽에서 빌드하지 않습니다.

## Ideas

**1. 설치와 출처 기록**

- `adoc plugin install <source> [--user]`
  - source 형식:
    - `github:owner/repo[/path][@ref]`
    - git URL
    - npm 패키지 이름
    - 로컬 경로
  - 받은 plugin을 plugin 디렉터리에 둡니다. 기본은 project(`.adoc/plugins/<이름>/`)이고, `--user`면 user(`~/.config/adoc/plugins/<이름>/`)입니다.
  - plugin에 `package.json`이 있으면 그 폴더에서 `npm install --omit=dev`를 실행합니다.
  - 마지막으로 그 plugin의 skill을 같은 scope에 설치합니다(`adoc skill install`과 같은 함수).
- **출처는 plugin 디렉터리마다 lock 파일 하나에 적습니다:** `.adoc/plugins/plugins-lock.json`, `~/.config/adoc/plugins/plugins-lock.json`. 이름마다 `{ source, ref, resolved }`를 적고, `resolved`는 git commit 또는 npm 버전입니다. `skills-lock.json`과 같은 방식입니다.
  - user plugin은 여러 workspace가 함께 쓰므로, 출처를 workspace 설정(`adoc.yaml`)이 아니라 plugin 디렉터리 쪽에 둡니다.
- `adoc.yaml`의 선언은 지금처럼 `- key: TODO, from: todo`입니다. `install`은 설정을 고치지 않고 붙여 넣을 줄만 보여 줍니다(`--key TODO`를 주면 직접 추가).
- `adoc plugin uninstall <이름> [--user]`는 폴더, lock 항목, skill을 함께 지웁니다.

**2. 업데이트**

- `adoc plugin update [이름…] [--user]`: lock의 출처에서 다시 받습니다. ref가 branch면 최신 commit, tag나 버전이면 그대로 둡니다(`--ref`로 바꿈). 그다음 `npm install`과 skill 갱신을 하고, `resolved`를 새로 적습니다.
- `adoc plugin list`에 출처와 `resolved`를 보여 줍니다. `--outdated`는 새 버전이 있는지 확인합니다.
- **배포 규칙:** 브라우저 코드(`client/`)가 있는 plugin은 빌드된 `client/`를 배포물에 포함해야 합니다. adoc은 받는 쪽에서 빌드하지 않습니다. npm 패키지는 이 규칙이 자연스럽고(`npm pack`이 `client/`를 넣음), GitHub 저장소라면 빌드 결과를 commit하거나 release 파일로 냅니다.

**3. hot reload (여러 파일 plugin)**

- **plugin 전체를 다시 읽기:** 이미 쓰는 Node resolve hook(`module.registerHooks`)에서, plugin을 다시 불러올 때 붙이는 `?adoc-load=N`을 plugin 폴더 안의 상대 import에도 그대로 붙입니다. 그러면 `index.ts`가 import하는 `./lib.ts`도 새 사본으로 읽혀 module graph 전체가 새로 고쳐집니다. 옛 module은 메모리에 남지만 개발 중 reload 횟수 정도라 문제되지 않습니다. 서버 구조는 바뀌지 않습니다.
- **감시 범위:** plugin 폴더를 재귀로 감시하되 `node_modules/`, `client/`, `skill/` 아래는 뺍니다. 하위 폴더마다 감시를 걸고, 제외 폴더에는 걸지 않습니다.
- **plugin 하나 = 폴더 하나** 규칙은 그대로입니다. 가이드의 "`index.ts` 하나에 담으라"는 말은 "`index.ts`가 진입점이고, 폴더 안 다른 파일을 import해도 된다"로 바꿉니다.

## Open questions

- source 형식을 위 네 가지로 할까요? 처음에는 `github:`와 npm만 지원하는 것도 방법입니다.
- 받는 쪽 버전 호환성: plugin이 필요한 adoc(plugin-kit) 버전을 `package.json`의 `peerDependencies` 또는 `"adoc": { "pluginKit": "^0.1" }`로 적고, 설치나 업데이트 때 맞지 않으면 거부할까요?
- `adoc plugin install`이 `adoc.yaml`에 선언까지 넣을지(`--key`가 있을 때만), 아니면 항상 사람이 넣게 할지.
- MCP에서 install/update를 거부할지. skill install처럼 거부하는 것이 일관됩니다(추천).

## Decisions

- (아직 없음)
