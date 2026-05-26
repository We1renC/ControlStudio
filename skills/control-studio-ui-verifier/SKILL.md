---
name: control-studio-ui-verifier
description: Verify ControlStudio browser UI against expected SISO, MIMO, MPC, robust, SysID, plotting, advisor, and export workflows. Use when the user asks for browser closed-loop UI testing, naming review, layout validation, or issue capture.
---

# ControlStudio UI Verifier

Use this skill when an agent needs to inspect ControlStudio through a browser and report whether the UI supports the intended control-engineering workflow.

## Workflow

1. Start or confirm the local service.
   - Preferred URL: `http://127.0.0.1:8765`.
   - If unavailable, start `python3 control-studio/scripts/serve_studio.py`.

2. Select the workflow under test.
   - SISO core, MIMO analysis, MPC, robust validation, SysID, codegen, plot workspace, or export.

3. Exercise the UI as an engineer would.
   - Enter a representative plant.
   - Configure controller or design module.
   - Run analysis and inspect plots, legends, key metrics, warnings, and export controls.

4. Capture issues with evidence.
   - Naming mismatch.
   - Key information hidden or too small.
   - Wrong mode visibility.
   - Plot too cramped or missing legend.
   - Ambiguous units or formulas.
   - Regression from SISO/MIMO switching.

5. If implementation changes are required, patch UI and add/extend verification.
   - Prefer deterministic DOM/script checks plus browser walkthrough for layout changes.
   - Sync roadmap, backlog, plan, scenarios if workflow behavior changes.

## References

- Read `references/workflow.md` for browser walkthrough structure.
- Read `references/validation-checklist.md` before accepting UI changes.
- Use `examples/sample-output.md` for issue report shape.

## Required Verification

For UI implementation changes:

```bash
bash control-studio/scripts/run_all_verify.sh
node test_control.js
```

For documentation-only skill updates:

```bash
python3 /Users/w.rc/.config/agents/skills/.system/skill-creator/scripts/quick_validate.py skills/control-studio-ui-verifier
git diff --check
```

## Boundaries

- Do not infer correctness from the DOM alone when math output is visible.
- Do not accept missing legends or hidden critical metrics as cosmetic issues.
- Do not restart Teaching Mode, Electron packaging, Report Template, or Block Diagram expansion.
