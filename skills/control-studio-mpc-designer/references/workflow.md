# MPC Design Workflow

## Inputs

- Model: `{ A, B, C, D }`
- Domain: continuous or discrete
- Sample time: `Ts`
- Horizon: prediction and control horizons
- Weights: `Q`, `R`, optional `Qf`, optional delta-u penalty
- Constraints: input, output, state, delta-u, soft penalties
- Reference: state or output setpoint, constant or time-varying

## Design Steps

1. Validate matrix dimensions and controllability / stabilizability.
2. Convert continuous models to discrete form if needed.
3. Compute steady-state target for setpoint tracking.
4. Build the condensed prediction matrices.
5. Solve the constrained QP or selected nonlinear/economic problem.
6. Simulate closed-loop receding horizon behavior.
7. Inspect active constraints and feasibility diagnostics.
8. Export the MPC configuration and verification notes.

## Recommended Module Mapping

- Linear MPC: `control-studio/js/control/mpc.js`
- MIMO engineering MPC: `control-studio/js/control/mpc.js`, `verify_p20_mpc_engineering.mjs`
- NMPC: `control-studio/js/control/nmpc.js`
- EMPC: `control-studio/js/control/empc.js`
- Tube / explicit MPC: `control-studio/js/control/tube_mpc.js`, `explicit_mpc.js`
- Move blocking: `control-studio/js/control/mpc_moveblock.js`

## Output Contract

Return:

- selected design path
- assumptions and rejected paths
- final MPC parameters
- feasibility result
- expected closed-loop metrics
- verification command or fixture location
