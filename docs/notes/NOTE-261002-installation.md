---
title: 설치 방법 — 프로그램이 먼저인가, skill이 먼저인가
status: OPEN
---

## Background

adoc을 다른 프로젝트나 다른 사람이 쓰려면 설치 방법이 필요합니다. 지금은 이 저장소를 받아 `pnpm install && pnpm build` 후 `bin/`을 PATH에 넣고, 워크스페이스마다 `adoc skill install`을 실행합니다. adoc에는 프로그램(CLI, MCP, server)과 agent용 skill(SKILL.md)이 둘 다 필요하므로, 어느 것을 먼저 설치하게 할지, skill을 어디에 어떻게 둘지 정해야 합니다. 주요 프로젝트들이 요즘 어떻게 하는지 조사했습니다(2026-10 기준).

## What is wrong today

- 설치 경로가 "저장소 받아서 빌드"뿐입니다. 패키지(npm 등)로 받는 방법이 없습니다.
- `adoc skill install`은 skill **본문 전체를 복사**해서 `.claude/skills/`에 씁니다. 프로그램을 업데이트해도 복사된 본문은 그대로라 둘이 어긋날 수 있습니다(업계 용어로 **version skew**).
- Claude Code용 위치(`.claude/skills`)에만 씁니다. Codex 등 다른 agent는 지원하지 않습니다.

## Findings: 주요 프로젝트

| 프로젝트 | 설치 순서 | skill 위치 | 프로그램과 skill 버전 맞추기 | 여러 agent |
|---|---|---|---|---|
| Claude Code plugin | `/plugin marketplace add` → `/plugin install` | plugin cache | plugin 버전 하나로 묶음. `bin/`, `.mcp.json`으로 프로그램도 함께 실을 수 있음 | Claude만 |
| Claude Code `command` source | 프로그램 설치 → marketplace 항목이 `my-tool claude-plugin-path` 실행 → 설치 | plugin cache(프로그램이 알려 준 폴더를 복사) | 설치·업데이트·세션마다 다시 실행 → 항상 일치 | Claude만 |
| Codex | `$skill-installer` 또는 `codex plugin add` | `.agents/skills`, `~/.agents/skills` | plugin 버전 | 공용 `.agents/skills` |
| Vercel `npx skills` | `npx skills add owner/repo` | 실물은 `.agents/skills`, 각 agent 폴더에는 symlink | skill만 고정(lock 파일), 프로그램과는 별개 | 75개 이상 |
| GitHub `gh skill` (2026-04) | `gh skill install o/r skill --agent X --scope project\|user` | project scope는 `.agents/skills`, Claude는 따로 | tag/SHA 고정 | 여러 agent |
| spec-kit | `uv tool install specify-cli` → `specify init --integration claude\|codex` | `.claude/skills`, `.agents/skills` 등 | `specify integration upgrade`가 다시 씀(로컬 수정은 거부) | 여러 integration 동시 |
| beads | `brew`/`npm -g`/`curl\|sh` → `bd init` → `bd setup claude\|codex` | skill 파일 없음. 세션 시작 hook이 `bd prime`을 실행해 프로그램이 지침을 출력 | 항상 일치(프로그램이 만든 글) | agent마다 `bd setup` |
| Playwright CLI | `npm i -g @playwright/cli` → `playwright-cli install --skills` | `.claude/skills` 또는 `.agents/skills` | 설치한 CLI에서 복사(업그레이드 시 자동 갱신은 미확인) | 두 배치 |
| Context7 | `npx ctx7 setup --claude\|--codex` 또는 plugin | agent별 | 원격 MCP라 로컬 버전 문제 없음 | agent마다 setup |
| Superpowers | plugin 설치만 | plugin cache | 프로그램 없음 | agent별 plugin |
| Task Master | `npm i -g task-master-ai` → `task-master init --rules claude,codex` | agent별 rule 파일 | 설치한 버전에서 생성 | 13개 profile |

출처: code.claude.com/docs(plugins-reference, plugins/loading, marketplace-reference, skills), agentskills.io, github.com/vercel-labs/skills, cli.github.com/manual/gh_skill_install, github.com/github/spec-kit, github.com/steveyegge/beads, playwright.dev/agent-cli/skills, context7.com/docs, github.com/obra/superpowers, github.com/eyaltoledano/claude-task-master. Codex plugin 버전 처리, Playwright 자동 갱신, Context7 skill 경로는 확인하지 못했습니다.

**흐름 요약:**

- **실제 프로그램이 있는 도구는 "프로그램 먼저"가 대세입니다.** `brew`/`npm -g`/`uv tool`/`curl | sh`로 프로그램을 설치하고, `tool init`·`tool setup <agent>`·`tool install --skills`가 agent 파일을 씁니다. "plugin 먼저"는 프로그램이 없는 지침 묶음(Superpowers)이나 원격 MCP(Context7 plugin)에서 주로 씁니다.
- **가장 큰 위험은 version skew이고, 잘 만든 도구는 이것을 구조적으로 없앱니다.** beads는 프로그램이 실행 시점에 지침을 출력하고, Claude Code `command` source는 설치된 프로그램이 자기 plugin 폴더를 알려 주며 세션마다 다시 확인합니다. 본문을 한 번 복사해 두는 방식(Playwright, `npx skills`)은 다시 설치하지 않으면 어긋납니다.
- **공용 위치가 생기고 있습니다:** project scope는 `.agents/skills`, user scope는 `~/.agents/skills`. Codex, Copilot, Cursor, Gemini, OpenCode, Amp가 읽고, `npx skills`, `gh skill`, spec-kit, Playwright가 씁니다.
- **Claude Code는 아직 `.agents/skills`를 읽지 않습니다**(요청 issue #31005가 열려 있음). 그래서 여러 agent를 지원하는 도구는 `.claude/skills`에도 따로 씁니다(복사 또는 symlink).
- **여러 agent 지원은 어디서나 같은 방식입니다:** 원본은 하나이고, 설치 명령이 agent마다 경로만 바꿔 씁니다(`--agent`, `--integration`, `bd setup <agent>`).
- **scope:** 저장소에 묶인 작업 도구는 project scope(저장소에 commit)가 기본이고, 범용 도구는 `-g`/`--scope user`를 둡니다.
- **오프라인·내부망에는 "프로그램 먼저"가 유리합니다.** 패키지 하나만 받으면 되고 marketplace 접속이 필요 없습니다.
- **발견성(discoverability)은 plugin이 유리합니다.** 그래서 beads와 Context7은 둘 다 제공합니다: 프로그램 설치 + `setup` 명령, 그리고 선택으로 marketplace 항목.

## Ideas

- **프로그램 먼저:** `npm i -g` 한 번으로 `adoc` 명령이 생기게 합니다(npm 공개 또는 내부 registry, 아니면 tarball). Node 24가 전제입니다.
- **skill은 pointer로:** 설치되는 SKILL.md에는 name, description과 "`adoc skill view <name>`을 실행해 전체를 읽어라"만 둡니다. 본문은 항상 설치된 프로그램이 내주므로 version skew가 없습니다. beads(프로그램이 지침을 출력)와 Claude Code `command` source(프로그램이 skill 폴더를 알려 줌)와 같은 생각입니다. description은 agent가 skill을 고르는 기준이라 pointer에도 그대로 넣습니다.
  - plugin별 skill(`adoc-todo` 등)은 워크스페이스의 plugin 목록에 따라 달라지므로, plugin을 추가·삭제하면 `adoc skill update`가 pointer 목록만 다시 맞춥니다.
- **여러 agent:** `adoc skill install --agent claude,codex`. 원본 위치는 `.agents/skills`이고, Claude용 `.claude/skills`에는 같은 pointer를 씁니다(symlink 또는 복사 중 하나로 통일).
- **scope:** adoc은 워크스페이스(저장소)에 묶인 도구이므로 project scope가 기본입니다. pointer는 짧고 버전에 묶이지 않으니 저장소에 commit해도 됩니다.
- **나중에:** 발견성이 필요해지면 Claude Code marketplace 항목을 `command` source(`adoc claude-plugin-path` 같은 명령)로 추가합니다. 원본은 여전히 프로그램 하나입니다.
- **설치 흐름(안):** `npm i -g adoc` → 저장소에서 `adoc init` (`.adoc/adoc.yaml`, `docs/`, skill pointer까지 한 번에) → agent pane에서 `adoc agent claim` → `adoc server run`.

## Open questions

- 배포 경로: npm 공개 패키지로 낼까요, 내부 registry나 git 저장소에서 받게 할까요? 내부망 사용을 고려하면 tarball(`npm i -g ./adoc-x.y.z.tgz`)도 필요할까요?
- skill을 pointer로 바꾸는 데 동의하나요? (agent가 매번 `adoc skill view`를 한 번 더 실행해야 하는 비용이 있습니다.)
- 지금 Codex도 지원할까요, Claude만 먼저 할까요?
- `adoc init`이 skill pointer까지 설치하게 할까요, `adoc skill install`을 따로 실행하게 둘까요?
- plugin(TODO 등)은 지금처럼 워크스페이스의 `./plugins/`에 두나요, adoc 패키지에 기본 plugin으로 넣을까요?

## Decisions

- (아직 없음)
