# MPC Validation Checklist

## Structural Checks

- `A` is square.
- `B`, `C`, and `D` dimensions match `A`.
- Discrete model uses the stated sample time.
- Stabilizability is checked for unstable modes.

## Objective Checks

- Tracking target is reachable or steady-state infeasibility is reported.
- Weight matrices are symmetric positive semidefinite or positive definite as required.
- Terminal cost is documented when used.

## Constraint Checks

- Input, output, state, and delta-u bounds use explicit units.
- Hard constraints and soft constraints are not mixed silently.
- Soft constraint penalties are large enough to discourage avoidable violations.
- Infeasible cases return a structured diagnostic.

## Closed-loop Checks

- Report settling behavior and steady-state error.
- Report peak control effort and active constraint count.
- Compare constrained and unconstrained responses when constraints affect performance.
- For offset-free MPC, verify step disturbance rejection.
