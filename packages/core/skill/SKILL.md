---
name: adoc
description: "Explains adoc, where a person and an agent work together on plugin-defined documents, and how its assigned agent works: claim, receive messages, edit documents, check, commit. Use when a project has an .adoc folder, when an adoc message arrives, or when setting up adoc for a project."
---

# adoc

## Overview

adoc is a place where a person and an agent work on documents together. The person uses the adoc web UI in a browser; the agent uses the `adoc` command line or its MCP tool. Both connect to the **adoc server** of the workspace and talk through the documents: the person reads the rendered documents, comments on them, edits them or presses their buttons, and each of those reaches the agent as a **message**; the agent edits the files.

- The adoc server watches the documents for changes, renders each document for the web UI through its plugin (the plugin summarizes and renders it; adoc renders nothing itself), runs the plugin's actions, holds the person's messages and delivers them to the agent.
- What a document is and how it looks comes from **plugins**: adoc itself knows no document kind.
- adoc never starts an agent. Run the agent in a herdr pane: adoc then pushes every message straight into that pane, and the web UI shows its terminal.
- A workspace is usually a git repository, so that the agent can commit every change; adoc also works without git and then warns in `adoc check`.

## Plugins and documents

- Each plugin defines one kind of document, under a **plugin key** in uppercase letters: `TODO`, `TASK`, `KANBAN`, `NOTE`, `SKETCH`, …
- A plugin has any number of documents. A document is one file or one folder under the watch paths (usually `docs/`), and its name is its **document key**: `<PLUGIN KEY>-<local id>`, such as `TASK-260930-order-paging.md` or `BUG-42/`.
- The local id uses lowercase letters, digits, `-`, `_` and `.`, in English words: today's date as yymmdd and a title (`260930-order-paging`), or a topic (`gui`). A key is never reused.
- A document inside a folder named `_archive` is archived: it keeps its key and references to it work, but lists and searches leave it out.
- `[[KEY]]` or `[[KEY#anchor]]` in Markdown content refers to another document.

## Installing plugins

A plugin is a folder:

```
<plugin>/
  index.ts          # export default definePlugin({ … }): layout, summarize, render, actions
  skill/
    SKILL.md        # the plugin's agent skill; `adoc skill install` installs this folder only
  package.json      # optional: npm packages the plugin imports, installed in this folder
  client/           # optional: browser code, index.js (+ index.css), for custom elements
```

Declare it in `.adoc/adoc.yaml` under `plugins` with its key and where it comes from:

- a bare name, looked up in `.adoc/plugins/<name>/` (project) and then `~/.config/adoc/plugins/<name>/` (user);
- a path from the workspace root, such as `./plugins/todo`;
- an npm package name.

`adoc plugin list` shows each plugin with its documents or its load error. A running server reloads a plugin when its `index.ts` changes. Then install its skill with `adoc skill install` (below). Writing a plugin is explained by the skill `adoc-plugin-authoring`.

## Configuration

`.adoc/adoc.yaml`, created by `adoc init`. A complete example:

```yaml
plugins:                    # the plugins of this workspace; the web UI shows their tabs in this order
  - key: NOTE               # plugin key: uppercase letters; documents are named NOTE-<id>
    from: note              # .adoc/plugins/note/, then ~/.config/adoc/plugins/note/
  - key: TASK
    from: ./plugins/task    # a path from the workspace root
  - key: BUG
    from: adoc-plugin-bug   # an npm package
watch:                      # folders that hold documents
  - docs
agent:
  name: dev                 # shown in the web UI
  transport:
    kind: herdr             # herdr: push into the pane of `adoc agent claim`; wait: the agent runs `adoc message wait`
server:
  host: 127.0.0.1           # 0.0.0.0 to accept the internal network (no authentication)
  port: 7700
ui:
  theme: dark               # default colours of the web UI: dark | light | system; each browser may choose another
```

Only `plugins` is needed in practice; every other key has the default shown in the table.

| key | meaning |
|---|---|
| `plugins` | list of `{ key, from }`; the web UI shows the tabs in this order |
| `watch` | folders that hold documents, default `[docs]` |
| `agent.name` | the agent's name, shown in the web UI, default `agent` |
| `agent.transport.kind` | `herdr` (default: push messages into the claimed pane) or `wait` (the agent runs `adoc message wait`) |
| `server.host`, `server.port` | where the server listens, default `127.0.0.1:7700`; `0.0.0.0` for the internal network, no authentication |
| `ui.theme` | default colours of the web UI: `dark` (default), `light` or `system` |

## Project scope and user scope

A workspace (project scope):

```
<project-dir>/
  .adoc/
    adoc.yaml           # the configuration (above)
    .gitignore          # keeps claim.yaml out of git
    claim.yaml          # the assigned agent's herdr pane, written by `adoc agent claim`; this machine only
    plugins/<name>/     # project-scope plugins, declared as `from: <name>`
  .agents/skills/       # project-scope skills, the copies written by `adoc skill install`
  .claude/skills/       # links to them for Claude Code (one folder per detected agent)
  skills-lock.json      # written by the skills CLI; committing it is your choice
  docs/                 # a watch path: the documents
    tasks/_archive/     # archived documents, in `_archive` folders at any depth
```

The user (user scope):

```
~/.config/adoc/plugins/<name>/   # user-scope plugins ($XDG_CONFIG_HOME/adoc/plugins), `from: <name>`
~/.agents/skills/<name>/         # user-scope skills: adoc, adoc-plugin-authoring, user-scope plugins
~/.claude/skills/<name>          # links to them for Claude Code (one folder per detected agent)
$XDG_RUNTIME_DIR/adoc/<id>.json  # a record of each running adoc server (pid, url, workspace)
```

- **Project scope:** inside the workspace. Plugins in `.adoc/plugins/` or at a path inside the workspace; their skills install into the workspace (`.agents/skills/`, `.claude/skills/`, …).
- **User scope:** for every workspace of this user. Plugins in `~/.config/adoc/plugins/`; their skills, and adoc's own skills `adoc` and `adoc-plugin-authoring`, install into the home (`~/.agents/skills/`, …).
- `adoc skill install` installs every skill in its scope through the Vercel `skills` CLI (`npx skills add`), for the agents it detects; `adoc skill update` refreshes them after an update. Every adoc command warns while a skill is missing or older than the running adoc.

## Using a plugin

How a plugin is meant to be used, what its files look like, what an anchor means and what to do for each of its actions is written in its skill. **Always read the skill of a plugin before you touch its documents:** `adoc skill list`, then `adoc skill view adoc-<plugin key in lowercase>`, such as `adoc skill view adoc-task`. The person sees the same text in the web UI (`SKILL.md` beside the plugin key).

## For the agent

### Setting up a new project

adoc comes with five plugins: NOTE (shared notes), TODO (task lists), TASK (work orders), KANBAN (a board) and SKETCH (drawings).

1. **Talk first.** Before any work, take time with the person to decide how this project will use them: which documents to keep, what goes where, how detailed.
2. **Agree on the way of working, and record it** in the project's `AGENTS.md` (or `CLAUDE.md`): whether every change is committed, whether you do the work yourself or hand it to a subagent or a herdr development agent, and the procedure. A sample procedure:
   - Use a **NOTE** to discuss ideas with the person or to help them understand something. Draw state and sequence diagrams with Mermaid (```` ```mermaid ````) wherever they help.
   - When a good idea comes out of a NOTE, put it on a **TODO** list and do it; when it is complex, design it enough and turn it into a **TASK** that lists the NOTE in `notes:`.
   - Start work only when the NOTEs, TODOs and TASKs are all committed.
   - The work may go to a subagent or a herdr development agent.
   - When a task is finished, set it to REVIEW and get the person's review; on their approval it becomes DONE (see the TASK skill).
3. **Change the procedure with the person as you go**, and keep `AGENTS.md` up to date.
4. **Make plugins fit the work.** A plugin is easy to write, so change one or write a new one whenever the documents should look or behave differently (skill `adoc-plugin-authoring`).

### Commands

| command | what it does |
|---|---|
| `adoc agent claim` / `adoc agent show` | make your herdr pane the assigned agent / show who is |
| `adoc message wait [--timeout 600]` | block until messages arrive, print them all, and forget them |
| `adoc message list` | show held messages without taking them |
| `adoc document list [--plugin KEY] [--archived]` | documents, newest first, without archived ones (`--archived`: only those) |
| `adoc document search <text> [--plugin KEY] [--archived]` | lines of documents that contain the text |
| `adoc check` | every warning and error of the workspace; exits 1 on errors |
| `adoc ui open <KEY>[#anchor]` / `adoc ui list` | show a document in the person's browser tab / list the tabs |
| `adoc skill list` / `adoc skill view <name>` | the agent skills / one of them |
| `adoc skill install` / `update` / `uninstall` | manage the installed skills (not through MCP) |
| `adoc plugin list` | the declared plugins |
| `adoc server run` / `adoc mcp run` / `adoc init` | run the server / serve the MCP tool / create a workspace |

Every command takes `--output text|markdown|json|yaml` and answers `--help`. Through MCP, call the tool `adoc` with the command line without `adoc`, such as `{ "cmd": "document list --plugin TASK" }`.

### Workflow of the assigned agent

#### Start: claim

- **In herdr (recommended):** run `adoc agent claim` once at the start of your session. Your pane becomes the assigned agent: the person's messages are pushed into it as prompts, and the web UI shows your terminal. Claiming from another pane takes the role over.
- **Otherwise:** with the `wait` transport, or before anyone claimed, messages wait until you take them with `adoc message wait`.

Then read the skills of the plugins you will work with (see "Using a plugin").

#### The loop

1. Receive messages: pushed into your pane (herdr), or with `adoc message wait`.
2. For each message, read the target document and do what the text asks.
3. Run `adoc check`; fix every error it reports.
4. Commit your changes with `git add` and `git commit`, naming the document keys in the message, such as `TODO-gui: detail item 3`. Commit also changes a plugin applied (`applied: true`) and the person's own edits; adoc never commits.
5. When you created or substantially changed a document the person should see, open it for them: `adoc ui open <KEY>`.
6. Go back to 1.

#### Message format

```
[adoc message 17] comment · TASK-260930-order-paging
Then split the method into two tasks.
--
comments:
  - target: TASK-260930-order-paging#method
    source: docs/tasks/TASK-260930-order-paging.md:16
    quote: infinite scroll
    text: Use page numbers instead of infinite scroll.

[adoc message 18] action · TODO-gui#3
TODO-gui#3 checked: Refactor PaymentRepo
--
action: toggle
value: "3"
applied: true
```

- The header names the main target; the text after it is what the person typed (for an action, what the plugin reports). After `--` come the attached `comments` the person collected, each with its own target; handle all of them, in order, before committing.
- A target is `workspace`, a plugin key (about the plugin, such as "create a new one"), a document key, a document key with an anchor (the plugin's skill says what an anchor means), or `skill <name>` (about an agent skill: change its `SKILL.md`, in the folder that `adoc skill list --output json` shows, then run `adoc skill update`).
- `source` is the file and line the person pointed at; `quote` is the exact text they selected. If the file changed since, find the place by the quote or the text around it.
- A comment may carry a diff that starts with `I edited <file>:`: the person already changed the file in the web UI. Read the diff, keep the change, and do what the rest of the message asks.
- An `action` message with `applied: false` is a request: make the change yourself. With `applied: true` the plugin already changed the file; follow up only if needed. The actions `archive` and `unarchive` ask you to move the document with `git mv` into an `_archive` folder next to it (`docs/tasks/_archive/TASK-x.md`), or back.

#### Rules

- Find documents with `adoc document list` and `adoc document search`, not with `ls` or `grep`: they leave archived documents out and keep your context small.
- Always read the current file before editing it: the person or a plugin action may have changed it.
- Keep uncommitted changes to documents that you did not make: they are the person's edits or plugin actions; include them in your next commit. Never commit other files you did not change, such as `.adoc/adoc.yaml`.
- When you decline a request, leave the document as it is and say why where the person will see it.
- You cannot reply in the web UI. If a request is unclear or conflicts with the document, write the question into the document as a blockquote starting with `> Question:` next to the place it concerns, and remove it once answered.
