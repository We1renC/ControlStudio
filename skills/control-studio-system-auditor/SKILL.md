---
name: control-studio-system-auditor
description: Audit ControlStudio plant and controller designs before development or deployment. Use when checking SISO/MIMO controllability, observability, poles, margins, stability, controller suitability, robust risk, MPC readiness, or whether a control-system design is mathematically and engineering-wise ready for implementation.
---

# ControlStudio System Auditor

Use this skill before adding features, tuning controllers, or accepting a ControlStudio design as valid.

## Workflow

1. Identify the system form.
   - SISO TF / ZPK / SS, discrete TF, or MIMO SS.
   - Record controller type, sample time, compensator, and closed-loop mode.

2. Run structural checks.
   - TF: denominator validity, poles, zeros, properness, cancellations.
   - SS: dimension consistency, controllability, observability.
   - MIMO: channel count, RGA, singular values, conditioning, pairing risk.

3. Run control checks.
   - Stability: open-loop and closed-loop poles.
   - Margins: PM/GM, sensitivity peaks, bandwidth.
   - Time response: rise, settling, overshoot, steady-state error.
   - Advanced design readiness: LQR/LQG/MPC/robust assumptions.

4. Report risks as evidence.
   - Every finding needs a numeric indicator or explicit theorem condition.
   - Mark unsupported cases as unsupported, not as pass.

5. If code changes are requested, update tests and docs.
   - Add fixtures when a new failure mode is discovered.
   - Sync `CONTROL_SYSTEM_BACKLOG.md`, `CONTROL_SYSTEM_VERIFICATION_CASES.md`, `CONTROL_SYSTEM_SCENARIOS.md`, and `AGENT_CONTINUATION.md` when status changes.

## References

- Read `references/audit-checklist.md` for the checklist.
- Use `examples/sample-output.md` as the expected report shape.

## Required Verification

For implementation changes:

```bash
npm run verify:all
node test_control.js
node control-studio/scripts/control_regression_dashboard.mjs
```

## Boundaries

- Do not infer controllability, observability, or robust stability from UI appearance.
- Do not treat nominal stability as robust stability.
- Do not resume Block Diagram, Teaching Mode, Electron, or Report Template work.
