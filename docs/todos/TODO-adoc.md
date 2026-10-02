# adoc follow-ups

- [ ] Verify hc delivery to another agent (self-sends are refused by hc)
- [ ] Plugin hot reload re-imports only index.ts; decide whether multi-file plugins are allowed
- [ ] CLI tests import the core test fixture across packages; give tests one shared place
- [ ] Show "no git" in git-related fields once such fields exist (commit hash etc.)
- [ ] Idea: show the agent's herdr window in the web UI
- [x] Change view: pick any older version kept in memory as the base (version picker), see [[NOTE-261002-note-plugin]]
- [x] Terminal mouse clicks: forward as `terminal.mouse` once herdr is updated (0.9.1 has no mouse command; docs for 0.9.3 list it), see [[TASK-261002-herdr-integration]]
- [ ] Terminal scroll speed: wheel scrolling feels slow; tune lines per wheel step and frame latency, see [[TASK-261002-herdr-integration]]
