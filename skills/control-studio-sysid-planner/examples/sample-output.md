# SysID Plan

Status: ready for experiment

Target:
- System: MIMO state-space model for control design
- Sample time: 0.05 s
- Inputs: 2
- Outputs: 2

Experiment:
- Signal: multi-sine with bounded amplitude
- Duration: 800 samples
- Validation split: final 30 percent

Model candidates:
- Baseline: MIMO FRF
- Primary: subspace state-space
- Fallback: per-channel ARX with residual diagnostics

Acceptance checks:
- Validation fit improves over ARX baseline
- Residual whiteness passes
- Residual-input correlation stays below threshold
- Uncertainty export is available for robust validation
