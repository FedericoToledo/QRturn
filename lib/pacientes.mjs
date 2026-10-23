import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, rutaDb } from './db.mjs';
import { revisarDatos } from './validar.mjs';

const TIPOS = {
  png: {
    mime: 'image/png',
    tipo: 'foto',
    firma: (buffer) => buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47,
  },
  jpg: {
    mime: 'image/jpeg',
    tipo: 'foto',
    firma: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  webp: {
    mime: 'image/webp',
    tipo: 'foto',
    firma: (buffer) => buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  },
  pdf: {
    mime: 'application/pdf',
    tipo: 'documento',
    firma: (buffer) => buffer.length > 4 && buffer.toString('ascii', 0, 4) === '%PDF',
  },
  txt: {
    mime: 'text/plain; charset=utf-8',
    tipo: 'documento',
    firma: (buffer) => {
      if (buffer.includes(0)) return false;
      const texto = buffer.toString('utf8');
      return texto.length > 0 && !texto.includes('\uFFFD');
    },
  },
};

function carpetaPaciente(id) {
  const base = path.basename(rutaDb, path.extname(rutaDb));
  const nombre = base === 'dentapp' ? 'pacientes' : `${base}.pacientes`;
  return path.join(path.dirname(rutaDb), nombre, String(id));
}

function pacienteDe(id) {
  return getDb().prepare('SELECT id FROM pacientes WHERE id = ?').get(Number(id));
}

function textoClinico(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

export function listarHistoria(pacienteId) {
  if (!pacienteDe(pacienteId)) return [];
  return getDb().prepare(`
    SELECT id, diagnostico, anotacion, creado
    FROM historia WHERE paciente_id = ? ORDER BY creado, id
  `).all(Number(pacienteId));
}

export function crearHistoria(pacienteId, diagnostico, anotacion) {
  if (!pacienteDe(pacienteId)) return { ok: false, error: 'No encontré a ese paciente.' };
  const diag = textoClinico(diagnostico);
  const nota = textoClinico(anotacion);
  if (!diag && !nota) return { ok: false, error: 'Escribí el diagnóstico o una anotación.' };
  const info = getDb().prepare(`
    INSERT INTO historia (paciente_id, diagnostico, anotacion, creado) VALUES (?, ?, ?, ?)
  `).run(Number(pacienteId), diag, nota, new Date().toISOString());
  return { ok: true, id: Number(info.lastInsertRowid) };
}

export function listarArchivos(pacienteId, tipo) {
  if (!pacienteDe(pacienteId)) return [];
  const filtro = tipo === 'foto' || tipo === 'documento' ? ' AND tipo = ?' : '';
  const params = filtro ? [Number(pacienteId), tipo] : [Number(pacienteId)];
  return getDb().prepare(`
    SELECT id, tipo, nombre, creado FROM paciente_archivos
    WHERE paciente_id = ?${filtro} ORDER BY creado, id
  `).all(...params);
}

function leerImagen(dataUrl) {
  const coincidencia = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp)|application\/pdf|text\/plain)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!coincidencia) return { ok: false, error: 'Subí una foto (JPG, PNG o WebP) o un texto (PDF o TXT).' };
  const mime = coincidencia[1].toLowerCase();
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'application/pdf' ? 'pdf' : mime === 'text/plain' ? 'txt' : 'jpg';
  let buffer;
  try {
    buffer = Buffer.from(coincidencia[2].replace(/\s/g, ''), 'base64');
  } catch {
    return { ok: false, error: 'No pude leer ese archivo.' };
  }
  const minimo = ext === 'txt' ? 1 : 8;
  if (buffer.length < minimo || buffer.length > 6_000_000 || !TIPOS[ext].firma(buffer)) {
    return { ok: false, error: 'Ese archivo no sirve. Usá una foto, un PDF o un texto de hasta 6 MB.' };
  }
  return { ok: true, ext, buffer, tipo: TIPOS[ext].tipo, mime: TIPOS[ext].mime };
}

export function guardarArchivo(pacienteId, nombre, dataUrl, tipoPedido) {
  if (!pacienteDe(pacienteId)) return { ok: false, error: 'No encontré a ese paciente.' };
  const leido = leerImagen(dataUrl);
  if (!leido.ok) return leido;
  const tipo = leido.tipo;
  const titulo = textoClinico(nombre) || (tipo === 'foto' ? 'Foto' : 'Documento');
  const archivo = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${leido.ext}`;
  const carpeta = carpetaPaciente(pacienteId);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(path.join(carpeta, archivo), leido.buffer);
  const info = getDb().prepare(`
    INSERT INTO paciente_archivos (paciente_id, tipo, nombre, archivo, creado) VALUES (?, ?, ?, ?, ?)
  `).run(Number(pacienteId), tipo, titulo, archivo, new Date().toISOString());
  return { ok: true, id: Number(info.lastInsertRowid), tipo };
}

export function abrirArchivo(pacienteId, archivoId) {
  const fila = getDb().prepare(`
    SELECT id, tipo, nombre, archivo FROM paciente_archivos WHERE id = ? AND paciente_id = ?
  `).get(Number(archivoId), Number(pacienteId));
  if (!fila || fila.archivo.includes('..') || fila.archivo.includes('/') || fila.archivo.includes('\\')) return null;
  const ruta = path.join(carpetaPaciente(pacienteId), fila.archivo);
  if (!existsSync(ruta)) return null;
  const ext = path.extname(fila.archivo).slice(1);
  return { ...fila, mime: TIPOS[ext]?.mime || 'application/octet-stream', buffer: readFileSync(ruta) };
}

export function borrarArchivo(pacienteId, archivoId) {
  const fila = getDb().prepare(`
    SELECT archivo FROM paciente_archivos WHERE id = ? AND paciente_id = ?
  `).get(Number(archivoId), Number(pacienteId));
  if (!fila) return { ok: false, error: 'No encontré ese archivo.' };
  const ruta = path.join(carpetaPaciente(pacienteId), fila.archivo);
  if (existsSync(ruta)) unlinkSync(ruta);
  getDb().prepare('DELETE FROM paciente_archivos WHERE id = ?').run(Number(archivoId));
  return { ok: true };
}

export function editarPaciente(pacienteId, cuerpo) {
  const actual = getDb().prepare('SELECT id FROM pacientes WHERE id = ?').get(Number(pacienteId));
  if (!actual) return { ok: false, error: 'No encontré a ese paciente.' };
  const obraTexto = String(cuerpo?.obra || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const obra = obraTexto
    ? getDb().prepare('SELECT id FROM obras_sociales WHERE etiqueta = ? COLLATE NOCASE').get(obraTexto)
    : null;
  const revisado = revisarDatos({
    nombre: cuerpo?.nombre,
    apellido: cuerpo?.apellido,
    dni: cuerpo?.dni,
    obraId: obra ? obra.id : null,
    obraOtra: obra ? '' : obraTexto,
    nro: cuerpo?.nro,
  });
  if (!revisado.ok) return { ok: false, error: revisado.errores[0] };
  const otro = getDb().prepare('SELECT id FROM pacientes WHERE dni = ? AND id != ?').get(revisado.datos.dni, actual.id);
  if (otro) return { ok: false, error: 'Ese DNI ya está en otro paciente.' };
  getDb().prepare(`
    UPDATE pacientes
    SET nombre = ?, apellido = ?, dni = ?, obra_id = ?, obra_otra = ?, nro_afiliado = ?, validacion = ?, actualizado = ?
    WHERE id = ?
  `).run(
    revisado.datos.nombre,
    revisado.datos.apellido,
    revisado.datos.dni,
    revisado.datos.obraId,
    revisado.datos.obraOtra,
    revisado.datos.nro,
    JSON.stringify(revisado.datos.validacion || null),
    new Date().toISOString(),
    actual.id,
  );
  return { ok: true };
}

export function borrarPaciente(pacienteId) {
  const id = Number(pacienteId);
  const actual = getDb().prepare('SELECT id FROM pacientes WHERE id = ?').get(id);
  if (!actual) return { ok: false, error: 'No encontré a ese paciente.' };
  const base = getDb();
  base.exec('BEGIN IMMEDIATE');
  try {
    base.prepare('DELETE FROM turnos WHERE paciente_id = ?').run(id);
    base.prepare('DELETE FROM historia WHERE paciente_id = ?').run(id);
    base.prepare('DELETE FROM paciente_archivos WHERE paciente_id = ?').run(id);
    base.prepare('DELETE FROM paciente_carga WHERE paciente_id = ?').run(id);
    base.prepare('DELETE FROM pacientes WHERE id = ?').run(id);
    base.exec('COMMIT');
  } catch {
    base.exec('ROLLBACK');
    return { ok: false, error: 'No pude eliminar a ese paciente.' };
  }
  rmSync(carpetaPaciente(id), { recursive: true, force: true });
  return { ok: true };
}

export function marcarCarga(pacienteId, periodo) {
  if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return { ok: false, error: 'Ese período no es válido.' };
  if (!pacienteDe(pacienteId)) return { ok: false, error: 'No encontré a ese paciente.' };
  const tiene = getDb().prepare(`
    SELECT 1 AS ok FROM turnos
    WHERE paciente_id = ? AND estado != 'cancelado' AND fecha LIKE ?
  `).get(Number(pacienteId), `${periodo}-%`);
  if (!tiene) return { ok: false, error: 'Ese mes no tiene un turno para facturar.' };
  getDb().prepare(`
    INSERT INTO paciente_carga (paciente_id, periodo, cargada_en) VALUES (?, ?, ?)
    ON CONFLICT(paciente_id, periodo) DO UPDATE SET cargada_en = excluded.cargada_en
  `).run(Number(pacienteId), periodo, new Date().toISOString());
  return { ok: true };
}
