/**
 * c_generator.js - Tier H1: C/C++ controller code generation baseline.
 */

function pidParams(controller = {}) {
  return {
    kp: Number(controller.kp ?? controller.Kp ?? 0),
    ki: Number(controller.ki ?? controller.Ki ?? 0),
    kd: Number(controller.kd ?? controller.Kd ?? 0),
  };
}

export function generateC({ controller = {}, plant = {}, dt = 0.001, options = {} } = {}) {
  const { kp, ki, kd } = pidParams(controller);
  const fixedPoint = !!options.fixedPoint;
  const qFormat = options.qFormat ?? 'Q15';
  const header = `#ifndef CONTROLSTUDIO_CONTROLLER_H
#define CONTROLSTUDIO_CONTROLLER_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  double kp;
  double ki;
  double kd;
  double integral;
  double prev_error;
} CS_PID;

void cs_pid_init(CS_PID* pid);
double cs_pid_step(CS_PID* pid, double reference, double measurement);

#ifdef __cplusplus
}
#endif

#endif
`;
  const source = `#include "controller.h"

#define CS_DT (${dt})
#define CS_KP (${kp})
#define CS_KI (${ki})
#define CS_KD (${kd})
${fixedPoint ? `#define CS_FIXED_POINT_${qFormat} 1\n#define CS_Q_SCALE (${qFormat === 'Q31' ? '2147483648.0' : '32768.0'})` : ''}

void cs_pid_init(CS_PID* pid) {
  pid->kp = CS_KP;
  pid->ki = CS_KI;
  pid->kd = CS_KD;
  pid->integral = 0.0;
  pid->prev_error = 0.0;
}

double cs_pid_step(CS_PID* pid, double reference, double measurement) {
  const double error = reference - measurement;
  pid->integral += error * CS_DT;
  const double derivative = (error - pid->prev_error) / CS_DT;
  pid->prev_error = error;
  return pid->kp * error + pid->ki * pid->integral + pid->kd * derivative;
}
`;
  return {
    files: {
      'controller.h': header,
      'controller.c': source,
      ...(options.cmsis ? { 'cmsis_adapter.h': '/* CMSIS-DSP adapter hook for static-array controller kernels. */\n' } : {}),
    },
    metadata: { fixedPoint, isrSafe: !!options.isr, plantOrder: plant.order ?? null },
  };
}

export function generateCMake(project = 'controlstudio_controller') {
  return `cmake_minimum_required(VERSION 3.16)
project(${project} C)
add_library(controlstudio_controller STATIC controller.c)
target_include_directories(controlstudio_controller PUBLIC \${CMAKE_CURRENT_SOURCE_DIR})
`;
}

export default { generateC, generateCMake };
