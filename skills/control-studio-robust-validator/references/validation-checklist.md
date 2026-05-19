# Validation Checklist

## Before Coding

- Confirm nominal plant is stable or explicitly intended to be unstable.
- Confirm controller is part of the loop or the plant itself is the loop transfer function.
- Confirm uncertainty ranges are finite and serializable.
- Confirm pass/fail specs and units.
- Confirm whether the validation target is SISO, MIMO, or both.

## Math Checks

- Uncertainty samples are deterministic for a fixed seed.
- Transfer-function denominator remains valid after sampling.
- Closed-loop instability is reported as failure.
- Worst-case sample can be replayed from stored sample values.
- Sensitivity identity remains valid for nominal robust metrics.
- Additive/multiplicative uncertainty labels are not confused with full mu synthesis.

## Required Fixtures

- Schema acceptance and rejection.
- Same seed, same samples.
- Different seed, different samples.
- Nominal pass but uncertainty family fails.
- At least one unstable sample classification.
- Worst-case sample extraction.

## Documentation Updates

- Update `CONTROL_SYSTEM_BACKLOG.md` when a CS-P18 item moves from Next/Planned to Done.
- Update `CONTROL_SYSTEM_PLAN.md` when a user-visible or core math capability is added.
- Update `CONTROL_SYSTEM_SKILLS_PLAN.md` when skill scope changes.
- Update `AGENT_CONTINUATION.md` with new verification commands and phase status.
