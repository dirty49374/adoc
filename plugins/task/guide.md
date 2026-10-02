A TASK document is a detailed work order for one piece of work.

## File

`TASK-<id>.md`: YAML front matter, then Markdown with `##` sections.

```markdown
---
title: Paginate the order list
status: RUNNING
assignee: adoc-dev
related: [TODO-gui]
---

## Goal

Order list loads in under 200 ms with 10k orders.

## Method

1. Replace `findAll()` with `findPage(cursor, limit)`.

## Done when

- [ ] p95 under 200 ms
```

- `title` and `status` are required in spirit; `status` is free text, usually TODO, RUNNING, REVIEW or DONE.
- `assignee` and `related` (a list of document keys) are optional and appear in tooltips.
- Write `[[KEY]]` in the body to refer to another document.
- Recommended id: date and title, such as `TASK-260930-order-paging`.

## Anchors

The anchor of a section is its heading in lowercase with hyphens: `## Done when` is `TASK-…#done-when`.
A comment also carries `source: <file>:<line>` for the exact line and a `quote` of the selected text.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `set-status` with value `DONE` etc. | nothing (`applied: false`) | set `status:` in the front matter to the value, if the work allows it; otherwise explain in the document |

## Typical requests

- A comment with a quote on a section: change that text in that section.
- "split this task": create a new `TASK-<id>.md` and link both with `[[KEY]]`.
