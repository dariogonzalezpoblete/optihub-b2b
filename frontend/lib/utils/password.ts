/**
 * Utilidades de validación de seguridad de contraseñas para OptiHub B2B.
 * Reglas requeridas:
 * - Mínimo 8 caracteres
 * - Al menos una letra mayúscula (A-Z)
 * - Al menos una letra minúscula (a-z)
 * - Al menos un número (0-9)
 */

export interface PasswordRulesState {
  hasMinLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  matchesConfirm: boolean;
  valid: boolean;
  error?: string;
}

export function checkPasswordRules(password: string, confirmPassword?: string): PasswordRulesState {
  const pwd = password || '';
  const hasMinLength = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const matchesConfirm = confirmPassword !== undefined ? pwd === (confirmPassword || '') : true;

  let error: string | undefined;

  if (!hasMinLength) {
    error = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (!hasUpper) {
    error = 'La contraseña debe incluir al menos una letra mayúscula (A-Z).';
  } else if (!hasLower) {
    error = 'La contraseña debe incluir al menos una letra minúscula (a-z).';
  } else if (!hasNumber) {
    error = 'La contraseña debe incluir al menos un número (0-9).';
  } else if (confirmPassword !== undefined && !matchesConfirm) {
    error = 'Las contraseñas no coinciden.';
  }

  const valid = hasMinLength && hasUpper && hasLower && hasNumber && matchesConfirm;

  return {
    hasMinLength,
    hasUpper,
    hasLower,
    hasNumber,
    matchesConfirm,
    valid,
    error,
  };
}

export function validatePasswordInput(
  password: string,
  confirmPassword?: string
): { valid: boolean; error?: string } {
  const result = checkPasswordRules(password, confirmPassword);
  return {
    valid: result.valid,
    error: result.error,
  };
}
