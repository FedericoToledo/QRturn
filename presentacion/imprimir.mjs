import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = pathToFileURL(path.join(dir, 'index.html')).href;
const pdf = path.join(dir, 'Para-Alejandra.pdf');
const qa = path.join(process.env.TEMP || 'C:\\Users\\fedet\\AppData\\Local\\Temp', 'dentapp-pdf-qa');
fs.mkdirSync(qa, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--disable-gpu', '--allow-file-access-from-files'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
  await page.goto(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  const hojas = await page.$$('.hoja');
  for (let i = 0; i < hojas.length; i += 1) {
    const nombre = `${String(i + 1).padStart(2, '0')}.png`;
    await hojas[i].screenshot({ path: path.join(qa, nombre) });
  }
  await page.pdf({
    path: pdf,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  console.log(`${pdf} ${hojas.length} ${qa}`);
} finally {
  await browser.close();
}
