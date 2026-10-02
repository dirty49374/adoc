---
title: Right panel layout with the herdr terminal
status: MOVED
moved_to: TASK-261002-herdr-integration
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

## Draft markers (decided)

```text
│ ## Ideas                                 │ │
│                                          │ │
│ - Korean IME: xterm.js takes input       │●│   ← one marker per line that has a draft
│   through a hidden textarea …            │ │
│                                          │ │      hover ●:
│ - Finding the agent's own pane …         │ │      ┌──────────────────────┐
│                                          │●│ ───▶ │ #ideas               │
│ - Right panel: the terminal fills …      │ │      │ "composition"        │
│                                          │ │      │ IME test first?  ✎ ✕ │
│ ## Open questions                        │ │      └──────────────────────┘
```

The margin is one character wide; each line that carries a draft shows a dot. Hovering the dot unfolds the card over the text; ✎ edits, ✕ removes.

## Ideas

- The draft list leaves the right panel: drafts become markers in a one-character margin of the document body, aligned with their anchor, unfolding into a card on hover.
- The composer bar is the same component with and without herdr; only the area above it changes (terminal or pending messages).
- The top bar gains the agent pane label (`▣ w2B:p1 idle`), so the assigned agent is visible on every page.
- Drafts on other documents show as chips too; clicking one opens that document and scrolls to the card.

## Open questions

- (none)

## Decisions

- The layout above is accepted.
- Draft cards shrink to a one-character marker column (a dot per line), unfolding on hover.
- The border between the document and the terminal panel can be dragged to change the terminal's width.
