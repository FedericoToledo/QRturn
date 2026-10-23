import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarCuil, digitosCuilValidos, dniDentroDeCuil } from '../lib/cuil.mjs';
import { diaDeObra, diasHabiles, nivelPlazo, venceDePrestacion, marcaPadron } from '../lib/plazos.mjs';
import { hoyBA } from '../lib/tiempo.mjs';

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
  afirmar(inicio.data.tema === 'turquesa' && inicio.data.fuente === 'fraunces', 'el tema inicial es turquesa pastel con Fraunces');
  afirmar(inicio.data.matricula === '61.178', 'la matrícula precargada es 61.178');
  afirmar(String(inicio.data.logo || '').includes('logoRebranding'), 'el logo inicial es el del consultorio');
  const motivos = inicio.data.patologias || [];
  const primera = motivos.find((item) => item.nombre.startsWith('Primera vez'));
  const conducto = motivos.find((item) => item.nombre === 'Tratamiento de conducto');
  afirmar(motivos.map((item) => item.nombre).join(' | ') === 'Primera vez en el consultorio | Ortodoncia | Arreglo de carie | Extracción | Tratamiento de conducto | Limpieza | Otros', 'los motivos del consultorio están cargados');
  afirmar(primera?.minutos === 40 && conducto?.minutos === 60, 'la primera vez dura 40 minutos y el conducto 60');
  afirmar((await pedir(base, '/api/patologias')).data.length === 7, 'el paciente puede leer los motivos');

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

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const logoMal = await pedir(base, '/api/admin/logo', { method: 'POST', body: { imagen: 'data:image/png;base64,AAAA' } });
  afirmar(logoMal.data.ok === false, 'rechaza un logo que no es una imagen');
  const logoOk = await pedir(base, '/api/admin/logo', { method: 'POST', body: { imagen: png } });
  afirmar(logoOk.data.ok && String(logoOk.data.logo).startsWith('/logo?'), 'cambia el logo del consultorio');
  const conLogo = await pedir(base, '/api/inicio');
  afirmar(conLogo.data.logo === logoOk.data.logo, 'el paciente ve el logo nuevo');
  const archivoLogo = await fetch(`${base}/logo`);
  const bytesLogo = Buffer.from(await archivoLogo.arrayBuffer());
  afirmar(archivoLogo.status === 200 && (archivoLogo.headers.get('content-type') || '').includes('image/png') && bytesLogo[0] === 0x89, 'el logo nuevo se puede abrir');
  afirmar(!fs.existsSync(path.join(raiz, 'data', 'logo.png')), 'el logo de prueba no pisa el del consultorio real');
  const restaurado = await pedir(base, '/api/admin/logo', { method: 'DELETE' });
  afirmar(restaurado.data.ok && String(restaurado.data.logo).includes('logoRebranding'), 'volver al original deja el logo del consultorio');

  const pinCorto = await pedir(base, '/api/admin/ajustes', { method: 'PUT', body: { pin: '12345' } });
  afirmar(pinCorto.data.ok === false, 'rechaza una clave que no tiene 6 números');
  const pinVacio = await pedir(base, '/api/admin/ajustes', { method: 'PUT', body: { pin: '' } });
  afirmar(pinVacio.data.ok === true, 'una clave vacía no cambia la clave');
  const claveNueva = '654321';
  const claveOk = await pedir(base, '/api/admin/ajustes', { method: 'PUT', body: { pin: claveNueva } });
  afirmar(claveOk.data.ok, 'cambia la clave de 6 números');
  await pedir(base, '/api/admin/logout', { method: 'POST', body: {} });
  cookie = '';
  const vieja = await pedir(base, '/api/admin/login', { method: 'POST', body: { pin } });
  afirmar(vieja.status === 401, 'la clave anterior deja de entrar');
  cookie = '';
  const entraNueva = await pedir(base, '/api/admin/login', { method: 'POST', body: { pin: claveNueva } });
  afirmar(entraNueva.status === 200, 'entra con la clave nueva');
  await pedir(base, '/api/admin/ajustes', { method: 'PUT', body: { pin } });

  const puesto = await pedir(base, '/api/admin/ajustes', { method: 'PUT', body: { tema: 'oscuro', fuente: 'manrope' } });
  afirmar(puesto.data.ok, 'guarda el tema y la fuente');
  const leido = await pedir(base, '/api/inicio');
  afirmar(leido.data.tema === 'oscuro' && leido.data.fuente === 'manrope', 'el paciente recibe el tema guardado');
  await pedir(base, '/api/admin/ajustes', { method: 'PUT', body: { tema: 'neon', fuente: 'comic' } });
  const vuelto = await pedir(base, '/api/inicio');
  afirmar(vuelto.data.tema === 'turquesa' && vuelto.data.fuente === 'fraunces', 'un tema desconocido vuelve al de ahora');

  const nueva = await pedir(base, '/api/admin/patologias', { method: 'POST', body: { nombre: 'Blanqueamiento', minutos: 50 } });
  afirmar(nueva.data.ok && nueva.data.id, 'agrega un motivo con su duración');
  const repetida = await pedir(base, '/api/admin/patologias', { method: 'POST', body: { nombre: 'limpieza', minutos: 20 } });
  afirmar(repetida.data.ok === false, 'no repite un motivo');
  const corta = await pedir(base, '/api/admin/patologias', { method: 'POST', body: { nombre: 'Control', minutos: 5 } });
  afirmar(corta.data.ok === false, 'rechaza una duración de menos de 10 minutos');
  const cambiada = await pedir(base, `/api/admin/patologias/${nueva.data.id}`, { method: 'PUT', body: { nombre: 'Blanqueamiento', minutos: 55 } });
  afirmar(cambiada.data.ok, 'cambia la duración de un motivo');
  const quitada = await pedir(base, `/api/admin/patologias/${nueva.data.id}`, { method: 'DELETE' });
  afirmar(quitada.data.ok, 'quita un motivo');

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
  afirmar(turno.patologia === 'Primera vez en el consultorio' && turno.duracion_min === 40, 'el turno guarda el motivo y los minutos');

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
  afirmar(distinto.data.ok === true && distinto.data.validacion.estado === 'padron_distinto', 'un número distinto del padrón no frena al paciente');
  afirmar(diaDeObra('902001', 'ioma') === 15 && diaDeObra('500807', 'pami') === 15, 'IOMA y PAMI se cargan hasta el 15');
  afirmar(diaDeObra('400800', 'libre') === 8 && diaDeObra('PREPAGA-SWISS', 'libre') === 8 && diaDeObra('800501', 'libre') === 8, 'OSDE, Swiss y OSAP se cargan hasta el 8');
  afirmar(diaDeObra('126205', 'libre') === 10 && diaDeObra('PARTICULAR', 'ninguno') === null, 'el resto cierra el 10 y particular no se factura');
  afirmar(venceDePrestacion('2026-10-20', 15) === '2026-11-13', 'si el día de cierre cae domingo, pasa al viernes');
  afirmar(diasHabiles('2026-11-06', '2026-11-13') === 5 && diasHabiles('2026-11-05', '2026-11-13') === 6 && diasHabiles('2026-11-13', '2026-11-13') === 0, 'cuenta días hábiles hasta el cierre');
  afirmar(nivelPlazo(10, 6) === 'claro' && nivelPlazo(7, 5) === 'amarillo' && nivelPlazo(0, 0) === 'rojo' && nivelPlazo(-1, 0) === 'paso', 'amarillo a 5 días hábiles y rojo el último día');
  afirmar(marcaPadron({ estado: 'verificado_padron' }) === 'bien' && marcaPadron({ estado: 'padron_distinto' }) === 'mal' && marcaPadron({ estado: 'cuil_ok' }) === '', 'solo el padrón marca el número bien o mal');

  const listaPacientes = await pedir(base, '/api/admin/pacientes?q=López');
  const maria = listaPacientes.data.find((item) => item.dni === dni);
  const venceOsde = venceDePrestacion(dia.fecha, diaDeObra('400800', 'libre'));
  const hoy = hoyBA();
  afirmar(maria?.plazo?.vence === venceOsde && maria.plazo.nivel === nivelPlazo(maria.plazo.dias, diasHabiles(hoy, venceOsde)), 'OSDE aparece con su fecha de carga');
  const historia = await pedir(base, `/api/admin/pacientes/${maria.id}/historia`, {
    method: 'POST',
    body: { diagnostico: 'Caries', anotacion: 'Pieza 26' },
  });
  afirmar(historia.data.ok, 'suma un diagnóstico a la historia');
  const notas = await pedir(base, `/api/admin/pacientes/${maria.id}/historia`);
  afirmar(notas.data[0]?.diagnostico === 'Caries' && notas.data[0]?.anotacion === 'Pieza 26', 'la historia queda guardada');
  const vacia = await pedir(base, `/api/admin/pacientes/${maria.id}/historia`, {
    method: 'POST',
    body: { diagnostico: '', anotacion: ' ' },
  });
  afirmar(vacia.data.ok === false, 'no guarda una nota vacía');
  const foto = await pedir(base, `/api/admin/pacientes/${maria.id}/archivos`, {
    method: 'POST',
    body: { nombre: 'Control', archivo: png, tipo: 'foto' },
  });
  afirmar(foto.data.ok && foto.data.tipo === 'foto', 'guarda una foto del paciente');
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64')}`;
  const documento = await pedir(base, `/api/admin/pacientes/${maria.id}/archivos`, {
    method: 'POST',
    body: { nombre: 'Orden', archivo: pdf, tipo: 'documento' },
  });
  afirmar(documento.data.ok && documento.data.tipo === 'documento', 'guarda un documento del paciente');
  const imagenComoTexto = await pedir(base, `/api/admin/pacientes/${maria.id}/archivos`, {
    method: 'POST',
    body: { nombre: 'Placa', archivo: png, tipo: 'documento' },
  });
  afirmar(imagenComoTexto.data.ok && imagenComoTexto.data.tipo === 'foto', 'una imagen no queda entre los textos');
  await pedir(base, `/api/admin/pacientes/${maria.id}/archivos/${imagenComoTexto.data.id}`, { method: 'DELETE' });
  const txt = `data:text/plain;charset=utf-8;base64,${Buffer.from('Pieza 26, control.').toString('base64')}`;
  const texto = await pedir(base, `/api/admin/pacientes/${maria.id}/archivos`, {
    method: 'POST',
    body: { nombre: 'Nota', archivo: txt, tipo: 'foto' },
  });
  afirmar(texto.data.ok && texto.data.tipo === 'documento', 'un texto queda entre los documentos aunque se pida como foto');
  await pedir(base, `/api/admin/pacientes/${maria.id}/archivos/${texto.data.id}`, { method: 'DELETE' });
  const galeria = await pedir(base, `/api/admin/pacientes/${maria.id}/archivos?tipo=foto`);
  afirmar(galeria.data.length === 1 && galeria.data[0].tipo === 'foto', 'la galería lista solo las fotos');
  const bytesFoto = await fetch(`${base}/api/admin/pacientes/${maria.id}/archivos/${foto.data.id}`, { headers: { cookie } });
  const bufferFoto = Buffer.from(await bytesFoto.arrayBuffer());
  afirmar(bytesFoto.status === 200 && bufferFoto[0] === 0x89, 'la foto se puede abrir');
  const quitadaFoto = await pedir(base, `/api/admin/pacientes/${maria.id}/archivos/${foto.data.id}`, { method: 'DELETE' });
  afirmar(quitadaFoto.data.ok, 'quita una foto');
  afirmar(!fs.existsSync(path.join(raiz, 'data', 'pacientes')), 'los archivos de prueba no quedan en el consultorio real');
  const carga = await pedir(base, `/api/admin/pacientes/${maria.id}/carga`, {
    method: 'POST',
    body: { periodo: dia.fecha.slice(0, 7) },
  });
  afirmar(carga.data.ok, 'marca la facturación como cargada');
  const mariaLuego = (await pedir(base, '/api/admin/pacientes?q=López')).data.find((item) => item.dni === dni);
  afirmar(mariaLuego.plazo == null, 'cargada la facturación, la fila vuelve a lo normal');
  const editada = await pedir(base, `/api/admin/pacientes/${maria.id}`, {
    method: 'PUT',
    body: { nombre: 'María', apellido: 'López', dni, obra: 'OSDE', nro: cuil },
  });
  afirmar(editada.data.ok === true, 'edita al paciente sin cambiar sus datos');
  const dniCorto = await pedir(base, `/api/admin/pacientes/${maria.id}`, {
    method: 'PUT',
    body: { nombre: 'María', apellido: 'López', dni: '12', obra: 'OSDE', nro: cuil },
  });
  afirmar(dniCorto.data.ok === false, 'no guarda un DNI corto');
  const mariaIgual = (await pedir(base, '/api/admin/pacientes?q=López')).data.find((item) => item.dni === dni);
  afirmar(mariaIgual?.obra === 'OSDE' && mariaIgual.nombre === 'María', 'un DNI corto no pisa los datos');

  const qr = await pedir(base, '/api/admin/qr.svg');
  afirmar(qr.status === 200 && String(qr.data).includes('<svg'), 'genera el QR de la puerta');

  const cancelado = await pedir(base, `/api/admin/turnos/${turno.id}`, { method: 'POST', body: { estado: 'cancelado' } });
  afirmar(cancelado.data.ok, 'cancela desde la agenda');
  const otraVez = await pedir(base, '/api/disponibles');
  afirmar(otraVez.data.dias.some((item) => item.fecha === dia.fecha && item.horas.includes(dia.horas[0])), 'el horario cancelado vuelve a ofrecerse');

  const nora = await pedir(base, '/api/turnos', {
    method: 'POST',
    body: { nombre: 'Nora', apellido: 'Prueba', dni: '40111000', obraId: particular.id, fecha: dia.fecha, hora: dia.horas[1] },
  });
  afirmar(nora.data.ok, 'reserva un turno para poder eliminarlo');
  const noraLista = (await pedir(base, '/api/admin/pacientes?q=Prueba')).data.find((item) => item.dni === '40111000');
  afirmar(Boolean(noraLista?.id), 'el paciente de prueba aparece en el listado');
  const borrada = noraLista?.id
    ? await pedir(base, `/api/admin/pacientes/${noraLista.id}`, { method: 'DELETE' })
    : { data: { ok: false } };
  afirmar(borrada.data.ok, 'elimina al paciente de prueba');
  const yaNo = (await pedir(base, '/api/admin/pacientes?q=Prueba')).data.find((item) => item.dni === '40111000');
  afirmar(!yaNo, 'el paciente eliminado no queda en el listado');
  const libreOtra = await pedir(base, '/api/disponibles');
  afirmar(libreOtra.data.dias.some((item) => item.fecha === dia.fecha && item.horas.includes(dia.horas[1])), 'al eliminar al paciente vuelve el horario');

  const aMinutos = (hora) => hora.split(':').map(Number).reduce((horas, mins) => horas * 60 + mins);
  const libresCortos = await pedir(base, `/api/disponibles?patologia=${primera.id}`);
  const diaLargo = libresCortos.data.dias.find((item) => item.horas.length >= 3);
  afirmar(Boolean(diaLargo), 'hay un día con varios inicios');
  const horaLarga = diaLargo.horas[0];
  const motivoMal = await pedir(base, '/api/turnos', {
    method: 'POST',
    body: { nombre: 'Juan', apellido: 'Sosa', dni: '25999111', obraId: particular.id, fecha: diaLargo.fecha, hora: horaLarga, patologiaId: 99999 },
  });
  afirmar(motivoMal.data.ok === false, 'rechaza un motivo que no existe');
  const reservaLarga = await pedir(base, '/api/turnos', {
    method: 'POST',
    body: { nombre: 'Juan', apellido: 'Sosa', dni: '25999111', obraId: particular.id, fecha: diaLargo.fecha, hora: horaLarga, patologiaId: conducto.id },
  });
  afirmar(reservaLarga.data.ok && reservaLarga.data.turno.minutos === 60 && reservaLarga.data.turno.patologia === 'Tratamiento de conducto', 'un conducto ocupa 60 minutos');
  const despues = await pedir(base, `/api/disponibles?patologia=${primera.id}`);
  const horasDespues = despues.data.dias.find((item) => item.fecha === diaLargo.fecha)?.horas || [];
  const pisan = diaLargo.horas.filter((hora) => aMinutos(hora) < aMinutos(horaLarga) + conducto.minutos && aMinutos(hora) + primera.minutos > aMinutos(horaLarga));
  afirmar(pisan.length >= 2 && pisan.every((hora) => !horasDespues.includes(hora)), 'el conducto tapa los turnos que se pisarían');
  const sigue = diaLargo.horas.filter((hora) => aMinutos(hora) >= aMinutos(horaLarga) + conducto.minutos);
  afirmar(sigue.length > 0 && sigue.every((hora) => horasDespues.includes(hora)), 'lo que queda después del conducto sigue libre');

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
