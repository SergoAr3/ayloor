# <Feature / Task Name>

Status: active

Keep the plan concise and current. Update findings instead of accumulating a chronological log.
Do not store secrets, local PIDs, temporary paths or screenshot inventories.

## Goal

Describe the user-visible or system outcome.

Do not describe implementation here unless implementation itself is the goal.

## Scope

Describe what this task includes.

## Out of scope

Describe what intentionally remains unchanged.

## Current behavior

Briefly describe how the relevant system works today.

Reference important files or existing flows when useful.

## Desired behavior

Describe what should be true after this task is complete.

## Constraints and invariants

List only constraints relevant to this task.

Examples:

- backend remains authoritative
- XP must remain idempotent
- existing completed quest behavior must not regress
- no background location tracking
- preserve current API compatibility

## Investigation

Record important findings discovered before or during implementation.

Examples:

- relevant files
- existing abstractions
- surprising behavior
- existing tests covering the area

Keep this section factual.

## Implementation plan

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

Prefer implementation-sized steps, not tiny code-edit steps.

## Parallel work (optional)

Use only when independent workstreams exist. Note their boundaries and expected outputs; subagents are not required.

## Acceptance criteria

- [ ] Required behavior works
- [ ] Important failure state works
- [ ] Existing behavior is preserved
- [ ] Relevant tests pass

Add task-specific criteria.

## Verification

Record the actual checks performed.

Examples:

- [ ] backend focused tests
- [ ] frontend unit tests
- [ ] TypeScript
- [ ] build
- [ ] relevant Playwright flow
- [ ] final diff review

Do not mark a check complete unless it actually ran successfully.

## Decisions

Record non-obvious implementation decisions that may matter later.

Do not fill this section with routine coding details.

## Remaining issues

Write `None` if there are no known remaining issues.

Otherwise record anything intentionally left unresolved.
