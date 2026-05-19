# System Audit Checklist

## SISO

- Denominator is nonzero and finite.
- Plant is proper or explicitly marked improper.
- Pole/zero map matches expected model.
- Stability margins are finite or clearly classified as infinite/undefined.
- Step metrics are computed only for meaningful step responses.
- Controller is compatible with plant domain.

## State Space

- A is square.
- B row count equals state count.
- C column count equals state count.
- D shape equals output by input.
- Controllability rank is checked before pole placement/LQR.
- Observability rank is checked before observer/Kalman/LQG.

## MIMO

- RGA is used only for square steady-state gain matrices.
- Singular-value Bode is used to assess conditioning.
- Decoupler is checked by `G(0)W` or `G(jω)W(jω)`.
- MIMO LQR requires stabilizability and positive-definite R.

## Robust / MPC

- Robust validation uses deterministic seed and sample replay.
- H-infinity and mu results must state whether they are baseline, surrogate, or full synthesis.
- MPC reports feasibility and constraint violation.
- Offset-free tracking requires a disturbance or integral augmentation model.
