# adoc follow-ups

- [ ] Verify hc delivery to another agent (self-sends are refused by hc)
- [ ] Plugin hot reload re-imports only index.ts; decide whether multi-file plugins are allowed
- [ ] CLI tests import the core test fixture across packages; give tests one shared place
- [ ] Show "no git" in git-related fields once such fields exist (commit hash etc.)
- [ ] Idea: show the agent's herdr window in the web UI
- [x] Change view: pick any older version kept in memory as the base (version picker), see [[NOTE-261002-note-plugin]]
- [x] Terminal mouse clicks: forward as `terminal.mouse` once herdr is updated (0.9.1 has no mouse command; docs for 0.9.3 list it), see [[TASK-261002-herdr-integration]]
- [ ] Terminal scroll speed: wheel scrolling feels slow; tune lines per wheel step and frame latency, see [[TASK-261002-herdr-integration]]
- [ ] Terminal: Shift+Enter does not work (xterm.js sends a plain Enter; the agent expects its newline sequence)
- [ ] TODO plugin: grouping, e.g. `## Group` headings between items (today headings are ignored and all items show as one flat list)
- [ ] Web UI: switch the terminal into the main area (the side panel stays fixed), and back
- [ ] Web UI: tell the terminal from the main area: a subtly different background, or a very thin vertical rule between them
- [ ] Document list pane: show each title on exactly two lines (fitted to the current titles); a longer title is cut and shown whole in a popup on hover
- [ ] Document list pane: sort by last update, newest first, by default; add a sort control with more orders (key, title, status)
- [ ] Document list pane: show the last update in small text, relative ("updated 5 min ago")
