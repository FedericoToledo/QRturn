import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fotos = path.join(raiz, 'presentacion', 'capturas');
fs.mkdirSync(fotos, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dentapp-pdf-'));
const db = path.join(dir, 'test.sqlite');

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
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--disable-gpu'],
});

async function tiro(page, nombre) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(fotos, nombre) });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  await tiro(page, '01-datos.png');

  await page.click('[data-accion="abrir-obras"]');
  await page.waitForSelector('#buscar-obra');
  await tiro(page, '02-obras.png');
  await page.evaluate(() => {
    const boton = [...document.querySelectorAll('[data-obra]')].find((nodo) => nodo.innerText.includes('IOMA'));
    boton.click();
  });
  await page.waitForSelector('#nro');
  await page.type('#nombre', 'María');
  await page.type('#apellido', 'López');
  await page.type('#dni', '30111222');
  await page.type('#nro', '556677889');
  await tiro(page, '03-completo.png');

  await page.click('[data-accion="continuar"]');
  await page.waitForSelector('.hora');
  await tiro(page, '04-turnos.png');
  await page.click('.hora');
  await page.click('[data-accion="reservar"]');
  await page.waitForSelector('.codigo');
  await tiro(page, '05-listo.png');

  await page.goto(`${base}/admin`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-tecla="1"]');
  await tiro(page, '06-clave.png');
  for (const digito of pin) await page.click(`[data-tecla="${digito}"]`);
  await page.waitForSelector('h2');
  for (let i = 0; i < 10 && !(await page.evaluate(() => document.body.innerText.includes('López'))); i += 1) {
    await page.click('[data-accion="dia-siguiente"]');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await tiro(page, '07-agenda.png');

  await page.click('[data-tab="horarios"]');
  await page.waitForFunction(() => document.body.innerText.includes('Horarios ocupados'));
  await tiro(page, '08-horarios.png');
  await page.evaluate(() => document.querySelectorAll('.dia-card')[1]?.scrollIntoView());
  await new Promise((resolve) => setTimeout(resolve, 200));
  await tiro(page, '09-ocupados.png');
  await page.evaluate(() => document.querySelector('.grilla')?.scrollIntoView());
  await new Promise((resolve) => setTimeout(resolve, 200));
  await tiro(page, '10-proximos.png');

  await page.click('[data-tab="pacientes"]');
  await page.waitForFunction(() => document.body.innerText.includes('Listado de pacientes registrados'));
  await tiro(page, '11-pacientes.png');

  await page.click('[data-tab="mas"]');
  await page.waitForSelector('#poster');
  await page.evaluate(() => document.querySelector('#poster')?.scrollIntoView({ block: 'center' }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await tiro(page, '12-cartel.png');
  console.log(fotos);
} finally {
  await browser.close();
  child.kill();
}
