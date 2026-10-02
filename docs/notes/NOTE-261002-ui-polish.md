---
title: Making the web UI look good
status: OPEN
---

## Background

The web UI works but looks like a prototype. This note lists what is wrong today (from screenshots of the NOTE, home and KANBAN pages at 1440×900) and proposes a direction, so that we agree on it before designing in aterm and making a TASK.

## What is wrong today

- **Terminal glyphs:** Korean text in the terminal is drawn with gaps between syllables, and the Powerline glyphs of the shell prompt show as boxes; the terminal font has neither CJK nor Nerd Font glyphs.
- **Two worlds:** a bright document area next to a dark terminal, with no shared palette; the right panel has two headers stacked ("Agent terminal adoc-dev via herdr" and the terminal header).
- **Cramped middle:** list pane (300px) + document + terminal leave the document narrow; the KANBAN board scrolls sideways inside it.
- **Weak hierarchy:** the plugin tabs are plain text with counts; the document key, title, status and path compete in the header; badges, buttons and chips each have their own style.
- **Heavy composer:** a three-line box with a big Send button takes space even when unused.
- **Typography:** system font for everything; no font chosen for Korean; line lengths in documents are unbounded.

## Ideas

- **One palette, light and dark:** design tokens shared by the shell, the documents and the terminal theme; follow the system theme, with a toggle. The terminal uses the same background and accent as the app instead of a separate black box.
- **Fonts:** Pretendard for the interface and documents (good Korean and Latin), a monospace with CJK and Nerd Font glyphs for the terminal and code (for example D2Coding Nerd or Sarasa Mono K, falling back to JetBrains Mono); bundled with the web UI so that it works offline on the internal network.
- **Layout:** the list pane collapses to a narrow rail when a document is open (hover or click to expand); documents get a comfortable reading width (about 72 characters) centred in their pane; KANBAN columns fill the available width and wrap instead of scrolling.
- **Right panel:** one header that combines the agent, the pane, the status and the control state; the terminal fills the rest; the composer becomes a single line that grows while typing, with the draft chips above it and a small send icon.
- **Plugin tabs:** pill-shaped tabs with a small icon per plugin and a quiet count.
- **Document header:** key as a small monospace caption, title large, status as a coloured pill, path and change toggle in a quiet meta row.
- **Components:** one style for badges, pills, chips and buttons; visible focus rings; short transitions on hover and on panel changes.

## Open questions

- Which overall look: calm light workspace (Notion/Linear-like), full dark (terminal-like everywhere), or system light/dark with a toggle?
- May the web UI bundle web fonts (Pretendard, a CJK Nerd monospace), adding a few MB, or should it use only fonts installed on the computer?
- Any app whose look you want adoc to resemble?

## Decisions

- (none yet)
