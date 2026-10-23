import { fechaValida, sumarDias, weekday } from './tiempo.mjs';

// Plazo de carga y facturación, a mes vencido: el día cae en el mes siguiente
// a la atención. Si ese día es sábado o domingo, se adelanta al viernes.
//
// PAMI (500807), día 15. Las prestaciones informadas para la facturación
// unificada se transmiten hasta el 15 del mes subsiguiente.
// https://www.pami.org.ar/pdf/preguntas_presentacion_de_factura.pdf
//
// IOMA (902001), día 15. Los prestadores individuales presentan del 1 al 15,
// a mes vencido. Guía de facturación digital del IOMA.
//
// OSDE (400800), Swiss, Galeno, Prevención, Sancor (3009) y OSAP (800501),
// día 8. Es el cierre de proforma de las que se presentan por validador.
// El corte propio de OSDE, además, lo muestra la Extranet de cada prestador.
//
// El resto de las obras, día 10. Es la ventana habitual de presentación
// (del 1 al 10, mes vencido) cuando la obra no publica otro día.
// Particular no se factura.

const DIA_QUINCE = new Set(['500807', '902001']);
const DIA_OCHO = new Set(['400800', '3009', '800501']);

export function diaDeObra(rnos, formato) {
  if (!rnos || formato === 'ninguno') return null;
  if (DIA_QUINCE.has(rnos)) return 15;
  if (DIA_OCHO.has(rnos) || String(rnos).startsWith('PREPAGA-')) return 8;
  return 10;
}

function conCeros(numero) {
  return String(numero).padStart(2, '0');
}

function habil(anio, mes, dia) {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  let fecha = `${anio}-${conCeros(mes)}-${conCeros(Math.min(dia, ultimo))}`;
  const semana = weekday(fecha);
  if (semana === 6) fecha = sumarDias(fecha, -1);
  if (semana === 0) fecha = sumarDias(fecha, -2);
  return fecha;
}

export function venceDePrestacion(fecha, dia) {
  if (!fechaValida(fecha) || !dia) return '';
  const [anio, mes] = fecha.split('-').map(Number);
  const mesSiguiente = mes === 12 ? 1 : mes + 1;
  const anioSiguiente = mes === 12 ? anio + 1 : anio;
  return habil(anioSiguiente, mesSiguiente, dia);
}

export function diasEntre(desde, hasta) {
  const [anio, mes, dia] = desde.split('-').map(Number);
  const [anioHasta, mesHasta, diaHasta] = hasta.split('-').map(Number);
  const ms = Date.UTC(anioHasta, mesHasta - 1, diaHasta) - Date.UTC(anio, mes - 1, dia);
  return Math.round(ms / 86_400_000);
}

export function diasHabiles(desde, hasta) {
  if (!fechaValida(desde) || !fechaValida(hasta) || desde >= hasta) return 0;
  let cuenta = 0;
  let cursor = desde;
  for (let i = 0; i < 400 && cursor < hasta; i += 1) {
    cursor = sumarDias(cursor, 1);
    const dia = weekday(cursor);
    if (dia !== 0 && dia !== 6) cuenta += 1;
  }
  return cuenta;
}

export function nivelPlazo(dias, habiles = dias) {
  if (dias < 0) return 'paso';
  if (dias === 0) return 'rojo';
  if (habiles <= 5) return 'amarillo';
  return 'claro';
}

export function calorPlazo(dias) {
  if (dias >= 14) return 8;
  if (dias <= 2) return 100;
  return Math.round(8 + ((14 - dias) / 12) * 92);
}

export function cuandoPlazo(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(Date.UTC(anio, mes - 1, dia, 15)));
}

export function plazoAbierto({ rnos, formato, fechas, cargados, hoy }) {
  const dia = diaDeObra(rnos, formato);
  if (!dia) return null;
  const vistos = new Set();
  const abiertos = [];
  for (const fecha of fechas) {
    if (!fechaValida(fecha)) continue;
    const periodo = fecha.slice(0, 7);
    if (vistos.has(periodo) || cargados.has(periodo)) continue;
    vistos.add(periodo);
    const vence = venceDePrestacion(fecha, dia);
    const dias = diasEntre(hoy, vence);
    const habiles = diasHabiles(hoy, vence);
    const nivel = nivelPlazo(dias, habiles);
    if (nivel === 'paso') continue;
    abiertos.push({
      periodo,
      vence,
      dias,
      nivel,
      calor: calorPlazo(dias),
      cuando: cuandoPlazo(vence),
    });
  }
  abiertos.sort((a, b) => a.vence.localeCompare(b.vence));
  return abiertos[0] || null;
}

export function marcaPadron(validacion) {
  if (validacion?.estado === 'verificado_padron') return 'bien';
  if (validacion?.estado === 'padron_distinto' || validacion?.estado === 'fuera_de_padron') return 'mal';
  return '';
}
