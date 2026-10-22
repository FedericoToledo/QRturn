export function norm(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function limpiarNombre(valor) {
  const texto = String(valor || '').trim().replace(/\s+/g, ' ');
  if (texto.length < 2 || texto.length > 60) return '';
  if (!/^[\p{L}][\p{L}'’.\- ]+$/u.test(texto)) return '';
  return texto;
}

export function compactarNumero(valor) {
  return String(valor || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function csvCampo(valor) {
  const texto = String(valor ?? '');
  if (/[";\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}
