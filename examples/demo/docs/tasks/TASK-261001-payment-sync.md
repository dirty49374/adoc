---
title: Fix the payment status sync
status: TODO
related: [TASK-260930-order-paging]
---

## Problem

After a card payment completes, the order stays in PENDING.

## Method

Listen to the payment-completed event and update the order status in the same transaction.
