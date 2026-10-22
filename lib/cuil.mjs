const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function digitoVerificador(diez) {
  let suma = 0;
  for (let i = 0; i < 10; i += 1) suma += Number(diez[i]) * PESOS[i];
  const resto = suma % 11;
  const digito = 11 - resto;
  if (digito === 11) return 0;
  if (digito === 10) return null;
  return digito;
}

export function digitosCuilValidos(once) {
  if (!/^\d{11}$/.test(once)) return false;
  const esperado = digitoVerificador(once.slice(0, 10));
  if (esperado == null) return false;
  return Number(once[10]) === esperado;
}

export function dniDentroDeCuil(once, dni) {
  const embebido = once.slice(2, 10).replace(/^0+/, '');
  const limpio = String(dni).replace(/^0+/, '');
  return embebido === limpio;
}

export function armarCuil(prefijo, dni) {
  const base = `${prefijo}${String(dni).padStart(8, '0')}`;
  const digito = digitoVerificador(base);
  if (digito == null) return '';
  return `${base}${digito}`;
}
