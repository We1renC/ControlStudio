---
name: control-studio-sysid-planner
description: Plan and validate ControlStudio system-identification experiments. Use when selecting experiment signals, ARX/ARMAX/OE/BJ/subspace/SRIVC/FRF model families, model order, residual validation, train/test split, uncertainty export, or robust-control handoff.
---

# ControlStudio SysID Planner

Use this skill when an agent needs to turn measurement goals and data constraints into a reproducible system-identification plan.

## Workflow

1. Define the identification target.
   - SISO, MISO, MIMO, continuous-time, discrete-time, linear, or block-nonlinear.
   - Record sample time, available input/output columns, actuator limits, and noise assumptions.

2. Choose the experiment signal.
   - Step for coarse first-order behavior.
   - PRBS for broad-band linear identification.
   - Chirp or multi-sine for frequency-domain and resonance coverage.
   - Respect actuator and safety limits.

3. Select model families.
   - ARX for baseline.
   - ARMAX / OE / BJ when noise model matters.
   - Subspace state-space for MIMO dynamics.
   - SRIVC / continuous-time ID when physics and derivative structure matter.
   - GP-NARX or Hammerstein / Wiener for nonlinear behavior.

4. Validate the identified model.
   - Train/test split, AIC/BIC, residual whiteness, residual-input correlation, confidence or uncertainty estimate.
   - Export uncertainty to robust validation when the model will drive controller design.

5. If implementation changes are required, update tests and docs.
   - Add deterministic synthetic data fixtures using fixed seeds.
   - Sync roadmap, backlog, plan, verification notes, and continuation docs.

## References

- Read `references/workflow.md` for the SysID planning flow.
- Read `references/validation-checklist.md` before accepting a model.
- Use `examples/sample-output.md` for the expected report shape.

## Required Verification

For implementation changes:

```bash
bash control-studio/scripts/run_all_verify.sh
node test_control.js
```

For documentation-only skill updates:

```bash
python3 /Users/w.rc/.config/agents/skills/.system/skill-creator/scripts/quick_validate.py skills/control-studio-sysid-planner
git diff --check
```

## Boundaries

- Do not accept a model based only on fit percentage.
- Do not use random synthetic data without fixed seeds and documented noise model.
- Do not restart Teaching Mode, Electron packaging, Report Template, or Block Diagram expansion.
