/**
 * Utilidades de validación y formateo de RUT chileno.
 * Implementa el algoritmo oficial Módulo 11 del Servicio de Impuestos Internos (SII)
 * y Registro Civil de Chile.
 */

/**
 * Limpia cualquier caracter ajeno a números y la letra K.
 */
export function cleanRUT(rut: string): string {
  if (!rut || typeof rut !== 'string') return '';
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Calcula el Dígito Verificador (DV) oficial mediante el algoritmo Módulo 11.
 * @param cuerpo Cadena numérica con los dígitos base del RUT (sin puntos ni guion)
 */
export function calculateRUTdv(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;

  // Recorrer el cuerpo de derecha a izquierda
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i), 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const dvEsperado = 11 - (suma % 11);
  if (dvEsperado === 11) return '0';
  if (dvEsperado === 10) return 'K';
  return dvEsperado.toString();
}

/**
 * Valida un RUT chileno de manera estricta aplicando el algoritmo oficial Módulo 11.
 * Rechaza cualquier RUT con dígito verificador inválido o longitud fuera de norma.
 */
export function isValidRUT(rut: string): boolean {
  if (!rut || typeof rut !== 'string') return false;

  const cleanRut = cleanRUT(rut);
  // Un RUT chileno real tiene entre 7 caracteres (ej: 6 dígitos cuerpo + 1 DV) y 9 caracteres (8 dígitos cuerpo + 1 DV)
  if (cleanRut.length < 7 || cleanRut.length > 9) return false;

  const cuerpo = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);

  if (!/^[0-9]+$/.test(cuerpo)) return false;

  const dvCalculado = calculateRUTdv(cuerpo);
  return dv === dvCalculado;
}

/**
 * Valida un RUT y devuelve un objeto descriptivo con el estado y motivo de error si no es válido.
 */
export function validateRUT(rut: string): { valid: boolean; formatted: string; error?: string } {
  if (!rut || !rut.trim()) {
    return { valid: false, formatted: '', error: 'El RUT es obligatorio.' };
  }

  const clean = cleanRUT(rut);
  const formatted = formatRUT(clean);

  if (clean.length < 7) {
    return { valid: false, formatted, error: 'RUT incompleto (mínimo 7 dígitos con su verificador).' };
  }

  if (clean.length > 9) {
    return { valid: false, formatted, error: 'RUT inválido (excede la longitud máxima permitida).' };
  }

  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);

  if (!/^[0-9]+$/.test(cuerpo)) {
    return { valid: false, formatted, error: 'El cuerpo del RUT solo debe contener dígitos numéricos.' };
  }

  const dvCalculado = calculateRUTdv(cuerpo);
  if (dv !== dvCalculado) {
    return {
      valid: false,
      formatted,
      error: `Dígito verificador inválido (ingresó "${dv}", pero el dígito matemático correcto es "${dvCalculado}").`,
    };
  }

  return { valid: true, formatted };
}

/**
 * Formatea un RUT a formato estándar chileno con puntos y guion: XX.XXX.XXX-X
 */
export function formatRUT(rut: string): string {
  if (!rut) return '';
  const cleanRut = cleanRUT(rut);
  if (cleanRut.length <= 1) return cleanRut;

  const dv = cleanRut.slice(-1);
  let cuerpo = cleanRut.slice(0, -1);

  cuerpo = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${cuerpo}-${dv}`;
}
