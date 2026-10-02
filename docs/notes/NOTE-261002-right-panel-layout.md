---
title: Right panel layout with the herdr terminal
status: OPEN
---

## Background

Text drawing of the screen for [[NOTE-261002-herdr-integration]]: the right panel becomes the assigned agent's herdr terminal, draft comments move into the content area, and a one-line composer bar sits under the terminal.

## Whole screen (herdr pane assigned)

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ adoc · adoc                                         ⚠ 1   ● connected   ⎇ git   ▣ w2B:p1 idle│
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ TODO 1   TASK 1   KANBAN 1   NOTE 3                                                          │
├────────────┬────────────────────────────────────────────┬────────────────────────────────────┤
│ NOTE       │ NOTE-261002-herdr-integration              │ ▣ adoc-dev · claude · w2B:p1  idle │
│            │ herdr integration as the default           ├────────────────────────────────────┤
│ ▸ herdr    │ OPEN · 2 open questions   ○ changes ▾      │ ● Crunched for 15s                 │
│   integr.  ├──────────────────────────────┬─────────────┤                                    │
│   right    │ ## Ideas                     │ ┌─────────┐ │ ❯ adoc check                       │
│   panel    │                              │ │#ideas   │ │   adoc check: no problems          │
│   note     │ - Korean IME: xterm.js takes │ │"compos- │ │                                    │
│   plugin   │   input through a hidden …   │ │ ition"  │ │ ❯ █                                │
│            │                              │ │IME test │ │                                    │
│            │ - Finding the agent's own    │ │first?   │ │        (live terminal of the       │
│            │   pane (from herdr-connect)… │ │   ✎  ✕  │ │         assigned agent's pane,     │
│            │                              │ └─────────┘ │         full keyboard control)     │
│            │ - Right panel: the terminal  │             │                                    │
│            │   fills the right panel; …   │ ┌─────────┐ │                                    │
│            │                              │ │#ideas   │ │                                    │
│            │ ## Open questions            │ │size of  │ │                                    │
│            │                              │ │pane?    │ │                                    │
│            │ - Is the right-panel layout… │ │   ✎  ✕  │ │                                    │
│            │                              │ └─────────┘ │                                    │
│            │                              │             ├────────────────────────────────────┤
│            │                              │             │ [#ideas ×] [#ideas ×] [+1]   ⧗ 0   │
│            │                              │             │ ┌────────────────────────┐ ┌─────┐ │
│            │                              │             │ │message about this note │ │Send │ │
│            │                              │             │ └────────────────────────┘ └─────┘ │
└────────────┴──────────────────────────────┴─────────────┴────────────────────────────────────┘
   list pane    document body                 draft cards    terminal panel + composer bar
```

## Right panel up close

```text
┌──────────────────────────────────────────┐
│ ▣ adoc-dev · claude · w2B:p1   ● working │  ← agent pane, herdr agent status (events.subscribe)
├──────────────────────────────────────────┤
│                                          │
│   live terminal (xterm.js)               │  ← herdr terminal session control
│   - follows the browser window size      │     frames in, terminal.input / resize out
│   - click to type; Korean IME works      │
│   - scroll wheel = terminal.scroll       │
│                                          │
├──────────────────────────────────────────┤
│ [TASK-…#method ×] [TODO-gui#3 ×]  ⧗ 0    │  ← draft chips (click: jump to the card); pending badge
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ to: NOTE-… ▾  message …      │ │Send │ │  ← composer: drafts + text → one comment message,
│ └──────────────────────────────┘ └─────┘ │     delivered by agent.prompt into the terminal
└──────────────────────────────────────────┘
```

## Without herdr (fallback)

```text
┌──────────────────────────────────────────┐
│ Messages to agent via wait          0    │  ← today's message dock
├──────────────────────────────────────────┤
│ pending messages                         │
│ …                                        │
├──────────────────────────────────────────┤
│ [#ideas ×] [#goal ×]                     │  ← same chips and composer bar as above
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ message …                    │ │Send │ │
│ └──────────────────────────────┘ └─────┘ │
└──────────────────────────────────────────┘
```

## Ideas

- The draft list leaves the right panel: drafts become cards in a margin column of the document body, aligned with their anchor; ✎ edits, ✕ removes.
- The composer bar is the same component with and without herdr; only the area above it changes (terminal or pending messages).
- The top bar gains the agent pane label (`▣ w2B:p1 idle`), so the assigned agent is visible on every page.
- Drafts on other documents show as chips too; clicking one opens that document and scrolls to the card.

## Open questions

- Should the margin column be always visible, or only when the document has drafts?
- Is the terminal panel's width fixed, or can the person drag the border between the document and the terminal?
