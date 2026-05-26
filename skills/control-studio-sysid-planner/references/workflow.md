# System Identification Workflow

## Inputs

- Goal: control design, monitoring, simulation, or robust validation
- Data source: existing dataset or planned experiment
- Signals: input columns, output columns, sample time
- Constraints: actuator limits, safe operating region, duration
- Candidate model families

## Design Steps

1. Validate sample time and synchronized input/output rows.
2. Select excitation signal and duration.
3. Split data into estimation and validation windows.
4. Fit baseline ARX or FRF model.
5. Escalate to ARMAX / OE / BJ / subspace / SRIVC only when justified.
6. Compare model orders with AIC/BIC and validation error.
7. Run residual whiteness and residual-input correlation checks.
8. Export model uncertainty for robust validation.

## Recommended Module Mapping

- ARX and order selection: `control-studio/js/control/sysid.js`
- Frequency-domain ID: `control-studio/js/control/sysid_freq.js`
- Experiment signals: `control-studio/js/control/sysid_signals.js`
- Advanced model families: `control-studio/js/control/sysid_subspace.js`
- SRIVC / continuous-time ID: `control-studio/js/identification/srivc.js`
- MIMO FRF: `control-studio/js/identification/freq_mimo.js`

## Output Contract

Return:

- selected experiment signal
- candidate model families
- order-selection method
- validation checks
- uncertainty export plan
- deterministic fixture recommendation
