# UI Verification Workflow

## Setup

1. Check service availability at `http://127.0.0.1:8765`.
2. Open the page in the browser tool.
3. Dismiss modals or onboarding only if they block the target workflow.

## Walkthrough Pattern

1. Configure system mode.
2. Enter plant or state-space matrices.
3. Configure controller or analysis module.
4. Run calculation.
5. Inspect plot workspace.
6. Inspect sidebar/advisor result.
7. Switch mode or tab and verify stale data is hidden.
8. Test export or comparison if it belongs to the workflow.

## Evidence To Record

- URL and viewport.
- Workflow path.
- Inputs used.
- Expected engineering result.
- Observed UI result.
- Screenshots if layout or visibility is the issue.
- Regression command or verification script.

## Common ControlStudio Risks

- SISO-only advisor content visible in MIMO mode.
- MIMO-only analysis visible in SISO mode.
- Plot legends missing after view switch.
- Key formulas rendered as prose instead of math.
- Sidebar sections too long and requiring excessive scrolling.
- Export missing current mode or controller metadata.
