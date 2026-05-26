/**
 * plc_generator.js - Tier H3: IEC 61131-3 Structured Text templates.
 */

export function generateST({ controller = {}, name = 'FB_ControlStudioPID' } = {}) {
  const kp = Number(controller.kp ?? controller.Kp ?? 0);
  const ki = Number(controller.ki ?? controller.Ki ?? 0);
  const kd = Number(controller.kd ?? controller.Kd ?? 0);
  return `FUNCTION_BLOCK ${name}
VAR_INPUT
  Reference : LREAL;
  Measurement : LREAL;
  Dt : LREAL;
END_VAR
VAR_OUTPUT
  Control : LREAL;
END_VAR
VAR
  Integral : LREAL;
  PrevError : LREAL;
  Error : LREAL;
END_VAR
Error := Reference - Measurement;
Integral := Integral + Error * Dt;
Control := ${kp} * Error + ${ki} * Integral + ${kd} * ((Error - PrevError) / Dt);
PrevError := Error;
END_FUNCTION_BLOCK
`;
}

export default { generateST };
