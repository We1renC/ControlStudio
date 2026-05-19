---
name: control-studio-benchmark-author
description: Create mathematically grounded ControlStudio benchmark cases and regression fixtures. Use when adding SISO, MIMO, MPC, robust-control, system-identification, state-space, or edge-case validation scenarios that require derivations, expected numeric results, tolerances, and repeatable test coverage.
---

# ControlStudio Benchmark Author

Use this skill to convert a control-system scenario into a benchmark that future agents can verify.

## Workflow

1. Define the scenario.
   - State plant, controller, domain, assumptions, and why the case matters.
   - Classify the case: SISO, MIMO, MPC, robust, sysid, nonlinear entry, or math-core edge case.

2. Write the derivation.
   - Include poles, zeros, DC gain, closed-loop equation, margins, or Riccati/Lyapunov residual as applicable.
   - State exactly which values are expected and which are qualitative.

3. Set tolerances.
   - Use tight tolerances for analytic algebra.
   - Use wider tolerances for simulated metrics such as settling time or noisy identification.
   - Explain any tolerance above normal numeric roundoff.

4. Add fixture or script.
   - Prefer existing runners before creating new ones.
   - Add a new runner only when the benchmark category is genuinely new.
   - Ensure the benchmark is deterministic.

5. Sync documentation.
   - Add the scenario to `CONTROL_SYSTEM_VERIFICATION_CASES.md` or `CONTROL_SYSTEM_SCENARIOS.md`.
   - Update `CONTROL_SYSTEM_BACKLOG.md` and `AGENT_CONTINUATION.md` if phase status changes.

## References

- Read `references/benchmark-template.md` before writing a new benchmark.
- Use `examples/sample-benchmark.md` for output shape.

## Required Verification

```bash
npm run verify:all
node test_control.js
```

## Boundaries

- Do not add benchmark cases without mathematical expected values.
- Do not use random data unless the seed and noise model are fixed.
- Do not hide a numerical discrepancy by widening tolerance without documenting why.
