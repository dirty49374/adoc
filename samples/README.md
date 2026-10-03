# Sample workspace

A team building a todo app works with an agent through adoc. The screenshots in the repository's README come from here.

```sh
cd samples
adoc skill install            # or: npx skills add ../plugins/<name>/skill for each plugin
adoc server run               # http://127.0.0.1:7702
```

Start Claude Code (or another agent) in a herdr pane in this folder and let it run `adoc agent claim`; `CLAUDE.md` tells
it that this is a sample, never to be committed.
