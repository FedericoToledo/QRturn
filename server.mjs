import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import {
  agregarBloque,
  borrarBloque,
  buscarPacientes,
  cambiarEstado,
  cambiarTipoBloque,
  cancelarPorCodigo,
  crearTurno,
  diaAdmin,
  diasDisponibles,
  listarBloques,
  publicoTurno,
  semanaTurnos,
  turnoVigente,
} from './lib/agenda.mjs';
import {
  abrir,
  actualizarPatologia,
  borrarPatologia,
  borrarSesion,
  buscarObras,
  checkPin,
  contarObras,
  contarPadron,
  crearPatologia,
  crearSesion,
  getSetting,
  importarPadron,
  listarPatologias,
  rutaDb,
  patologiaPorDefecto,
  patologiaPorId,
  sesionValida,
  setPin,
  setSetting,
} from './lib/db.mjs';
import {
  abrirArchivo,
  borrarArchivo,
  borrarPaciente,
  crearHistoria,
  editarPaciente,
  guardarArchivo,
  listarArchivos,
  listarHistoria,
  marcarCarga,
} from './lib/pacientes.mjs';
import { validarDni, revisarDatos } from './lib/validar.mjs';

const publico = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const fallosPin = new Map();
const cupo = new Map();
let puertoReal = Number(process.env.PORT || 4173);

function enviarJson(res, codigo, cuerpo, extra = {}) {
  const data = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
    ...extra,
  });
  res.end(data);
}

function leerCuerpo(req, limite = 1_500_000) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamano = 0;
    req.on('data', (trozo) => {
      tamano += trozo.length;
      if (tamano > limite) {
        reject(Object.assign(new Error('demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(trozo);
    });
    req.on('end', () => {
      if (!partes.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function cookie(req, nombre) {
  const cruda = req.headers.cookie || '';
  for (const parte of cruda.split(';')) {
    const [clave, ...resto] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(resto.join('='));
  }
  return '';
}

function origenValido(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function ipDe(req) {
  return req.socket.remoteAddress || 'local';
}

function limitado(req) {
  const ahora = Date.now();
  const ip = ipDe(req);
  const marcas = (cupo.get(ip) || []).filter((marca) => ahora - marca < 10 * 60 * 1000);
  marcas.push(ahora);
  cupo.set(ip, marcas);
  return marcas.length > 40;
}

function esAdmin(req, res) {
  if (!sesionValida(cookie(req, 'sesion'))) {
    enviarJson(res, 401, { error: 'Tenés que entrar a la agenda.' });
    return false;
  }
  return true;
}

function lanIp() {
  const redes = Object.values(os.networkInterfaces()).flat().filter(Boolean);
  const ipv4 = redes.filter((red) => (red.family === 'IPv4' || red.family === 4) && !red.internal);
  const privada = ipv4.find((red) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(red.address));
  return (privada || ipv4[0])?.address || '127.0.0.1';
}

function urlDelQr() {
  const configurada = getSetting('url_publica').trim();
  if (/^https?:\/\/.+/i.test(configurada)) return `${configurada.replace(/\/$/, '')}/`;
  return `http://${lanIp()}:${puertoReal}/`;
}

const TEMAS = ['original', 'turquesa', 'verdes', 'oscuro'];
const FUENTES = ['fraunces', 'source-serif', 'literata', 'source-sans', 'manrope'];

function valorDe(lista, clave, defecto) {
  const valor = getSetting(clave);
  return lista.includes(valor) ? valor : defecto;
}

function fichaPublica() {
  return {
    marca: getSetting('marca'),
    profesional: getSetting('profesional'),
    matricula: getSetting('matricula'),
    direccion: getSetting('direccion'),
    bajada: getSetting('bajada'),
    tema: valorDe(TEMAS, 'tema', 'turquesa'),
    fuente: valorDe(FUENTES, 'fuente', 'fraunces'),
    patologias: listarPatologias(),
    logo: urlLogo(),
  };
}

const LOGOS = {
  png: {
    mime: 'image/png',
    firma: (buffer) => buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47,
  },
  jpg: {
    mime: 'image/jpeg',
    firma: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  webp: {
    mime: 'image/webp',
    firma: (buffer) => buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  },
};

function archivosLogo() {
  const base = path.basename(rutaDb, path.extname(rutaDb));
  const prefijo = base === 'dentapp' ? 'logo' : `${base}.logo`;
  const carpeta = path.dirname(rutaDb);
  return Object.keys(LOGOS).map((ext) => ({ ext, ruta: path.join(carpeta, `${prefijo}.${ext}`) }));
}

function archivoLogo() {
  return archivosLogo().find((archivo) => existsSync(archivo.ruta)) || null;
}

function urlLogo() {
  const archivo = archivoLogo();
  if (!archivo) return '/image/logoRebranding.png';
  return `/logo?t=${Math.floor(statSync(archivo.ruta).mtimeMs)}`;
}

function borrarLogos() {
  for (const archivo of archivosLogo()) {
    if (existsSync(archivo.ruta)) unlinkSync(archivo.ruta);
  }
}

function guardarLogo(imagen) {
  const coincidencia = String(imagen || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!coincidencia) return { ok: false, error: 'El logo tiene que ser PNG, JPG o WebP.' };
  const ext = coincidencia[1] === 'jpeg' ? 'jpg' : coincidencia[1];
  let buffer;
  try {
    buffer = Buffer.from(coincidencia[2].replace(/\s/g, ''), 'base64');
  } catch {
    return { ok: false, error: 'No pude leer esa imagen.' };
  }
  if (buffer.length < 32 || buffer.length > 1_500_000 || !LOGOS[ext].firma(buffer)) {
    return { ok: false, error: 'Esa imagen no sirve como logo. Usá un PNG, JPG o WebP de hasta 1,5 MB.' };
  }
  borrarLogos();
  const destino = archivosLogo().find((archivo) => archivo.ext === ext);
  writeFileSync(destino.ruta, buffer);
  return { ok: true, logo: urlLogo() };
}

function motivoPedido(id) {
  if (id == null || id === '') return { motivo: patologiaPorDefecto(), falta: false };
  const motivo = patologiaPorId(id);
  if (!motivo) return { motivo: null, falta: true };
  return { motivo, falta: false };
}

async function archivoEstatico(res, ruta) {
  const relativo = path.relative(publico, ruta);
  if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
    enviarJson(res, 403, { error: 'No permitido.' });
    return;
  }
  try {
    const data = await fs.readFile(ruta);
    const tipo = tipos[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': tipo, 'cache-control': 'no-store', 'content-length': data.length });
    res.end(data);
  } catch {
    enviarJson(res, 404, { error: 'No existe.' });
  }
}

async function atender(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const ruta = decodeURIComponent(url.pathname);
  if (req.method !== 'GET' && !origenValido(req)) {
    enviarJson(res, 403, { error: 'Origen rechazado.' });
    return;
  }

  if (ruta === '/api/salud' && req.method === 'GET') {
    enviarJson(res, 200, { ok: true, obras: contarObras() });
    return;
  }
  if (ruta === '/api/inicio' && req.method === 'GET') {
    enviarJson(res, 200, fichaPublica());
    return;
  }
  if (ruta === '/logo' && req.method === 'GET') {
    const archivo = archivoLogo();
    if (!archivo) {
      await archivoEstatico(res, path.join(publico, 'image', 'logoRebranding.png'));
      return;
    }
    const data = await fs.readFile(archivo.ruta);
    res.writeHead(200, {
      'content-type': LOGOS[archivo.ext].mime,
      'cache-control': 'no-store',
      'content-length': data.length,
    });
    res.end(data);
    return;
  }
  if (ruta === '/api/obras' && req.method === 'GET') {
    enviarJson(res, 200, buscarObras(url.searchParams.get('q') || ''));
    return;
  }
  if (ruta === '/api/patologias' && req.method === 'GET') {
    enviarJson(res, 200, listarPatologias());
    return;
  }
  if (ruta === '/api/disponibles' && req.method === 'GET') {
    const { motivo, falta } = motivoPedido(url.searchParams.get('patologia'));
    if (falta || !motivo) {
      enviarJson(res, 200, { dias: [], patologia: null });
      return;
    }
    enviarJson(res, 200, { dias: diasDisponibles({ duracion: motivo.minutos }), patologia: motivo });
    return;
  }

  if (req.method === 'POST' && ruta.startsWith('/api/') && !ruta.startsWith('/api/admin') && limitado(req)) {
    enviarJson(res, 429, { error: 'Demasiados intentos. Esperá un momento.' });
    return;
  }

  if (ruta === '/api/revisar' && req.method === 'POST') {
    const revision = revisarDatos(await leerCuerpo(req));
    const turno = revision.datos ? publicoTurno(turnoVigente(revision.datos.dni), false) : null;
    enviarJson(res, 200, {
      ok: revision.ok,
      errores: revision.errores,
      validacion: revision.validacion || null,
      turno,
      formato: revision.obra?.formato || (revision.datos?.obraOtra ? 'libre' : null),
    });
    return;
  }

  if (ruta === '/api/mio' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    const documento = validarDni(cuerpo.dni);
    if (!documento.ok) {
      enviarJson(res, 200, { ok: false, errores: [documento.error] });
      return;
    }
    enviarJson(res, 200, { ok: true, turno: publicoTurno(turnoVigente(documento.dni), false) });
    return;
  }

  if (ruta === '/api/cancelar' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    const documento = validarDni(cuerpo.dni);
    if (!documento.ok) {
      enviarJson(res, 200, { ok: false, error: documento.error });
      return;
    }
    enviarJson(res, 200, cancelarPorCodigo(documento.dni, cuerpo.codigo));
    return;
  }

  if (ruta === '/api/turnos' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    const revision = revisarDatos(cuerpo);
    if (!revision.ok) {
      enviarJson(res, 200, { ok: false, error: revision.errores[0] || 'Revisá los datos.', validacion: revision.validacion || null });
      return;
    }
    const { motivo, falta } = motivoPedido(cuerpo.patologiaId);
    if (falta || !motivo) {
      enviarJson(res, 200, { ok: false, error: falta ? 'Elegí el motivo del turno.' : 'Falta configurar los tiempos de turno.' });
      return;
    }
    enviarJson(res, 200, crearTurno(revision.datos, cuerpo.fecha, cuerpo.hora, { patologia: motivo }));
    return;
  }

  if (ruta === '/api/admin/login' && req.method === 'POST') {
    const ip = ipDe(req);
    const marca = fallosPin.get(ip);
    if (marca && marca.n >= 6 && Date.now() - marca.t < 60_000) {
      enviarJson(res, 429, { error: 'Esperá un minuto e intentá de nuevo.' });
      return;
    }
    const cuerpo = await leerCuerpo(req);
    if (!checkPin(cuerpo.pin)) {
      const actual = fallosPin.get(ip) || { n: 0, t: Date.now() };
      fallosPin.set(ip, { n: actual.n + 1, t: Date.now() });
      enviarJson(res, 401, { error: 'Clave incorrecta.' });
      return;
    }
    fallosPin.delete(ip);
    const token = crearSesion();
    enviarJson(res, 200, { ok: true }, {
      'set-cookie': `sesion=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
    });
    return;
  }

  if (ruta === '/api/admin/logout' && req.method === 'POST') {
    borrarSesion(cookie(req, 'sesion'));
    enviarJson(res, 200, { ok: true }, {
      'set-cookie': 'sesion=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    });
    return;
  }

  if (ruta.startsWith('/api/admin')) {
    if (!esAdmin(req, res)) return;
    if (await rutaAdmin(req, res, ruta, url)) return;
  }

  if (req.method === 'GET') {
    const mapa = { '/': 'index.html', '/admin': 'admin.html' };
    const relativo = mapa[ruta] || ruta.replace(/^\/+/, '');
    await archivoEstatico(res, path.join(publico, relativo));
    return;
  }

  enviarJson(res, 404, { error: 'No existe.' });
}

async function rutaAdmin(req, res, ruta, url) {
  if (ruta === '/api/admin/dia' && req.method === 'GET') {
    enviarJson(res, 200, diaAdmin(url.searchParams.get('fecha') || ''));
    return true;
  }
  if (ruta === '/api/admin/bloques' && req.method === 'GET') {
    enviarJson(res, 200, listarBloques());
    return true;
  }
  if (ruta === '/api/admin/semana' && req.method === 'GET') {
    enviarJson(res, 200, semanaTurnos(url.searchParams.get('desde') || ''));
    return true;
  }
  const tipoFranja = ruta.match(/^\/api\/admin\/bloques\/(\d+)\/tipo$/);
  if (tipoFranja && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    enviarJson(res, 200, cambiarTipoBloque(tipoFranja[1], cuerpo.tipo));
    return true;
  }
  if (ruta === '/api/admin/bloques' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    const dia = cuerpo.weekday == null || cuerpo.weekday === '' ? null : Number(cuerpo.weekday);
    enviarJson(res, 200, agregarBloque({ ...cuerpo, weekday: dia }));
    return true;
  }
  const borrar = ruta.match(/^\/api\/admin\/bloques\/(\d+)$/);
  if (borrar && req.method === 'DELETE') {
    enviarJson(res, 200, { ok: borrarBloque(borrar[1]) });
    return true;
  }
  if (ruta === '/api/admin/turnos' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    const revision = revisarDatos(cuerpo);
    if (!revision.ok) {
      enviarJson(res, 200, { ok: false, error: revision.errores[0] || 'Revisá los datos.' });
      return true;
    }
    const { motivo, falta } = motivoPedido(cuerpo.patologiaId);
    if (falta || !motivo) {
      enviarJson(res, 200, { ok: false, error: falta ? 'Elegí el motivo del turno.' : 'Falta configurar los tiempos de turno.' });
      return true;
    }
    enviarJson(res, 200, crearTurno(revision.datos, cuerpo.fecha, cuerpo.hora, {
      saltearAnticipacion: true,
      admin: true,
      patologia: motivo,
    }));
    return true;
  }
  if (ruta === '/api/admin/patologias' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    enviarJson(res, 200, crearPatologia(cuerpo.nombre, cuerpo.minutos));
    return true;
  }
  const patologiaRuta = ruta.match(/^\/api\/admin\/patologias\/(\d+)$/);
  if (patologiaRuta && req.method === 'PUT') {
    const cuerpo = await leerCuerpo(req);
    enviarJson(res, 200, actualizarPatologia(patologiaRuta[1], cuerpo.nombre, cuerpo.minutos));
    return true;
  }
  if (patologiaRuta && req.method === 'DELETE') {
    enviarJson(res, 200, borrarPatologia(patologiaRuta[1]));
    return true;
  }
  const turno = ruta.match(/^\/api\/admin\/turnos\/(\d+)$/);
  if (turno && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    const ok = cambiarEstado(turno[1], cuerpo.estado);
    enviarJson(res, 200, { ok });
    return true;
  }
  const archivoUno = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/archivos\/(\d+)$/);
  if (archivoUno && req.method === 'GET') {
    const archivo = abrirArchivo(archivoUno[1], archivoUno[2]);
    if (!archivo) {
      enviarJson(res, 404, { error: 'No encontré ese archivo.' });
      return true;
    }
    res.writeHead(200, {
      'content-type': archivo.mime,
      'cache-control': 'no-store',
      'content-length': archivo.buffer.length,
    });
    res.end(archivo.buffer);
    return true;
  }
  if (archivoUno && req.method === 'DELETE') {
    enviarJson(res, 200, borrarArchivo(archivoUno[1], archivoUno[2]));
    return true;
  }
  const archivosRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/archivos$/);
  if (archivosRuta && req.method === 'GET') {
    enviarJson(res, 200, listarArchivos(archivosRuta[1], url.searchParams.get('tipo') || ''));
    return true;
  }
  if (archivosRuta && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req, 8_500_000);
    enviarJson(res, 200, guardarArchivo(archivosRuta[1], cuerpo.nombre, cuerpo.archivo, cuerpo.tipo));
    return true;
  }
  const historiaRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/historia$/);
  if (historiaRuta && req.method === 'GET') {
    enviarJson(res, 200, listarHistoria(historiaRuta[1]));
    return true;
  }
  if (historiaRuta && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    enviarJson(res, 200, crearHistoria(historiaRuta[1], cuerpo.diagnostico, cuerpo.anotacion));
    return true;
  }
  const cargaRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/carga$/);
  if (cargaRuta && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req);
    enviarJson(res, 200, marcarCarga(cargaRuta[1], cuerpo.periodo));
    return true;
  }
  if (ruta === '/api/admin/pacientes' && req.method === 'GET') {
    enviarJson(res, 200, buscarPacientes(url.searchParams.get('q') || ''));
    return true;
  }
  const pacienteRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)$/);
  if (pacienteRuta && req.method === 'PUT') {
    const cuerpo = await leerCuerpo(req);
    enviarJson(res, 200, editarPaciente(pacienteRuta[1], cuerpo));
    return true;
  }
  if (pacienteRuta && req.method === 'DELETE') {
    enviarJson(res, 200, borrarPaciente(pacienteRuta[1]));
    return true;
  }
  if (ruta === '/api/admin/ajustes' && req.method === 'GET') {
    enviarJson(res, 200, {
      ...fichaPublica(),
      duracionMin: Number(getSetting('duracion_min')),
      horizonteDias: Number(getSetting('horizonte_dias')),
      anticipacionHoras: Number(getSetting('anticipacion_horas')),
      urlPublica: getSetting('url_publica'),
      urlQr: urlDelQr(),
      padronEstricto: getSetting('padron_estricto') === '1',
      obras: contarObras(),
      padron: contarPadron(),
      lan: `http://${lanIp()}:${puertoReal}/`,
    });
    return true;
  }
  if (ruta === '/api/admin/ajustes' && req.method === 'PUT') {
    const cuerpo = await leerCuerpo(req);
    const texto = (valor, max) => String(valor ?? '').trim().slice(0, max);
    if (cuerpo.marca != null) setSetting('marca', texto(cuerpo.marca, 24) || 'Dent.');
    if (cuerpo.profesional != null) setSetting('profesional', texto(cuerpo.profesional, 60) || 'Alejandra Reverter');
    if (cuerpo.matricula != null) setSetting('matricula', texto(cuerpo.matricula, 20));
    if (cuerpo.direccion != null) setSetting('direccion', texto(cuerpo.direccion, 120));
    if (cuerpo.bajada != null) setSetting('bajada', texto(cuerpo.bajada, 280));
    if (cuerpo.duracionMin != null) setSetting('duracion_min', String(acotar(cuerpo.duracionMin, 10, 180, 30)));
    if (cuerpo.horizonteDias != null) setSetting('horizonte_dias', String(acotar(cuerpo.horizonteDias, 1, 60, 21)));
    if (cuerpo.anticipacionHoras != null) setSetting('anticipacion_horas', String(acotar(cuerpo.anticipacionHoras, 0, 168, 4)));
    if (cuerpo.urlPublica != null) {
      const publicaUrl = texto(cuerpo.urlPublica, 200);
      if (publicaUrl && !/^https?:\/\/.+/i.test(publicaUrl)) {
        enviarJson(res, 200, { ok: false, error: 'El link público tiene que empezar con http:// o https://' });
        return true;
      }
      setSetting('url_publica', publicaUrl);
    }
    if (cuerpo.tema != null) setSetting('tema', TEMAS.includes(cuerpo.tema) ? cuerpo.tema : 'turquesa');
    if (cuerpo.fuente != null) setSetting('fuente', FUENTES.includes(cuerpo.fuente) ? cuerpo.fuente : 'fraunces');
    if (cuerpo.padronEstricto != null) setSetting('padron_estricto', cuerpo.padronEstricto ? '1' : '0');
    if (cuerpo.pin) {
      if (!/^\d{6}$/.test(String(cuerpo.pin))) {
        enviarJson(res, 200, { ok: false, error: 'La clave nueva tiene que ser de 6 números.' });
        return true;
      }
      setPin(String(cuerpo.pin));
    }
    enviarJson(res, 200, { ok: true, urlQr: urlDelQr(), logo: urlLogo() });
    return true;
  }
  if (ruta === '/api/admin/logo' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req, 2_500_000);
    enviarJson(res, 200, guardarLogo(cuerpo.imagen));
    return true;
  }
  if (ruta === '/api/admin/logo' && req.method === 'DELETE') {
    borrarLogos();
    enviarJson(res, 200, { ok: true, logo: urlLogo() });
    return true;
  }
  if (ruta === '/api/admin/padron' && req.method === 'POST') {
    const cuerpo = await leerCuerpo(req, 6_000_000);
    const filas = Array.isArray(cuerpo.filas) ? cuerpo.filas : [];
    enviarJson(res, 200, { ok: true, ...importarPadron(filas, !!cuerpo.reemplazar), total: contarPadron() });
    return true;
  }
  if (ruta === '/api/admin/padron-plantilla.csv' && req.method === 'GET') {
    const csv = '\uFEFFrnos;dni;numero\n902001;30111222;12345678\n';
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="padron-plantilla.csv"',
    });
    res.end(csv);
    return true;
  }
  if (ruta === '/api/admin/qr.svg' && req.method === 'GET') {
    const svg = await QRCode.toString(urlDelQr(), {
      type: 'svg',
      margin: 1,
      width: 280,
      color: { dark: '#1a2e28', light: '#fbf8f2' },
    });
    res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' });
    res.end(svg);
    return true;
  }
  return false;
}

function acotar(valor, minimo, maximo, defecto) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return defecto;
  return Math.min(maximo, Math.max(minimo, Math.round(numero)));
}

const servidor = http.createServer((req, res) => {
  atender(req, res).catch((error) => {
    if (res.headersSent) return;
    console.error(error);
    enviarJson(res, error.status || 500, { error: 'Hubo un problema. Probá de nuevo.' });
  });
});

abrir();

servidor.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `El puerto ${puertoReal} está ocupado.` : error);
  process.exit(1);
});

servidor.listen(puertoReal, '0.0.0.0', () => {
  puertoReal = servidor.address().port;
  console.log(`LISTO ${puertoReal}`);
  if (process.env.DENTAPP_DB) return;
  const ip = lanIp();
  console.log('');
  console.log('Dent. Alejandra Reverter');
  console.log(`Pacientes   http://localhost:${puertoReal}`);
  console.log(`Agenda      http://localhost:${puertoReal}/admin`);
  console.log(`En el wifi  http://${ip}:${puertoReal}`);
  console.log('La clave de la agenda está en data/clave-inicial.txt');
  console.log('');
});
