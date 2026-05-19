---
name: control-studio-robust-validator
description: Plan, run, and review ControlStudio robust-control uncertainty validation. Use when validating SISO/MIMO controllers against parametric uncertainty, additive or multiplicative uncertainty, Monte Carlo samples, worst-case responses, robust pass/fail specs, or Phase 18 robust-validation fixtures.
---

# ControlStudio Robust Validator

Use this skill to turn a nominal ControlStudio design into a reproducible robust-validation workflow.

## Workflow

1. Confirm the nominal model and controller.
   - Identify TF/SS/ZPK form, loop definition, controller, sample time if any, and closed-loop mode.
   - If the model is not well defined, stop and request the missing plant/controller data.

2. Define uncertainty explicitly.
   - Prefer parametric ranges when the physical source is known.
   - Use additive uncertainty for absolute model error.
   - Use multiplicative gain/phase uncertainty for loop-level robustness screening.
   - Keep ranges serializable so they can be stored in project JSON or verification fixtures.

3. Define pass/fail specifications.
   - Minimum useful specs: max overshoot, max settling time, min phase margin, max peak sensitivity.
   - Add control effort, actuator saturation, or steady-state error when available.

4. Run deterministic validation.
   - Use a fixed seed and sample count.
   - Capture the worst-case sample and its metrics.
   - Treat unstable samples as hard failures, not missing data.

5. Produce implementation guidance.
   - If the request is planning-only, output uncertainty schema, specs, and verification steps.
   - If the request asks for code changes, implement through `control-studio/js/control/robust.js` and add or update `control-studio/scripts/verify_p18_robust_validation.mjs`.
   - Sync `CONTROL_SYSTEM_PLAN.md`, `CONTROL_SYSTEM_BACKLOG.md`, `CONTROL_SYSTEM_SKILLS_PLAN.md`, and `AGENT_CONTINUATION.md` when phase status changes.

## References

- For the detailed validation checklist, read `references/validation-checklist.md`.
- For input and output schema examples, read `references/workflow.md`.
- For a minimal sample request/result, inspect `examples/sample-input.json` and `examples/sample-output.md`.

## Required Verification

For code changes, run:

```bash
npm run verify:p18
npm run verify:all
node test_control.js
```

For documentation-only skill updates, run:

```bash
python3 /Users/w.rc/.config/agents/skills/.system/skill-creator/scripts/quick_validate.py skills/control-studio-robust-validator
git diff --check
```

## Boundaries

- Do not restart Teaching Mode, Electron packaging, Report Template, or Block Diagram work.
- Do not claim robust validation is equivalent to full H-infinity or full mu synthesis.
- Do not accept non-reproducible Monte Carlo results as a regression baseline.
- Do not hide failures behind natural-language advice; return failed specs and worst-case samples.
