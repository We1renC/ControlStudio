# ControlStudio System Audit

Status: caution

Evidence:
- Closed-loop poles: all stable
- Phase margin: below target
- Peak sensitivity: medium risk
- Controllability: full rank
- Observability: full rank

Required follow-up:
- Retune controller for phase margin.
- Run robust validation before treating the design as deployable.
- Add a regression fixture if this is a new plant family.
