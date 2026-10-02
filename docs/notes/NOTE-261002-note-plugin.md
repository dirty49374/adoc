---
title: NOTE plugin and browser control
status: OPEN
---

## Background

Design conversations between the person and the agent happen in the terminal and scroll away; only final decisions reach the spec. A NOTE holds the idea while it is still forming, so it can be refined with comments in the web UI and later turned into a TASK, a proposal or an archived record.

## Ideas

- The agent summarizes a conversation into a NOTE, then shows it with `adoc ui open NOTE-…`.
- The person refines it with anchored comments, collected as drafts and sent together.
- Developing a note means moving items from **Open questions** to **Decisions**.
- Converting is the agent's work: the `→ TASK` and `→ archive` buttons only send requests, because plugins never write each other's documents.
- One adoc server per workspace on a computer; the CLI and MCP find it through a server record outside the repository.
- The server remembers each browser tab as a browser session with its last access and location; `adoc ui open` moves the most recent one.
- Unsent popover text and the composer text survive navigation and reloads.
- The server keeps recent versions of each document in memory; a plugin may render the changes since the version the browser showed last (`renderChanges`), otherwise adoc shows a line diff.

## Open questions

- (none)

## Decisions

- The plugin is called NOTE; statuses are OPEN, MOVED and ARCHIVED; `moved_to` links the result.
- Default sections are Background, Ideas, Open questions and Decisions, in English.
- Browser control uses `adoc ui list` and `adoc ui open`, like `aterm ui`.
- `adoc ui open` only navigates the tab; focusing windows is left to the browser.
- The base of the change view is the version this browser showed last; the change view turns on by itself and can be toggled.
- What a note turns into (a TASK, a proposal, an archived record) is the agent's judgement, agreed with the person; adoc adds no dedicated conversion feature. The NOTE guide only suggests the usual outcomes.
- The change view should also reach older versions kept in memory (a version picker); tracked in [[TODO-adoc]].
