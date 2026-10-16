/**
 * Valida un RUT chileno.
 * Acepta formatos como 12.345.678-5 o 12345678-5.
 */
export function isValidRUT(rut: string): boolean {
  if (!rut || typeof rut !== 'string') return false;

  // Limpiar caracteres
  const cleanRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 2) return false;

  // Extraer cuerpo y DV
  const cuerpo = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);

  // Validar cuerpo numérico
  if (!/^[0-9]+$/.test(cuerpo)) return false;

  // Calcular DV
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

  return dv === dvCalculado;
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
