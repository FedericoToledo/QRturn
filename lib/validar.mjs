import { validarAfiliado } from './afiliado.mjs';
import { consultarPadron, obraPorId } from './db.mjs';
import { limpiarNombre } from './texto.mjs';

export function validarDni(valor) {
  const dni = String(valor || '').replace(/\D/g, '');
  if (!/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) {
    return { ok: false, error: 'El DNI tiene 7 u 8 números, sin puntos.' };
  }
  return { ok: true, dni };
}

export function revisarDatos(cuerpo) {
  const nombre = limpiarNombre(cuerpo.nombre);
  const apellido = limpiarNombre(cuerpo.apellido);
  const documento = validarDni(cuerpo.dni);
  const errores = [];
  if (!nombre) errores.push('Escribí el nombre.');
  if (!apellido) errores.push('Escribí el apellido.');
  if (!documento.ok) errores.push(documento.error);

  const obraOtra = String(cuerpo.obraOtra || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  let obra = null;
  let formato = 'libre';
  if (obraOtra) {
    formato = 'libre';
  } else if (cuerpo.obraId) {
    obra = obraPorId(cuerpo.obraId);
    if (!obra) errores.push('Elegí una obra social de la lista.');
    else formato = obra.formato;
  } else {
    errores.push('Elegí la obra social.');
  }

  if (errores.length) return { ok: false, errores };

  const padron = obra ? consultarPadron(obra.id, documento.dni) : { tienePadron: false, delDni: [], estricto: false };
  const validacion = validarAfiliado({
    dni: documento.dni,
    nro: cuerpo.nro,
    formato,
    padron,
  });

  const soloPadron = !validacion.puede && (validacion.estado === 'padron_distinto' || validacion.estado === 'fuera_de_padron');
  return {
    ok: validacion.puede || soloPadron,
    errores: validacion.puede || soloPadron ? [] : [validacion.detalle],
    validacion,
    obra,
    datos: {
      nombre,
      apellido,
      dni: documento.dni,
      obraId: obra ? obra.id : null,
      obraOtra,
      nro: formato === 'ninguno' ? '' : String(cuerpo.nro || '').trim(),
      validacion,
    },
  };
}
