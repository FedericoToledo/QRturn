import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarCuil, digitosCuilValidos, dniDentroDeCuil } from '../lib/cuil.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dentapp-'));
const db = path.join(dir, 'test.sqlite');
let fallos = 0;

function afirmar(condicion, mensaje) {
  if (!condicion) {
    fallos += 1;
    console.error(`FALLO: ${mensaje}`);
    return;
  }
  console.log(`ok ${mensaje}`);
}

const dni = '30111222';
const cuil = ['20', '27', '23', '24'].map((prefijo) => armarCuil(prefijo, dni)).find(Boolean);
afirmar(Boolean(cuil) && digitosCuilValidos(cuil) && dniDentroDeCuil(cuil, dni), 'el CUIL de prueba cierra y contiene el DNI');
const cuilMal = `${cuil.slice(0, 10)}${(Number(cuil[10]) + 1) % 10}`;

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: raiz,
  env: { ...process.env, PORT: '0', DENTAPP_DB: db },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let salida = '';
let errorSalida = '';
child.stdout.on('data', (trozo) => { salida += trozo; });
child.stderr.on('data', (trozo) => { errorSalida += trozo; });

function esperarPuerto() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no arrancó\n${salida}\n${errorSalida}`)), 20000);
    const mirar = () => {
      const coincidencia = salida.match(/LISTO (\d+)/);
      if (coincidencia) {
        clearTimeout(timer);
        resolve(Number(coincidencia[1]));
        return;
      }
      if (child.exitCode != null) {
        clearTimeout(timer);
        reject(new Error(`el servidor salió ${child.exitCode}\n${salida}\n${errorSalida}`));
      }
    };
    child.stdout.on('data', mirar);
    child.on('exit', mirar);
    mirar();
  });
}

let cookie = '';
async function pedir(base, ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: opciones.method || 'GET',
    headers: {
      ...(opciones.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const cruda = respuesta.headers.get('set-cookie') || '';
  const sesion = cruda.match(/sesion=([^;]+)/);
  if (sesion) cookie = `sesion=${sesion[1]}`;
  const tipo = respuesta.headers.get('content-type') || '';
  const data = tipo.includes('json') ? await respuesta.json() : await respuesta.text();
  return { status: respuesta.status, data };
}

try {
  const puerto = await esperarPuerto();
  const base = `http://127.0.0.1:${puerto}`;
  const pin = fs.readFileSync(path.join(dir, 'clave-de-prueba.txt'), 'utf8').match(/\d{6}/)[0];

  const inicio = await pedir(base, '/api/inicio');
  afirmar(inicio.data.profesional === 'Alejandra Reverter', 'el nombre es Alejandra Reverter');
  afirmar(inicio.data.matricula === '61.178', 'la matrícula precargada es 61.178');

  const salud = await pedir(base, '/api/salud');
  afirmar(salud.data.obras >= 180, `hay un listado amplio de obras (${salud.data.obras})`);

  const ioma = (await pedir(base, '/api/obras?q=ioma')).data.find((obra) => obra.etiqueta === 'IOMA');
  const pami = (await pedir(base, '/api/obras?q=pami')).data.find((obra) => obra.etiqueta === 'PAMI');
  const osde = (await pedir(base, '/api/obras?q=osde')).data.find((obra) => obra.etiqueta === 'OSDE');
  const osap = (await pedir(base, '/api/obras?q=aceros')).data.find((obra) => obra.rnos === '800501');
  const swiss = (await pedir(base, '/api/obras?q=swiss')).data.find((obra) => obra.etiqueta === 'Swiss Medical');
  const particular = (await pedir(base, '/api/obras')).data.find((obra) => obra.etiqueta === 'Particular');
  const iapos = await pedir(base, '/api/obras?q=iapos');
  afirmar(ioma?.formato === 'ioma' && ioma.provincia.includes('Buenos Aires'), 'IOMA está y es de Buenos Aires');
  afirmar(pami?.formato === 'pami', 'PAMI está con formato de beneficio');
  afirmar(osde?.etiqueta === 'OSDE', 'OSDE está en el buscador');
  afirmar(osap?.etiqueta.includes('Aceros'), 'OSAP Aceros Paraná, de San Nicolás, está');
  afirmar(swiss?.tipo === 'prepaga', 'Swiss Medical está como prepaga');
  afirmar(particular?.formato === 'ninguno', 'Particular no pide número');
  afirmar(iapos.data.length === 0, 'IAPOS, de Santa Fe, no entra en el listado de Buenos Aires');

  const sinNombre = await pedir(base, '/api/revisar', { method: 'POST', body: { nombre: 'A', apellido: 'López', dni: '30.111.222', obraId: particular.id } });
  afirmar(sinNombre.data.ok === false, 'rechaza un nombre de una letra');

  const cuilOk = await pedir(base, '/api/revisar', {
    method: 'POST',
    body: { nombre: 'María', apellido: 'López', dni: '30.111.222', obraId: osde.id, nro: cuil },
  });
  afirmar(cuilOk.data.ok && cuilOk.data.validacion.estado === 'cuil_ok', 'un CUIL válido que coincide con el DNI pasa');

  const cuilRoto = await pedir(base, '/api/revisar', {
    method: 'POST',
    body: { nombre: 'María', apellido: 'López', dni, obraId: osde.id, nro: cuilMal },
  });
  afirmar(cuilRoto.data.ok === false && cuilRoto.data.validacion.estado === 'cuil_invalido', 'un CUIL con dígito mal no pasa');

  const beneficio = `${cuil}001`;
  const pamiOk = await pedir(base, '/api/revisar', {
    method: 'POST',
    body: { nombre: 'María', apellido: 'López', dni, obraId: pami.id, nro: beneficio },
  });
  afirmar(pamiOk.data.validacion.estado === 'pami_titular', 'PAMI de 14 números con CUIL del titular pasa');

  const particularOk = await pedir(base, '/api/revisar', {
    method: 'POST',
    body: { nombre: 'Ana', apellido: 'Paz', dni: '28444555', obraId: particular.id, nro: '' },
  });
  afirmar(particularOk.data.ok && particularOk.data.validacion.estado === 'particular', 'particular no exige número');

  const disponibles = await pedir(base, '/api/disponibles');
  afirmar(disponibles.data.dias.length > 0, 'hay días con turno en el consultorio');
  const horas = disponibles.data.dias.flatMap((dia) => dia.horas);
  afirmar(horas.every((hora) => hora >= '18:00' && hora < '21:00'), 'no se ofrecen los horarios de clínica');
  afirmar(!JSON.stringify(disponibles.data).includes('López'), 'los turnos libres no muestran nombres de pacientes');

  const dia = disponibles.data.dias[0];
  const reserva = await pedir(base, '/api/turnos', {
    method: 'POST',
    body: { nombre: 'María', apellido: 'López', dni, obraId: osde.id, nro: cuil, fecha: dia.fecha, hora: dia.horas[0] },
  });
  afirmar(reserva.data.ok && reserva.data.turno.codigo.length === 5, 'se reserva el primer horario');

  const repetido = await pedir(base, '/api/turnos', {
    method: 'POST',
    body: { nombre: 'María', apellido: 'López', dni, obraId: osde.id, nro: cuil, fecha: dia.fecha, hora: dia.horas[1] },
  });
  afirmar(repetido.data.ok === false, 'la misma persona no saca dos turnos');

  const ocupado = await pedir(base, '/api/turnos', {
    method: 'POST',
    body: { nombre: 'Juan', apellido: 'Sosa', dni: '25999111', obraId: particular.id, fecha: dia.fecha, hora: dia.horas[0] },
  });
  afirmar(ocupado.data.ok === false, 'dos personas no ocupan el mismo horario');

  const clinica = await pedir(base, '/api/turnos', {
    method: 'POST',
    body: { nombre: 'Juan', apellido: 'Sosa', dni: '25999111', obraId: particular.id, fecha: dia.fecha, hora: '09:00' },
  });
  afirmar(clinica.data.ok === false, 'las 9 no se reservan: está en la clínica');

  const ajeno = await pedir(base, '/api/admin/dia');
  afirmar(ajeno.status === 401, 'la agenda no se abre sin clave');

  const mal = await pedir(base, '/api/admin/login', { method: 'POST', body: { pin: '000000' } });
  afirmar(mal.status === 401, 'rechaza una clave incorrecta');
  cookie = '';
  const bien = await pedir(base, '/api/admin/login', { method: 'POST', body: { pin } });
  afirmar(bien.status === 200 && cookie.includes('sesion='), 'entra con la clave');

  const bloques = await pedir(base, '/api/admin/bloques');
  const jueves = bloques.data.find((bloque) => bloque.weekday === 4 && bloque.tipo === 'consultorio' && !bloque.fecha);
  const ocupada = await pedir(base, `/api/admin/bloques/${jueves.id}/tipo`, { method: 'POST', body: { tipo: 'clinica' } });
  afirmar(ocupada.data.ok, 'marca una franja semanal como ocupada');
  const disponible = await pedir(base, `/api/admin/bloques/${jueves.id}/tipo`, { method: 'POST', body: { tipo: 'consultorio' } });
  afirmar(disponible.data.ok, 'vuelve a dejar esa franja disponible');
  const semana = await pedir(base, '/api/admin/semana');
  afirmar(semana.data.dias.length === 7 && semana.data.dias.some((item) => item.turnos.some((turno) => turno.apellido === 'López')), 'la semana muestra el turno');
  afirmar(semana.data.dias.some((item) => item.ocupados.some((ocupado) => ocupado.tipo === 'clinica' && ocupado.desde === '08:00')), 'la semana muestra las horas ocupadas');
  const siguiente = await pedir(base, '/api/admin/semana?desde=2026-11-02');
  afirmar(siguiente.data.desde === '2026-11-02' && siguiente.data.hasta === '2026-11-08' && siguiente.data.dias[0].fecha === '2026-11-02' && siguiente.data.dias.length === 7, 'la semana siguiente arranca en la fecha pedida');
  const invalida = await pedir(base, '/api/admin/semana?desde=ayer');
  afirmar(invalida.data.dias.length === 7 && invalida.data.desde === semana.data.desde, 'una fecha inválida muestra la semana de hoy');

  const agenda = await pedir(base, `/api/admin/dia?fecha=${dia.fecha}`);
  const turno = agenda.data.turnos.find((item) => item.dni === dni);
  afirmar(turno?.apellido === 'López' && turno.validacion.estado === 'cuil_ok', 'la agenda muestra el turno y la validación');

  const cobertura = await pedir(base, `/api/admin/turnos/${turno.id}`, { method: 'POST', body: { estado: 'confirmado' } });
  afirmar(cobertura.data.ok, 'marca la cobertura como revisada');

  const padron = await pedir(base, '/api/admin/padron', {
    method: 'POST',
    body: { filas: [{ rnos: '902001', dni: '31222000', numero: '556677889' }], reemplazar: false },
  });
  afirmar(padron.data.cargadas === 1, 'carga una fila de padrón propio');
  const coincide = await pedir(base, '/api/revisar', {
    method: 'POST',
    body: { nombre: 'Lucía', apellido: 'Neri', dni: '31222000', obraId: ioma.id, nro: '556677889' },
  });
  afirmar(coincide.data.validacion.estado === 'verificado_padron', 'el número coincide con el padrón cargado');
  const distinto = await pedir(base, '/api/revisar', {
    method: 'POST',
    body: { nombre: 'Lucía', apellido: 'Neri', dni: '31222000', obraId: ioma.id, nro: '11111111' },
  });
  afirmar(distinto.data.ok === false && distinto.data.validacion.estado === 'padron_distinto', 'rechaza un número distinto al del padrón');

  const qr = await pedir(base, '/api/admin/qr.svg');
  afirmar(qr.status === 200 && String(qr.data).includes('<svg'), 'genera el QR de la puerta');

  const cancelado = await pedir(base, `/api/admin/turnos/${turno.id}`, { method: 'POST', body: { estado: 'cancelado' } });
  afirmar(cancelado.data.ok, 'cancela desde la agenda');
  const otraVez = await pedir(base, '/api/disponibles');
  afirmar(otraVez.data.dias.some((item) => item.fecha === dia.fecha && item.horas.includes(dia.horas[0])), 'el horario cancelado vuelve a ofrecerse');

  const csv = fs.readFileSync(path.join(raiz, 'data', 'obras-sociales-buenos-aires.csv'), 'utf8');
  afirmar(csv.includes('IOMA') && csv.includes('902001') && !csv.includes('30111222'), 'el CSV es de obras sociales, no de afiliados');
} catch (error) {
  fallos += 1;
  console.error(error);
} finally {
  child.kill();
  await new Promise((resolve) => child.on('exit', resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}

if (fallos) {
  console.error(`${fallos} pruebas fallaron`);
  process.exit(1);
}
console.log('Todas las pruebas pasaron');
