---
title: Add CSV export of the order list
status: TODO
related: [TODO-gui, TASK-260930-order-paging]
---

## Goal

Let the user download the order list, with its current filters, as a CSV file.

## Method

1. Add an export endpoint that streams the filtered orders as CSV.
2. Add an "Export CSV" button to the order list screen.

## Done when

- The downloaded CSV holds every order matching the filters, not only the current page.
