# Robust Validation Workflow

## Input Schema

```json
{
  "nominalPlant": {
    "type": "transfer_function",
    "num": [1],
    "den": [1, 3, 2]
  },
  "controller": {
    "type": "pid",
    "kp": 1,
    "ki": 0,
    "kd": 0
  },
  "uncertainty": {
    "gain": 0.2,
    "denominator": [0, 0.2, 0.3],
    "additive": { "radius": 0.02 },
    "multiplicative": { "gainSpread": 0.1, "phaseDeg": 5 }
  },
  "validation": {
    "seed": 7,
    "sampleCount": 40,
    "specs": {
      "maxOvershoot": 15,
      "maxSettlingTime": 8,
      "minPhaseMargin": 45,
      "maxPeakSensitivity": 2
    }
  }
}
```

## Output Schema

```json
{
  "pass": false,
  "failureCount": 3,
  "worstCase": {
    "sample": { "index": 12, "gain": 1.18 },
    "metrics": {
      "stable": true,
      "overshoot": 18.4,
      "settlingTime": 9.2,
      "phaseMargin": 41.5,
      "peakSensitivity": 2.3
    },
    "failedChecks": ["maxOvershoot", "maxSettlingTime", "minPhaseMargin"]
  }
}
```

## Decision Notes

- Use parametric uncertainty when coefficient or physical parameter ranges are known.
- Use additive uncertainty when model error is measured as `G_real - G_nominal`.
- Use multiplicative uncertainty when gain/phase uncertainty is specified at loop level.
- Use fixed seeds for every regression fixture.
- Include at least one nominal-pass / uncertainty-fail case in Phase 18 validation.
