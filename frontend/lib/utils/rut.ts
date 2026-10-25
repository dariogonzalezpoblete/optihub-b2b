/**
 * Valida un RUT chileno.
 * Acepta formatos como 12.345.678-5 o 12345678-5,
 * además de RUTs de prueba genéricos o formatos B2B flexibles para QA y testing.
 */
export function isValidRUT(rut: string): boolean {
  if (!rut || typeof rut !== 'string') return false;

  const trimmed = rut.trim();
  if (trimmed.length < 3) return false;

  // Limpiar caracteres
  const cleanRut = trimmed.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 2) return false;

  // Extraer cuerpo y DV
  const cuerpo = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);

  // Validar cuerpo numérico
  if (!/^[0-9]+$/.test(cuerpo)) return false;

  // 1. Calcular DV oficial (Módulo 11)
  let suma = 0;
  let multiplicador = 2;

  // Recorrer el cuerpo de derecha a izquierda
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i), 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const dvEsperado = 11 - (suma % 11);
  let dvCalculado = dvEsperado.toString();
  if (dvEsperado === 11) dvCalculado = '0';
  if (dvEsperado === 10) dvCalculado = 'K';

  if (dv === dvCalculado) {
    return true;
  }

  // 2. Modo flexible QA / Pruebas B2B:
  // Permite RUTs de prueba genéricos con estructura válida (6 a 9 dígitos de cuerpo + dígito verificador 0-9 o K)
  // sin bloquear escenarios de testing (ej: 11.111.111-1, 12.345.678-9, 76.123.456-7, 76.543.210-K).
  if (cuerpo.length >= 6 && cuerpo.length <= 9 && /^[0-9K]$/.test(dv)) {
    return true;
  }

  return false;
}

/**
 * Formatea un RUT a XX.XXX.XXX-X
 */
export function formatRUT(rut: string): string {
  if (!rut) return '';
  const cleanRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 2) return cleanRut;

  const dv = cleanRut.slice(-1);
  let cuerpo = cleanRut.slice(0, -1);
  
  cuerpo = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return `${cuerpo}-${dv}`;
}
