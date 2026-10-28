---
name: Spec (feature or bug)
about: Work item with the acceptance tests that must fail before the change and pass after it
---

## Problem

<!-- What is wrong or missing and who sees it. For a bug: exact steps, the input that triggers it, what happens and what should happen. -->

## Proposal

<!-- The change, at the level of behaviour. Name files only when the location is already known. -->

## Acceptance tests

<!--
Write these BEFORE any code. Each one becomes a spec that is run and seen failing
for the right reason, then made green by the change. One line per behaviour:

- [ ] Given <state>, when <action>, then <result>. Spec: `<path to spec file>`

For a bug, the first line reproduces the report with the real input.

If a spec written first adds nothing here (pure layout or CSS, a dependency upgrade,
infra config), replace the list with one line:
No test-first: <reason>
-->

- [ ] Given ..., when ..., then .... Spec: `...`

## Out of scope

<!-- Optional: related things this issue deliberately leaves alone. -->
