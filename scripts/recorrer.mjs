import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dentapp-ui-'));
const db = path.join(dir, 'test.sqlite');
const fotos = path.join(dir, 'fotos');
fs.mkdirSync(fotos);

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: raiz,
  env: { ...process.env, PORT: '0', DENTAPP_DB: db },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let salida = '';
child.stdout.on('data', (trozo) => { salida += trozo; });
child.stderr.on('data', (trozo) => { salida += trozo; });

const puerto = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(salida)), 20000);
  const mirar = () => {
    const coincidencia = salida.match(/LISTO (\d+)/);
    if (!coincidencia) return;
    clearTimeout(timer);
    resolve(Number(coincidencia[1]));
  };
  child.stdout.on('data', mirar);
  mirar();
});

const base = `http://127.0.0.1:${puerto}`;
const pin = fs.readFileSync(path.join(dir, 'clave-de-prueba.txt'), 'utf8').match(/\d{6}/)[0];
const errores = [];
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--disable-gpu'],
});

let page;
try {
  page = await browser.newPage();
  page.on('pageerror', (error) => errores.push(error.message));
  page.on('console', (mensaje) => {
    const texto = mensaje.text();
    if (mensaje.type() === 'error' && !texto.includes('401')) errores.push(texto);
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  const desborde = async (nombre) => {
    const medidas = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      ancho: document.documentElement.clientWidth,
    }));
    if (medidas.scroll > medidas.ancho + 1) errores.push(`desborde en ${nombre}: ${medidas.scroll} > ${medidas.ancho}`);
  };
  await desborde('datos');
  await page.screenshot({ path: path.join(fotos, '01-datos.png') });

  await page.type('#nombre', 'María');
  await page.type('#apellido', 'López');
  await page.type('#dni', '30111222');
  await page.click('[data-accion="abrir-obras"]');
  await page.waitForSelector('#buscar-obra');
  await page.type('#buscar-obra', 'IOMA');
  await page.waitForFunction(() => {
    const obras = [...document.querySelectorAll('[data-obra]')].map((nodo) => nodo.innerText);
    return obras.length > 0 && obras.every((texto) => texto.toUpperCase().includes('IOMA'));
  });
  await page.screenshot({ path: path.join(fotos, '02-obras.png') });
  await page.evaluate(() => {
    const boton = [...document.querySelectorAll('[data-obra]')].find((nodo) => nodo.innerText.includes('IOMA'));
    boton.click();
  });
  await page.waitForSelector('#nro');
  await page.type('#nro', '556677889');
  await page.click('[data-accion="continuar"]');
  await page.waitForSelector('.hora');
  await desborde('turnos');
  await page.screenshot({ path: path.join(fotos, '03-turnos.png') });
  await page.click('.hora');
  await page.click('[data-accion="reservar"]');
  await page.waitForSelector('.codigo');
  const confirmado = await page.evaluate(() => document.body.innerText);
  const texto = confirmado.toLowerCase();
  if (!texto.includes('turno reservado') || !texto.includes('maría')) {
    errores.push(`la confirmación no muestra el turno: ${confirmado.slice(0, 300)}`);
  }
  await page.screenshot({ path: path.join(fotos, '04-listo.png') });

  await page.goto(`${base}/admin`, { waitUntil: 'networkidle0' });
  for (const digito of pin) {
    await page.click(`[data-tecla="${digito}"]`);
  }
  await page.waitForSelector('h2');
  for (let i = 0; i < 8 && !(await page.evaluate(() => document.body.innerText.includes('López'))); i += 1) {
    await page.click('[data-accion="dia-siguiente"]');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await desborde('agenda');
  await page.screenshot({ path: path.join(fotos, '05-agenda.png'), fullPage: true });
  await page.click('[data-tab="horarios"]');
  await page.waitForFunction(() => document.body.innerText.includes('Cada semana') && document.body.innerText.includes('Próximos'));
  await page.click('[data-horario-dia="1"]');
  await page.waitForFunction(() => document.querySelector('h3')?.innerText === 'Lunes');
  await page.click('[data-horario-dia="4"]');
  await page.waitForFunction(() => document.body.innerText.includes('Jueves') && document.body.innerText.includes('Disponible'));
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll('.franja')].find((item) => item.innerText.includes('18:00–21:00'));
    fila.querySelector('[data-poner-tipo="clinica"]').click();
  });
  await page.waitForFunction(() => {
    const fila = [...document.querySelectorAll('.franja')].find((item) => item.innerText.includes('18:00–21:00'));
    return fila?.querySelector('[data-poner-tipo="clinica"]')?.getAttribute('aria-pressed') === 'true';
  });
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll('.franja')].find((item) => item.innerText.includes('18:00–21:00'));
    fila.querySelector('[data-poner-tipo="consultorio"]').click();
  });
  await page.waitForFunction(() => {
    const fila = [...document.querySelectorAll('.franja')].find((item) => item.innerText.includes('18:00–21:00'));
    return fila?.querySelector('[data-poner-tipo="consultorio"]')?.getAttribute('aria-pressed') === 'true';
  });
  const grilla = await page.evaluate(() => document.querySelector('.minigrilla')?.innerText || '');
  const hayTurno = await page.evaluate(() => !!document.querySelector('.minigrilla .celda[data-ir-fecha]'));
  if (!hayTurno) errores.push(`la minigrilla no muestra el turno: ${grilla}`);
  if (!/\d+–\d+/.test(grilla)) errores.push(`la minigrilla no muestra ocupados: ${grilla}`);
  const rango = await page.evaluate(() => document.querySelector('.grilla .bajada')?.innerText || '');
  const hayPaso = await page.evaluate(() => !!document.querySelector('[data-accion="semana-siguiente"]'));
  if (!hayPaso) errores.push('falta el botón de la semana siguiente');
  await page.click('[data-accion="semana-siguiente"]');
  await page.waitForFunction((anterior) => {
    const nuevo = document.querySelector('.grilla .bajada')?.innerText || '';
    return nuevo && nuevo !== anterior;
  }, {}, rango);
  if (!(await page.evaluate(() => !!document.querySelector('[data-accion="semana-anterior"]')))) {
    errores.push('falta volver a la semana anterior');
  }
  await page.click('[data-accion="semana-anterior"]');
  await page.waitForFunction((anterior) => (document.querySelector('.grilla .bajada')?.innerText || '') === anterior, {}, rango);
  const tarjetas = await page.evaluate(() => [...document.querySelectorAll('.dia-card')].map((card) => card.innerText.toLowerCase()));
  if ((tarjetas[0] || '').includes('horarios ocupados')) errores.push('los horarios ocupados siguen en la tarjeta del día');
  if (!(tarjetas[1] || '').includes('horarios ocupados') || (tarjetas[1] || '').includes('nueva franja')) {
    errores.push('falta la tarjeta de horarios ocupados');
  }
  if (!(tarjetas[2] || '').includes('nueva franja horaria')) errores.push('falta la tarjeta de nueva franja horaria');
  await desborde('horarios');
  await page.screenshot({ path: path.join(fotos, '06-horarios.png') });
  await page.evaluate(() => document.querySelector('.grilla')?.scrollIntoView());
  await page.screenshot({ path: path.join(fotos, '06b-grilla.png') });
  await page.click('.celda[data-ir-fecha]');
  await page.waitForFunction(() => document.body.innerText.includes('López'));

  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  await desborde('datos-360');
  await page.screenshot({ path: path.join(fotos, '07-angosto.png') });

  console.log(errores.length ? errores.join('\n') : 'sin errores de página');
  console.log(fotos);
} catch (error) {
  errores.push(error.message);
  if (page) {
    const texto = await page.evaluate(() => (document.body?.innerText || '').slice(0, 600)).catch(() => '');
    console.log(texto);
    await page.screenshot({ path: path.join(fotos, 'error.png') }).catch(() => {});
  }
  console.log(errores.join('\n'));
  console.log(fotos);
} finally {
  await browser.close();
  child.kill();
  await new Promise((resolve) => child.on('exit', resolve));
}

if (errores.length) process.exit(1);
