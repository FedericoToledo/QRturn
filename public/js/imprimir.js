import { esc } from './util.js';

function fechaHoy() {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
}

function cabecera(ficha) {
  return `<header class="cabecera">
    <img src="${esc(ficha.logo || '/image/logoRebranding.png')}" alt="">
    <div>
      <p class="marca">${esc(ficha.marca || '')}</p>
      <p class="profesional">${esc(ficha.profesional || '')}</p>
      <p class="matricula">Odontología · Matrícula ${esc(ficha.matricula || '')}</p>
    </div>
  </header>`;
}

function pie(ficha, rubro) {
  return `<footer class="pie">
    <span>${esc(ficha.direccion || '')}</span>
    <span>${esc(rubro)} · ${esc(fechaHoy())}</span>
  </footer>`;
}

function cuerpoNota(paciente, nota) {
  return `<p class="quien">${esc(paciente.apellido)}, ${esc(paciente.nombre)}</p>
    <p class="dato">DNI ${esc(paciente.dni)} · ${esc(paciente.obra || '')}</p>
    <p class="cuando">${esc(nota.fecha)}</p>
    ${nota.diagnostico ? `<h2>Diagnóstico</h2><p>${esc(nota.diagnostico)}</p>` : ''}
    ${nota.anotacion ? `<h2>Anotación</h2><p>${esc(nota.anotacion)}</p>` : ''}`;
}

function cuerpoTurno(paciente, turno) {
  const motivo = turno.patologia
    ? `<p class="motivo">${esc(turno.patologia)}${turno.minutos ? ` · ${esc(turno.minutos)} min` : ''}</p>`
    : '';
  const codigo = turno.codigo
    ? `<h2>Código para cancelar</h2><p class="codigo-pdf">${esc(turno.codigo)}</p>`
    : '';
  return `<p class="quien">${esc(paciente.apellido)}, ${esc(paciente.nombre)}</p>
    <p class="dato">DNI ${esc(paciente.dni)}${paciente.obra ? ` · ${esc(paciente.obra)}` : ''}</p>
    <p class="cuando">${esc(turno.cuando || '')}</p>
    <p class="hora-turno">${esc(turno.hora || '')}</p>
    ${motivo}
    ${codigo}
    <p class="aviso">Traé el DNI y el carnet.</p>`;
}

function cuerpoGaleria(paciente, fotos) {
  const piezas = fotos.map((foto) => `<figure class="foto">
    <img src="${esc(foto.src)}" alt="${esc(foto.nombre)}">
    <figcaption>${esc(foto.nombre)}</figcaption>
  </figure>`).join('');
  return `<p class="quien">${esc(paciente.apellido)}, ${esc(paciente.nombre)}</p>
    <p class="dato">DNI ${esc(paciente.dni)} · ${esc(paciente.obra || '')}</p>
    <h2>Galería</h2>
    ${piezas}`;
}

function documentoTelefono({ titulo, ficha, cuerpo }) {
  const tema = ficha.tema || 'turquesa';
  const fuente = ficha.fuente || 'fraunces';
  const base = typeof location !== 'undefined' ? location.origin : '';
  return `<!DOCTYPE html>
<html lang="es" data-tema="${esc(tema)}" data-fuente="${esc(fuente)}">
<head>
  <meta charset="utf-8">
  <base href="${esc(base)}/">
  <title>${esc(titulo)}</title>
  <link rel="stylesheet" href="/css/app.css">
  <style>
    @page { size: 92mm 168mm; margin: 6mm; }
    @media print { html, body, body * { visibility: visible !important; } }
    * { font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0, "calt" 0; }
    html, body { height: 100%; margin: 0; background: #fff; color: #123833; }
    body, p, h2, span { font-family: "Segoe UI", sans-serif; }
    body { display: flex; flex-direction: column; font-size: 13px; line-height: 1.35; }
    .cabecera { display: flex; gap: 8px; align-items: center; padding-bottom: 4mm; border-bottom: 1px solid var(--line); }
    .cabecera img { width: 52px; height: 30px; object-fit: contain; }
    .cabecera .marca { margin: 0; font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 12px; color: #14786f; }
    .cabecera .profesional { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.1; }
    .cabecera .matricula { margin: 1px 0 0; color: var(--muted); font-size: 10px; }
    .cuerpo { flex: 1 0 auto; display: flex; flex-direction: column; justify-content: space-evenly; gap: 4mm; padding: 4mm 0; }
    .quien { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 22px; line-height: 1.1; }
    .dato, .cuando { margin: 0; color: var(--muted); font-size: 13px; }
    .hora-turno { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 36px; line-height: 0.95; }
    .motivo, .aviso { margin: 0; font-size: 14px; }
    h2 { margin: 0 0 1mm; font-size: 13px; font-weight: 600; }
    p { margin: 0; }
    .codigo-pdf { font-family: Georgia, "Times New Roman", serif; font-size: 26px; letter-spacing: 0.12em; }
    .pie { display: flex; flex-direction: column; gap: 2px; margin-top: auto; padding-top: 3mm; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; }
  </style>
</head>
<body>
  ${cabecera(ficha)}
  <main class="cuerpo">${cuerpo}</main>
  ${pie(ficha, 'Turno')}
</body>
</html>`;
}

function documento({ titulo, ficha, rubro, cuerpo }) {
  const tema = ficha.tema || 'turquesa';
  const fuente = ficha.fuente || 'fraunces';
  const base = typeof location !== 'undefined' ? location.origin : '';
  return `<!DOCTYPE html>
<html lang="es" data-tema="${esc(tema)}" data-fuente="${esc(fuente)}">
<head>
  <meta charset="utf-8">
  <base href="${esc(base)}/">
  <title>${esc(titulo)}</title>
  <link rel="stylesheet" href="/css/app.css">
  <style>
    @page { size: A4; margin: 16mm 16mm 18mm; }
    @media print { html, body, body * { visibility: visible !important; } }
    * { font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0, "calt" 0; }
    html, body { margin: 0; background: #fff; color: #123833; }
    body, p, h2, span, figcaption { font-family: "Segoe UI", sans-serif; }
    body { font-size: 14px; line-height: 1.45; }
    .hoja { width: 100%; border-collapse: collapse; }
    .hoja td { padding: 0; vertical-align: top; }
    .cabecera { display: flex; gap: 12px; align-items: center; padding-bottom: 8mm; border-bottom: 1px solid var(--line); }
    .cabecera img { width: 78px; height: 46px; object-fit: contain; }
    .cabecera .marca { margin: 0; font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 15px; color: #14786f; }
    .cabecera .profesional { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 22px; line-height: 1.1; }
    .cabecera .matricula { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
    .cuerpo { padding-top: 8mm; }
    .quien { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 26px; line-height: 1.15; }
    .dato, .cuando { margin: 4px 0 0; color: var(--muted); }
    h2 { margin: 7mm 0 2mm; font-size: 18px; }
    p { margin: 0; }
    .foto { margin: 6mm 0 0; page-break-inside: avoid; }
    .foto img { display: block; width: 100%; max-height: 150mm; object-fit: contain; }
    .foto figcaption { margin-top: 2mm; color: var(--muted); font-size: 12px; }
    .hora-turno { margin-top: 3mm; font-family: Georgia, "Times New Roman", serif; font-size: 40px; line-height: 1; }
    .motivo, .aviso { margin-top: 4mm; }
    .codigo-pdf { font-family: Georgia, "Times New Roman", serif; font-size: 28px; letter-spacing: 0.14em; }
    .pie { display: flex; justify-content: space-between; gap: 12px; padding-top: 4mm; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  </style>
</head>
<body>
  <table class="hoja">
    <thead><tr><td>${cabecera(ficha)}</td></tr></thead>
    <tfoot><tr><td>${pie(ficha, rubro)}</td></tr></tfoot>
    <tbody><tr><td><div class="cuerpo">${cuerpo}</div></td></tr></tbody>
  </table>
</body>
</html>`;
}

export async function exportarPdf({ titulo, ficha, paciente, nota, fotos, turno }) {
  const rubro = turno ? 'Turno' : nota ? 'Historia clínica' : 'Galería';
  const cuerpo = turno ? cuerpoTurno(paciente, turno) : nota ? cuerpoNota(paciente, nota) : cuerpoGaleria(paciente, fotos || []);
  const marco = document.createElement('iframe');
  marco.setAttribute('data-exportacion', '');
  marco.setAttribute('title', titulo);
  marco.style.cssText = turno
    ? 'position:fixed;left:0;top:0;width:92mm;height:168mm;border:0;background:#fff;z-index:2147483646'
    : 'position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;background:#fff;z-index:2147483646';
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  doc.open();
  doc.write(turno ? documentoTelefono({ titulo, ficha, cuerpo }) : documento({ titulo, ficha, rubro, cuerpo }));
  doc.close();
  const imagenes = [...doc.images];
  await Promise.race([
    Promise.all([
      doc.fonts?.ready || Promise.resolve(),
      ...imagenes.map((img) => (img.complete ? null : new Promise((resolver) => {
        img.addEventListener('load', resolver, { once: true });
        img.addEventListener('error', resolver, { once: true });
      }))),
    ]),
    new Promise((resolver) => { setTimeout(resolver, 2500); }),
  ]);
  const ventana = marco.contentWindow;
  ventana.addEventListener('afterprint', () => marco.remove());
  if (!navigator.webdriver) ventana.print();
  else setTimeout(() => marco.remove(), 4000);
}
