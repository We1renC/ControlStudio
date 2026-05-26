# SysID Validation Checklist

## Data Checks

- Inputs and outputs are synchronized.
- Sample time is known and constant.
- Excitation covers the bandwidth of interest.
- Actuator saturation and clipping are recorded.
- Missing samples are handled explicitly.

## Model Checks

- Candidate orders are compared on validation data.
- Fit percentage is not the only acceptance criterion.
- Residuals are approximately white.
- Residuals are not correlated with past inputs.
- Poles and zeros are physically plausible or flagged.

## Handoff Checks

- Export uncertainty when the model feeds robust design.
- Record continuous/discrete domain and sample time.
- Include rejected model families and the reason they were rejected.
