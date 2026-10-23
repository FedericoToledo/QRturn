import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvCampo, norm } from './texto.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const directorioDatos = path.join(raiz, 'data');
export const rutaDb = process.env.DENTAPP_DB || path.join(directorioDatos, 'dentapp.sqlite');
const rutaFuente = path.join(directorioDatos, 'fuentes', 'rnas-sisa.json');

let db;

const ORDEN_FRECUENTES = [
  'PARTICULAR',
  '902001',
  '500807',
  '400800',
  '800501',
  '126205',
  'PREPAGA-SWISS',
  'PREPAGA-GALENO',
];

const ETIQUETAS = {
  '500807': 'PAMI',
  '902001': 'IOMA',
  '400800': 'OSDE',
  '800501': 'OSAP — Aceros Paraná',
  '126205': 'OSECAC',
  '106500': 'OSPERYH',
  '108803': 'OSUTHGRA',
  '115300': 'OSPE',
  '3207': 'Jerárquicos Salud',
  '3009': 'Sancor Salud',
  '1102': 'OSPLAD',
  '901': 'OSSEG',
  '401704': 'OSDEPYM',
  '402202': 'OSMITA',
  '402004': 'Luis Pasteur',
  '997001': 'Incluir Salud',
  PARTICULAR: 'Particular',
};

const SIGLAS = {
  '500807': 'PAMI',
  '800501': 'OSAP',
  '3207': 'JERÁRQUICOS',
  '3009': 'SANCOR',
  '902001': 'IOMA',
  '997001': 'INCLUIR SALUD',
};

const PREPAGAS = [
  ['PREPAGA-SWISS', 'Swiss Medical', 'Swiss Medical'],
  ['PREPAGA-GALENO', 'Galeno', 'Galeno'],
  ['PREPAGA-OMINT', 'Omint', 'Omint'],
  ['PREPAGA-MEDICUS', 'Medicus', 'Medicus'],
  ['PREPAGA-MEDIFE', 'Medifé', 'Medifé'],
  ['PREPAGA-AVALIAN', 'Avalian', 'Avalian'],
  ['PREPAGA-PREVENCION', 'Prevención Salud', 'Prevención Salud'],
  ['PREPAGA-ACCORD', 'Accord Salud', 'Accord Salud'],
];

let cacheObras = [];

function rutaClave() {
  if (process.env.DENTAPP_DB) return path.join(path.dirname(rutaDb), 'clave-de-prueba.txt');
  return path.join(directorioDatos, 'clave-inicial.txt');
}

export function getDb() {
  if (!db) abrir();
  return db;
}

export function abrir() {
  fs.mkdirSync(path.dirname(rutaDb), { recursive: true });
  db = new DatabaseSync(rutaDb);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  migrar();
  sembrar();
  importarObrasSiFalta();
  refrescarObras();
  return db;
}

function migrar() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS obras_sociales (
      id INTEGER PRIMARY KEY,
      rnos TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      sigla TEXT NOT NULL DEFAULT '',
      etiqueta TEXT NOT NULL,
      provincia TEXT NOT NULL DEFAULT '',
      localidad TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL,
      frecuente INTEGER NOT NULL DEFAULT 0,
      formato TEXT NOT NULL,
      fuente TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS padron_afiliados (
      id INTEGER PRIMARY KEY,
      obra_id INTEGER NOT NULL REFERENCES obras_sociales(id),
      dni TEXT NOT NULL,
      nro_afiliado TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_padron_unico
      ON padron_afiliados(obra_id, dni, nro_afiliado);
    CREATE INDEX IF NOT EXISTS idx_padron_dni ON padron_afiliados(obra_id, dni);

    CREATE TABLE IF NOT EXISTS pacientes (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      dni TEXT NOT NULL UNIQUE,
      obra_id INTEGER REFERENCES obras_sociales(id),
      obra_otra TEXT NOT NULL DEFAULT '',
      nro_afiliado TEXT NOT NULL DEFAULT '',
      validacion TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL,
      actualizado TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bloques (
      id INTEGER PRIMARY KEY,
      weekday INTEGER,
      fecha TEXT,
      desde TEXT NOT NULL,
      hasta TEXT NOT NULL,
      tipo TEXT NOT NULL,
      lugar TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id INTEGER PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      duracion_min INTEGER NOT NULL,
      estado TEXT NOT NULL,
      codigo TEXT NOT NULL,
      nota TEXT NOT NULL DEFAULT '',
      patologia TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_turno_activo
      ON turnos(fecha, hora) WHERE estado != 'cancelado';

    CREATE TABLE IF NOT EXISTS patologias (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
      minutos INTEGER NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS historia (
      id INTEGER PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
      diagnostico TEXT NOT NULL DEFAULT '',
      anotacion TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paciente_archivos (
      id INTEGER PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      archivo TEXT NOT NULL,
      creado TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paciente_carga (
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
      periodo TEXT NOT NULL,
      cargada_en TEXT NOT NULL,
      PRIMARY KEY (paciente_id, periodo)
    );

    CREATE TABLE IF NOT EXISTS vacaciones (
      id INTEGER PRIMARY KEY,
      desde TEXT NOT NULL,
      hasta TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vacaciones_rango ON vacaciones(desde, hasta);
  `);
  const columnasTurno = db.prepare('PRAGMA table_info(turnos)').all().map((columna) => columna.name);
  if (!columnasTurno.includes('patologia')) {
    db.exec("ALTER TABLE turnos ADD COLUMN patologia TEXT NOT NULL DEFAULT ''");
  }
}

function asegurar(clave, valor) {
  const existe = db.prepare('SELECT 1 AS ok FROM settings WHERE key = ?').get(clave);
  if (!existe) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(clave, valor);
}

export function getSetting(clave, defecto = '') {
  const fila = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(clave);
  return fila ? fila.value : defecto;
}

export function setSetting(clave, valor) {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(clave, String(valor));
}

export function setPin(pin) {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(String(pin), sal, 32).toString('hex');
  setSetting('pin_salt', sal);
  setSetting('pin_hash', hash);
  fs.mkdirSync(path.dirname(rutaClave()), { recursive: true });
  fs.writeFileSync(rutaClave(), `Clave de la agenda: ${pin}\nCambiala desde Ajustes cuando quieras.\n`, 'utf8');
}

export function checkPin(pin) {
  const sal = getSetting('pin_salt');
  const hash = getSetting('pin_hash');
  if (!sal || !hash || !/^\d{6}$/.test(String(pin || ''))) return false;
  const recibido = scryptSync(String(pin), sal, 32);
  const guardado = Buffer.from(hash, 'hex');
  if (recibido.length !== guardado.length) return false;
  return timingSafeEqual(recibido, guardado);
}

export function crearSesion() {
  const token = randomBytes(24).toString('hex');
  const vence = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  getDb().prepare('INSERT INTO sesiones (token, expires_at) VALUES (?, ?)').run(token, vence);
  return token;
}

export function sesionValida(token) {
  if (!token) return false;
  const fila = getDb().prepare('SELECT expires_at FROM sesiones WHERE token = ?').get(token);
  if (!fila) return false;
  return new Date(fila.expires_at).getTime() > Date.now();
}

export function borrarSesion(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

function sembrar() {
  if (!db.prepare('SELECT 1 AS ok FROM settings WHERE key = ?').get('pin_hash')) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    setPin(pin);
  }
  const valores = {
    marca: 'Dent.',
    profesional: 'Alejandra Reverter',
    matricula: '61.178',
    direccion: 'Urquiza 300, San Nicolás de los Arroyos',
    bajada: 'Dejá tus datos y elegí un horario para que Alejandra te reciba.',
    duracion_min: '30',
    horizonte_dias: '21',
    anticipacion_horas: '4',
    url_publica: '',
    padron_estricto: '0',
    tema: 'turquesa',
    fuente: 'fraunces',
  };
  for (const [clave, valor] of Object.entries(valores)) asegurar(clave, valor);
  const bajadasAnteriores = [
    'El consultorio de casa permanece cerrado durante el día. Dejá tus datos y elegí un horario para que Alejandra te reciba.',
    'El consultorio permanece cerrado durante el día. Dejá tus datos y elegí un horario para que Alejandra te reciba.',
  ];
  const bajadaActual = db.prepare('SELECT value FROM settings WHERE key = ?').get('bajada')?.value;
  if (bajadasAnteriores.includes(bajadaActual)) setSetting('bajada', valores.bajada);

  db.prepare(`UPDATE bloques SET lugar = ? WHERE lugar = ?`).run('Horarios ocupados', 'Otra clínica');
  sembrarPatologias();

  const hayBloques = db.prepare('SELECT 1 AS ok FROM bloques LIMIT 1').get();
  if (hayBloques) return;
  const insertar = db.prepare(`
    INSERT INTO bloques (weekday, fecha, desde, hasta, tipo, lugar)
    VALUES (?, NULL, ?, ?, ?, ?)
  `);
  for (const dia of [1, 2, 3, 4, 5]) {
    insertar.run(dia, '08:00', '17:00', 'clinica', 'Horarios ocupados');
  }
  insertar.run(2, '18:00', '21:00', 'consultorio', 'Consultorio');
  insertar.run(4, '18:00', '21:00', 'consultorio', 'Consultorio');
}

function provinciaNormalizada(valor) {
  return norm(valor).toUpperCase();
}

function incluirObra(obra) {
  if (!obra?.exists || !obra.nombre) return false;
  const provincia = provinciaNormalizada(obra.provincia);
  const nombre = provinciaNormalizada(obra.nombre);
  const esProvincial = nombre.startsWith('O.S.P.');
  const enBuenosAires = provincia === 'BUENOS AIRES' || provincia === 'CABA' || provincia === 'CAPITAL FEDERAL';
  if (esProvincial && !enBuenosAires) return false;
  if (enBuenosAires) return true;
  return Array.isArray(obra.sources) && obra.sources.includes('SSSalud');
}

function formatoDe(rnos) {
  if (rnos === 'PARTICULAR') return 'ninguno';
  if (rnos === '500807') return 'pami';
  if (rnos === '902001') return 'ioma';
  return 'libre';
}

function tipoDe(rnos, nombre) {
  if (rnos === 'PARTICULAR') return 'particular';
  if (String(rnos).startsWith('PREPAGA-')) return 'prepaga';
  if (provinciaNormalizada(nombre).startsWith('O.S.P.') || rnos === '902001' || rnos === '901001') return 'provincial';
  return 'nacional';
}

function importarObrasSiFalta() {
  const cantidad = db.prepare('SELECT COUNT(*) AS n FROM obras_sociales').get().n;
  if (cantidad > 0) return;
  const crudo = JSON.parse(fs.readFileSync(rutaFuente, 'utf8'));
  const insertar = db.prepare(`
    INSERT INTO obras_sociales
      (rnos, nombre, sigla, etiqueta, provincia, localidad, tipo, frecuente, formato, fuente)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const agregar = (fila) => insertar.run(
    fila.rnos,
    fila.nombre,
    fila.sigla,
    fila.etiqueta,
    fila.provincia,
    fila.localidad,
    fila.tipo,
    fila.frecuente,
    fila.formato,
    fila.fuente,
  );

  agregar({
    rnos: 'PARTICULAR',
    nombre: 'Sin obra social, atiendo como particular',
    sigla: 'PARTICULAR',
    etiqueta: 'Particular',
    provincia: 'Buenos Aires',
    localidad: '',
    tipo: 'particular',
    frecuente: 1,
    formato: 'ninguno',
    fuente: 'Alta del consultorio',
  });

  let incluidas = 1;
  for (const obra of Object.values(crudo)) {
    if (!incluirObra(obra)) continue;
    const rnos = String(obra.rnos).trim();
    const nombre = String(obra.nombre).replace(/\s+/g, ' ').trim();
    const sigla = SIGLAS[rnos] || String(obra.sigla || '').trim();
    const etiqueta = ETIQUETAS[rnos] || sigla || nombre;
    const fuentes = Array.isArray(obra.sources) ? obra.sources.join(' + ') : 'SSSalud';
    agregar({
      rnos,
      nombre,
      sigla,
      etiqueta,
      provincia: String(obra.provincia || '').trim(),
      localidad: String(obra.localidad || '').trim(),
      tipo: tipoDe(rnos, nombre),
      frecuente: ORDEN_FRECUENTES.includes(rnos) ? 1 : 0,
      formato: formatoDe(rnos),
      fuente: fuentes,
    });
    incluidas += 1;
  }

  for (const [rnos, etiqueta, nombre] of PREPAGAS) {
    agregar({
      rnos,
      nombre,
      sigla: etiqueta.toUpperCase(),
      etiqueta,
      provincia: 'Buenos Aires',
      localidad: '',
      tipo: 'prepaga',
      frecuente: ORDEN_FRECUENTES.includes(rnos) ? 1 : 0,
      formato: 'libre',
      fuente: 'Medicina prepaga con planes en la provincia de Buenos Aires. No integra el RNAS.',
    });
    incluidas += 1;
  }

  exportarCsvObras();
  console.log(`Obras sociales listas: ${incluidas}`);
}

function exportarCsvObras() {
  const filas = db.prepare(`
    SELECT rnos, sigla, etiqueta, nombre, provincia, localidad, tipo, formato, fuente
    FROM obras_sociales
    ORDER BY frecuente DESC, etiqueta COLLATE NOCASE
  `).all();
  const encabezado = ['rnos', 'sigla', 'etiqueta', 'nombre', 'provincia', 'localidad', 'tipo', 'formato', 'fuente'];
  const lineas = [encabezado.join(';')];
  for (const fila of filas) {
    lineas.push(encabezado.map((campo) => csvCampo(fila[campo])).join(';'));
  }
  const destino = path.join(directorioDatos, 'obras-sociales-buenos-aires.csv');
  fs.writeFileSync(destino, `\uFEFF${lineas.join('\n')}\n`, 'utf8');
}

function publica(obra) {
  return {
    id: obra.id,
    rnos: obra.rnos,
    nombre: obra.nombre,
    sigla: obra.sigla,
    etiqueta: obra.etiqueta,
    provincia: obra.provincia,
    tipo: obra.tipo,
    frecuente: obra.frecuente,
    formato: obra.formato,
  };
}

export function refrescarObras() {
  cacheObras = getDb().prepare('SELECT * FROM obras_sociales').all().map((obra) => ({
    ...obra,
    _n: norm(`${obra.etiqueta} ${obra.sigla} ${obra.nombre}`),
  }));
  cacheObras.sort((a, b) => {
    const ia = ORDEN_FRECUENTES.indexOf(a.rnos);
    const ib = ORDEN_FRECUENTES.indexOf(b.rnos);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.etiqueta.localeCompare(b.etiqueta, 'es');
  });
}

export function contarObras() {
  return cacheObras.length;
}

export function buscarObras(consulta) {
  const texto = norm(consulta);
  let lista;
  if (!texto) {
    lista = cacheObras.filter((obra) => obra.frecuente);
  } else {
    lista = cacheObras.filter((obra) => obra._n.includes(texto));
    lista.sort((a, b) => {
      const as = a._n.startsWith(texto) ? 0 : 1;
      const bs = b._n.startsWith(texto) ? 0 : 1;
      if (as !== bs) return as - bs;
      if (a.frecuente !== b.frecuente) return b.frecuente - a.frecuente;
      return a.etiqueta.localeCompare(b.etiqueta, 'es');
    });
  }
  return lista.slice(0, 40).map(publica);
}

export function obraPorId(id) {
  if (!id) return null;
  const obra = getDb().prepare('SELECT * FROM obras_sociales WHERE id = ?').get(Number(id));
  return obra || null;
}

export function consultarPadron(obraId, dni) {
  if (!obraId) return { tienePadron: false, delDni: [], estricto: false };
  const base = getDb();
  const tiene = base.prepare('SELECT 1 AS ok FROM padron_afiliados WHERE obra_id = ? LIMIT 1').get(obraId);
  if (!tiene) return { tienePadron: false, delDni: [], estricto: false };
  const delDni = base.prepare('SELECT nro_afiliado FROM padron_afiliados WHERE obra_id = ? AND dni = ?').all(obraId, dni);
  return { tienePadron: true, delDni, estricto: getSetting('padron_estricto') === '1' };
}

export function importarPadron(filas, reemplazar) {
  const base = getDb();
  const obras = new Map(base.prepare('SELECT id, rnos FROM obras_sociales').all().map((obra) => [obra.rnos, obra.id]));
  base.exec('BEGIN IMMEDIATE');
  try {
    if (reemplazar) base.exec('DELETE FROM padron_afiliados');
    const insertar = base.prepare(`
      INSERT OR IGNORE INTO padron_afiliados (obra_id, dni, nro_afiliado) VALUES (?, ?, ?)
    `);
    let cargadas = 0;
    let omitidas = 0;
    for (const fila of filas.slice(0, 20000)) {
      const obraId = obras.get(String(fila.rnos || '').trim());
      const dni = String(fila.dni || '').replace(/\D/g, '');
      const numero = String(fila.numero || fila.nro || '').trim();
      if (!obraId || !/^\d{7,8}$/.test(dni) || compactarMinimo(numero)) {
        omitidas += 1;
        continue;
      }
      const info = insertar.run(obraId, dni, numero);
      if (info.changes) cargadas += 1;
    }
    base.exec('COMMIT');
    return { cargadas, omitidas };
  } catch (error) {
    try { base.exec('ROLLBACK'); } catch { /* ya cerrada */ }
    throw error;
  }
}

function compactarMinimo(numero) {
  return numero.replace(/[^0-9A-Za-z]/g, '').length < 3;
}

export function contarPadron() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM padron_afiliados').get().n;
}

const MOTIVOS_INICIALES = [
  ['Primera vez en el consultorio', 40],
  ['Ortodoncia', 30],
  ['Arreglo de carie', 45],
  ['Extracción', 45],
  ['Tratamiento de conducto', 60],
  ['Limpieza', 40],
  ['Otros', 30],
];

function sembrarPatologias() {
  const hay = db.prepare('SELECT 1 AS ok FROM patologias LIMIT 1').get();
  if (hay) return;
  const insertar = db.prepare('INSERT INTO patologias (nombre, minutos, orden) VALUES (?, ?, ?)');
  MOTIVOS_INICIALES.forEach(([nombre, minutos], orden) => insertar.run(nombre, minutos, orden));
}

function nombrePatologia(valor) {
  const texto = String(valor || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (texto.length < 2) return '';
  if (!/^[\p{L}0-9][\p{L}0-9'’.\-(), ]+$/u.test(texto)) return '';
  return texto;
}

function minutosPatologia(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  if (n < 10 || n > 180) return null;
  return n;
}

export function listarPatologias() {
  return getDb().prepare('SELECT id, nombre, minutos FROM patologias ORDER BY orden, id').all()
    .map((fila) => ({ id: fila.id, nombre: fila.nombre, minutos: Number(fila.minutos) }));
}

export function patologiaPorId(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  const fila = getDb().prepare('SELECT id, nombre, minutos FROM patologias WHERE id = ?').get(n);
  if (!fila) return null;
  return { id: fila.id, nombre: fila.nombre, minutos: Number(fila.minutos) };
}

export function patologiaPorDefecto() {
  const lista = listarPatologias();
  return lista.find((item) => norm(item.nombre).includes('primera vez')) || lista[0] || null;
}

export function crearPatologia(nombre, minutos) {
  const limpio = nombrePatologia(nombre);
  const mins = minutosPatologia(minutos);
  if (!limpio) return { ok: false, error: 'Escribí el nombre de la patología.' };
  if (mins == null) return { ok: false, error: 'La duración va de 10 a 180 minutos.' };
  const orden = getDb().prepare('SELECT COALESCE(MAX(orden), -1) AS n FROM patologias').get().n + 1;
  try {
    const info = getDb().prepare('INSERT INTO patologias (nombre, minutos, orden) VALUES (?, ?, ?)').run(limpio, mins, orden);
    return { ok: true, id: Number(info.lastInsertRowid) };
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { ok: false, error: 'Esa patología ya está.' };
    throw error;
  }
}

export function actualizarPatologia(id, nombre, minutos) {
  const actual = patologiaPorId(id);
  if (!actual) return { ok: false, error: 'Esa patología no está.' };
  const limpio = nombrePatologia(nombre);
  const mins = minutosPatologia(minutos);
  if (!limpio) return { ok: false, error: 'Escribí el nombre de la patología.' };
  if (mins == null) return { ok: false, error: 'La duración va de 10 a 180 minutos.' };
  try {
    getDb().prepare('UPDATE patologias SET nombre = ?, minutos = ? WHERE id = ?').run(limpio, mins, actual.id);
    return { ok: true };
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { ok: false, error: 'Esa patología ya está.' };
    throw error;
  }
}

export function borrarPatologia(id) {
  const total = getDb().prepare('SELECT COUNT(*) AS n FROM patologias').get().n;
  if (total <= 1) return { ok: false, error: 'Dejá al menos un motivo de turno.' };
  const info = getDb().prepare('DELETE FROM patologias WHERE id = ?').run(Number(id));
  if (!info.changes) return { ok: false, error: 'Esa patología no está.' };
  return { ok: true };
}
