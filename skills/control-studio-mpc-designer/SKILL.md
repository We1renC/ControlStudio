---
name: control-studio-mpc-designer
description: Design and validate MPC controllers in ControlStudio. Use when converting a state-space plant into SISO/MIMO MPC tracking, constraints, move suppression, offset-free tracking, feasibility diagnostics, economic MPC, tube MPC, or explicit MPC workflows.
---

# ControlStudio MPC Designer

Use this skill when an agent needs to turn a state-space plant and engineering requirements into a reproducible MPC design plan or verification fixture.

## Workflow

1. Define the prediction model.
   - Record continuous or discrete state-space matrices, sample time, output definition, and whether the task is SISO or MIMO.
   - If the plant is continuous, specify the discretization method before designing MPC.

2. Define the control objective.
   - Tracking: state-space setpoint, output-space setpoint, or time-varying reference.
   - Regulation: terminal state target or disturbance rejection.
   - Economic objective: scalar cost terms and operating-region assumptions.

3. Define constraints.
   - Input bounds, output bounds, state bounds, delta-u bounds, and soft-constraint penalties.
   - Mark hard constraints separately from engineering preferences.

4. Choose the MPC path.
   - Linear constrained MPC for deterministic small-to-medium systems.
   - Offset-free MIMO MPC when steady-state disturbance rejection is required.
   - Tube MPC when uncertainty bounds are known.
   - NMPC / EMPC when nonlinear or non-quadratic objectives dominate.
   - Explicit MPC only for low-dimensional scalar or small systems.

5. Verify feasibility and closed-loop behavior.
   - Report feasibility status, active constraints, violation logs, settling behavior, and control effort.
   - Compare constrained vs unconstrained designs when tradeoffs are relevant.

6. If implementation changes are required, update tests and docs.
   - Add deterministic fixtures in the closest existing `verify_p20_*`, `verify_p24_*`, or roadmap verification script.
   - Sync `control-studio/ROADMAP.md`, `docs/src/control-studio/backlog.md`, `docs/src/control-studio/plan.md`, and `docs/src/agents/continuation.md`.

## References

- Read `references/workflow.md` for the MPC design flow.
- Read `references/validation-checklist.md` before accepting a design.
- Use `examples/sample-output.md` for the expected report shape.

## Required Verification

For implementation changes:

```bash
bash control-studio/scripts/run_all_verify.sh
node test_control.js
```

For documentation-only skill updates:

```bash
python3 /Users/w.rc/.config/agents/skills/.system/skill-creator/scripts/quick_validate.py skills/control-studio-mpc-designer
git diff --check
```

## Boundaries

- Do not claim feasibility from a nominal simulation alone; constraints must be checked explicitly.
- Do not hide infeasible setpoints behind clipped inputs.
- Do not restart Teaching Mode, Electron packaging, Report Template, or Block Diagram expansion.
