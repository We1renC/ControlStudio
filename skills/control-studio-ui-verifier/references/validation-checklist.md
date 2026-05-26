# UI Validation Checklist

## Layout

- No overlapping text or controls.
- Plot workspace has one primary full-width chart and two companion charts when required.
- Legends are visible for multi-series plots.
- Critical metrics are above the fold or pinned in the context bar.
- Sidebar sections are grouped and collapsible.

## Mode Behavior

- SISO and MIMO mode switches hide irrelevant controls.
- Stale results are cleared or explicitly marked stale.
- Unit labels and sample-time labels match the active domain.
- Advisor recommendations are scoped to the active mode.

## Engineering Content

- Formulas map to concrete mathematical expressions.
- Stability and robustness warnings include numeric evidence.
- MPC feasibility diagnostics identify constraints.
- SysID validation shows residual and model-order evidence.

## Accessibility

- Keyboard navigation reaches primary actions.
- Focus state is visible.
- Buttons have accessible labels.
- Text contrast remains readable in dark, light, and print themes.
