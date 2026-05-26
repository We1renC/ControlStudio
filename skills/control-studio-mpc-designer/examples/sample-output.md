# MPC Design Review

Status: feasible

Selected path: offset-free MIMO MPC

Model evidence:
- State dimension: 4
- Inputs: 2
- Outputs: 2
- Sample time: 0.1 s

Design:
- Prediction horizon: 20
- Control horizon: 5
- Tracking target: output-space setpoint
- Constraints: input and delta-u active

Verification:
- Steady-state error: below tolerance
- Active constraints: input upper bound during the first transient
- Required fixture: constrained MIMO tracking with disturbance replay

Follow-up:
- Tune delta-u penalty if actuator motion is too aggressive.
- Export the uncertainty envelope to robust validation before deployment.
