const ZONA = 'America/Argentina/Buenos_Aires';

function partesDe(fecha) {
  const formato = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const partes = {};
  for (const parte of formato.formatToParts(fecha)) partes[parte.type] = parte.value;
  let hora = partes.hour;
  if (hora === '24') hora = '00';
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${hora}:${partes.minute}`,
  };
}

export function hoyBA(desde = new Date()) {
  return partesDe(desde).fecha;
}

export function horaAhora(desde = new Date()) {
  return partesDe(desde).hora;
}

export function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const armada = new Date(Date.UTC(anio, mes - 1, dia));
  return armada.getUTCFullYear() === anio && armada.getUTCMonth() === mes - 1 && armada.getUTCDate() === dia;
}

export function normalizarHora(valor) {
  const coincidencia = String(valor || '').match(/^(\d{2}):(\d{2})/);
  if (!coincidencia) return '';
  const hora = Number(coincidencia[1]);
  const minuto = Number(coincidencia[2]);
  if (hora > 23 || minuto > 59) return '';
  return `${coincidencia[1]}:${coincidencia[2]}`;
}

export function selloBA(fecha, hora) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [horas, minutos] = hora.split(':').map(Number);
  const candidato = Date.UTC(anio, mes - 1, dia, horas + 3, minutos, 0, 0);
  const objetivo = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  for (const ajuste of [0, 1, -1, 2, -2]) {
    const instante = candidato + ajuste * 3_600_000;
    const obtenido = partesDe(new Date(instante));
    if (obtenido.fecha === fecha && obtenido.hora === objetivo) return instante;
  }
  return candidato;
}

export function ahoraBA(desde = new Date()) {
  const partes = partesDe(desde);
  return selloBA(partes.fecha, partes.hora);
}

export function sumarDias(fecha, dias) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const armada = new Date(Date.UTC(anio, mes - 1, dia + dias));
  const mesTexto = String(armada.getUTCMonth() + 1).padStart(2, '0');
  const diaTexto = String(armada.getUTCDate()).padStart(2, '0');
  return `${armada.getUTCFullYear()}-${mesTexto}-${diaTexto}`;
}

export function weekday(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

export function minutos(hora) {
  const [horas, mins] = hora.split(':').map(Number);
  return horas * 60 + mins;
}

export function horaDesdeMinutos(total) {
  const horas = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function etiquetaLarga(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const armada = new Date(Date.UTC(anio, mes - 1, dia, 15));
  const texto = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: ZONA,
  }).format(armada);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function etiquetaCorta(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const armada = new Date(Date.UTC(anio, mes - 1, dia, 15));
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    timeZone: ZONA,
  }).format(armada).replace(/\./g, '');
}
