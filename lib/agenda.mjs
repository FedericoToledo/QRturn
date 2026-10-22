import { randomBytes } from 'node:crypto';
import { getDb, getSetting } from './db.mjs';
import {
  ahoraBA,
  etiquetaLarga,
  fechaValida,
  horaAhora,
  horaDesdeMinutos,
  hoyBA,
  minutos,
  normalizarHora,
  selloBA,
  sumarDias,
  weekday,
} from './tiempo.mjs';

const ESTADOS = ['reservado', 'confirmado', 'atendido', 'ausente', 'cancelado'];
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function numeroSetting(clave, defecto, minimo, maximo) {
  const valor = Number(getSetting(clave, String(defecto)));
  if (!Number.isFinite(valor)) return defecto;
  return Math.min(maximo, Math.max(minimo, valor));
}

export function duracionMinutos() {
  return numeroSetting('duracion_min', 30, 10, 180);
}

function solapa(desdeA, hastaA, desdeB, hastaB) {
  return desdeA < hastaB && hastaA > desdeB;
}

function bloquesDelDia(fecha) {
  const base = getDb();
  const semanales = base.prepare('SELECT * FROM bloques WHERE fecha IS NULL AND weekday = ?').all(weekday(fecha));
  const puntuales = base.prepare('SELECT * FROM bloques WHERE fecha = ?').all(fecha);
  return { semanales, puntuales };
}

export function horasLibres(fecha, opciones = {}) {
  if (!fechaValida(fecha)) return [];
  const { semanales, puntuales } = bloquesDelDia(fecha);
  const consultorio = [
    ...semanales.filter((bloque) => bloque.tipo === 'consultorio'),
    ...puntuales.filter((bloque) => bloque.tipo === 'consultorio'),
  ];
  const ocupan = [
    ...semanales.filter((bloque) => bloque.tipo === 'clinica'),
    ...puntuales.filter((bloque) => bloque.tipo === 'clinica' || bloque.tipo === 'cerrado'),
  ];
  const paso = duracionMinutos();
  const propuestas = new Set();
  for (const bloque of consultorio) {
    let cursor = minutos(bloque.desde);
    const fin = minutos(bloque.hasta);
    while (cursor + paso <= fin) {
      propuestas.add(horaDesdeMinutos(cursor));
      cursor += paso;
    }
  }

  const turnos = getDb().prepare(`
    SELECT hora, duracion_min FROM turnos
    WHERE fecha = ? AND estado != 'cancelado'
  `).all(fecha);
  const anticipacion = numeroSetting('anticipacion_horas', 4, 0, 168) * 3_600_000;
  const limite = ahoraBA() + (opciones.saltearAnticipacion ? 0 : anticipacion);
  const ahora = ahoraBA() - 60_000;

  return [...propuestas].sort().filter((hora) => {
    const inicio = minutos(hora);
    const fin = inicio + paso;
    if (ocupan.some((bloque) => solapa(inicio, fin, minutos(bloque.desde), minutos(bloque.hasta)))) return false;
    if (turnos.some((turno) => solapa(inicio, fin, minutos(turno.hora), minutos(turno.hora) + Number(turno.duracion_min)))) return false;
    const sello = selloBA(fecha, hora);
    if (sello < ahora) return false;
    if (sello < limite) return false;
    return true;
  });
}

export function diasDisponibles() {
  const horizonte = numeroSetting('horizonte_dias', 21, 1, 60);
  const hoy = hoyBA();
  const dias = [];
  for (let i = 0; i < horizonte; i += 1) {
    const fecha = sumarDias(hoy, i);
    const horas = horasLibres(fecha);
    if (horas.length) dias.push({ fecha, horas });
  }
  return dias;
}

export function turnoVigente(dni) {
  const hoy = hoyBA();
  return getDb().prepare(`
    SELECT t.id, t.fecha, t.hora, t.estado, t.codigo
    FROM turnos t
    JOIN pacientes p ON p.id = t.paciente_id
    WHERE p.dni = ?
      AND t.estado IN ('reservado', 'confirmado')
      AND (t.fecha > ? OR (t.fecha = ? AND t.hora >= ?))
    ORDER BY t.fecha, t.hora
    LIMIT 1
  `).get(dni, hoy, hoy, horaAhora()) || null;
}

export function publicoTurno(turno, conCodigo) {
  if (!turno) return null;
  return {
    id: turno.id,
    fecha: turno.fecha,
    hora: turno.hora,
    estado: turno.estado,
    cuando: etiquetaLarga(turno.fecha),
    codigo: conCodigo ? turno.codigo : undefined,
  };
}

function codigoTurno() {
  const bytes = randomBytes(5);
  let codigo = '';
  for (let i = 0; i < 5; i += 1) codigo += ALFABETO[bytes[i] % ALFABETO.length];
  return codigo;
}

function guardarPaciente(datos) {
  const base = getDb();
  const ahora = new Date().toISOString();
  const validacion = JSON.stringify(datos.validacion || null);
  const existe = base.prepare('SELECT id FROM pacientes WHERE dni = ?').get(datos.dni);
  if (existe) {
    base.prepare(`
      UPDATE pacientes
      SET nombre = ?, apellido = ?, obra_id = ?, obra_otra = ?, nro_afiliado = ?, validacion = ?, actualizado = ?
      WHERE id = ?
    `).run(datos.nombre, datos.apellido, datos.obraId, datos.obraOtra, datos.nro, validacion, ahora, existe.id);
    return existe.id;
  }
  const info = base.prepare(`
    INSERT INTO pacientes (nombre, apellido, dni, obra_id, obra_otra, nro_afiliado, validacion, creado, actualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(datos.nombre, datos.apellido, datos.dni, datos.obraId, datos.obraOtra, datos.nro, validacion, ahora, ahora);
  return Number(info.lastInsertRowid);
}

export function crearTurno(datos, fecha, hora, opciones = {}) {
  if (!fechaValida(fecha) || !normalizarHora(hora)) {
    return { ok: false, error: 'Elegí un día y un horario.' };
  }
  const base = getDb();
  base.exec('BEGIN IMMEDIATE');
  try {
    const vigente = turnoVigente(datos.dni);
    if (vigente) {
      base.exec('ROLLBACK');
      return {
        ok: false,
        error: opciones.admin ? 'Esa persona ya tiene un turno activo.' : 'Ya tenés un turno reservado.',
        turno: publicoTurno(vigente, false),
      };
    }
    const libres = horasLibres(fecha, { saltearAnticipacion: !!opciones.saltearAnticipacion });
    if (!libres.includes(hora)) {
      base.exec('ROLLBACK');
      return { ok: false, error: 'Ese horario ya no está disponible.' };
    }
    const pacienteId = guardarPaciente(datos);
    const info = base.prepare(`
      INSERT INTO turnos (paciente_id, fecha, hora, duracion_min, estado, codigo, nota, creado)
      VALUES (?, ?, ?, ?, 'reservado', ?, '', ?)
    `).run(pacienteId, fecha, hora, duracionMinutos(), codigoTurno(), new Date().toISOString());
    base.exec('COMMIT');
    const turno = base.prepare('SELECT id, fecha, hora, estado, codigo FROM turnos WHERE id = ?').get(Number(info.lastInsertRowid));
    return { ok: true, turno: publicoTurno(turno, true) };
  } catch (error) {
    try { base.exec('ROLLBACK'); } catch { /* la transacción ya se cerró */ }
    if (String(error.message).includes('UNIQUE')) {
      return { ok: false, error: 'Ese horario acaba de ocuparse. Elegí otro.' };
    }
    throw error;
  }
}

export function cancelarPorCodigo(dni, codigo) {
  const normal = String(codigo || '').trim().toUpperCase();
  const turno = getDb().prepare(`
    SELECT t.id
    FROM turnos t
    JOIN pacientes p ON p.id = t.paciente_id
    WHERE p.dni = ? AND t.codigo = ? AND t.estado IN ('reservado', 'confirmado')
  `).get(dni, normal);
  if (!turno) return { ok: false, error: 'El código no coincide con un turno activo.' };
  getDb().prepare(`UPDATE turnos SET estado = 'cancelado' WHERE id = ?`).run(turno.id);
  return { ok: true };
}

export function cambiarEstado(id, estado) {
  if (!ESTADOS.includes(estado)) return false;
  const info = getDb().prepare('UPDATE turnos SET estado = ? WHERE id = ?').run(estado, Number(id));
  return info.changes > 0;
}

export function diaAdmin(fecha) {
  const dia = fechaValida(fecha) ? fecha : hoyBA();
  const { semanales, puntuales } = bloquesDelDia(dia);
  const turnos = getDb().prepare(`
    SELECT t.id, t.fecha, t.hora, t.duracion_min, t.estado, t.codigo, t.nota,
           p.nombre, p.apellido, p.dni, p.nro_afiliado, p.validacion, p.obra_otra,
           o.etiqueta AS obra
    FROM turnos t
    JOIN pacientes p ON p.id = t.paciente_id
    LEFT JOIN obras_sociales o ON o.id = p.obra_id
    WHERE t.fecha = ? AND t.estado != 'cancelado'
    ORDER BY t.hora
  `).all(dia).map((turno) => ({
    ...turno,
    validacion: turno.validacion ? JSON.parse(turno.validacion) : null,
    obra: turno.obra || turno.obra_otra || 'Sin obra social',
  }));
  return {
    fecha: dia,
    bloques: [...semanales, ...puntuales],
    turnos,
    libres: horasLibres(dia, { saltearAnticipacion: true }).filter((hora) => selloBA(dia, hora) >= ahoraBA() - 60_000),
  };
}

export function listarBloques() {
  return getDb().prepare(`
    SELECT * FROM bloques
    ORDER BY COALESCE(fecha, '0000'), weekday, desde
  `).all();
}

export function semanaTurnos(desde) {
  const inicio = fechaValida(desde) ? desde : hoyBA();
  const dias = [];
  for (let i = 0; i < 7; i += 1) {
    const fecha = sumarDias(inicio, i);
    const turnos = getDb().prepare(`
      SELECT t.id, t.hora, t.estado, p.apellido
      FROM turnos t
      JOIN pacientes p ON p.id = t.paciente_id
      WHERE t.fecha = ? AND t.estado != 'cancelado'
      ORDER BY t.hora
    `).all(fecha);
    const { semanales, puntuales } = bloquesDelDia(fecha);
    const ocupados = [...semanales, ...puntuales]
      .filter((bloque) => bloque.tipo !== 'consultorio')
      .map((bloque) => ({
        desde: bloque.desde,
        hasta: bloque.hasta,
        lugar: bloque.lugar,
        tipo: bloque.tipo,
      }));
    dias.push({ fecha, turnos, ocupados });
  }
  return { desde: inicio, hasta: sumarDias(inicio, 6), dias };
}

export function cambiarTipoBloque(id, tipo) {
  if (!['consultorio', 'clinica'].includes(tipo)) {
    return { ok: false, error: 'Elegí disponible u ocupada.' };
  }
  const bloque = getDb().prepare('SELECT * FROM bloques WHERE id = ?').get(Number(id));
  if (!bloque || bloque.fecha) return { ok: false, error: 'Esa franja no se puede cambiar así.' };
  const lugar = tipo === 'consultorio'
    ? 'Consultorio'
    : (bloque.lugar && bloque.lugar !== 'Consultorio' ? bloque.lugar : 'Horarios ocupados');
  getDb().prepare('UPDATE bloques SET tipo = ?, lugar = ? WHERE id = ?').run(tipo, lugar, bloque.id);
  return { ok: true };
}

export function agregarBloque({ weekday: dia, fecha, desde, hasta, tipo, lugar }) {
  const horaDesde = normalizarHora(desde);
  const horaHasta = normalizarHora(hasta);
  if (!horaDesde || !horaHasta || minutos(horaHasta) <= minutos(horaDesde)) {
    return { ok: false, error: 'El horario de fin tiene que ser posterior al de inicio.' };
  }
  if (!['consultorio', 'clinica', 'cerrado'].includes(tipo)) {
    return { ok: false, error: 'Elegí si es el consultorio, una clínica o un día cerrado.' };
  }
  let diaSemana = null;
  let fechaPuntual = null;
  if (fecha) {
    if (!fechaValida(fecha)) return { ok: false, error: 'La fecha no es válida.' };
    fechaPuntual = fecha;
  } else if (tipo === 'cerrado') {
    return { ok: false, error: 'Para cerrar un día, elegí la fecha.' };
  } else if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
    return { ok: false, error: 'Elegí el día de la semana.' };
  } else {
    diaSemana = dia;
  }
  const nombre = String(lugar || '').trim().slice(0, 60)
    || (tipo === 'consultorio' ? 'Consultorio' : tipo === 'cerrado' ? 'Cerrado' : 'Horarios ocupados');
  const info = getDb().prepare(`
    INSERT INTO bloques (weekday, fecha, desde, hasta, tipo, lugar)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(diaSemana, fechaPuntual, horaDesde, horaHasta, tipo, nombre);
  return { ok: true, id: Number(info.lastInsertRowid) };
}

export function borrarBloque(id) {
  const info = getDb().prepare('DELETE FROM bloques WHERE id = ?').run(Number(id));
  return info.changes > 0;
}

export function buscarPacientes(consulta) {
  const filas = getDb().prepare(`
    SELECT p.id, p.nombre, p.apellido, p.dni, p.nro_afiliado, p.validacion, p.obra_otra,
           o.etiqueta AS obra
    FROM pacientes p
    LEFT JOIN obras_sociales o ON o.id = p.obra_id
    ORDER BY p.apellido, p.nombre
  `).all();
  const texto = normConsulta(consulta);
  const lista = texto
    ? filas.filter((fila) => normConsulta(`${fila.apellido} ${fila.nombre} ${fila.dni} ${fila.obra || ''}`).includes(texto))
    : filas;
  return lista.slice(0, 50).map((fila) => ({
    ...fila,
    obra: fila.obra || fila.obra_otra || 'Particular',
    validacion: fila.validacion ? JSON.parse(fila.validacion) : null,
  }));
}

function normConsulta(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
