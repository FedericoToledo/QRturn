export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[caracter]));
}

export function sumar(fecha, dias) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const armada = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return armada.toISOString().slice(0, 10);
}

export function larga(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const texto = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(Date.UTC(anio, mes - 1, dia, 15)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function partesFecha(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const formato = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  const partes = {};
  for (const parte of formato.formatToParts(new Date(Date.UTC(anio, mes - 1, dia, 15)))) {
    partes[parte.type] = parte.value;
  }
  return {
    semana: (partes.weekday || '').replace('.', ''),
    numero: partes.day || '',
  };
}

export function corta(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(Date.UTC(anio, mes - 1, dia, 15))).replace(/\./g, '');
}

export async function api(url, opciones = {}) {
  const respuesta = await fetch(url, {
    method: opciones.method || 'GET',
    headers: opciones.body ? { 'content-type': 'application/json' } : undefined,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const tipo = respuesta.headers.get('content-type') || '';
  const data = tipo.includes('json') ? await respuesta.json() : null;
  if (!respuesta.ok) {
    const error = new Error(data?.error || 'No se pudo completar.');
    error.status = respuesta.status;
    throw error;
  }
  return data;
}

export function claseValidacion(estado) {
  if (['cuil_ok', 'pami_titular', 'verificado_padron'].includes(estado)) return 'bien';
  if (['cuil_invalido', 'padron_distinto', 'formato_invalido', 'fuera_de_padron', 'vacio'].includes(estado)) return 'mal';
  return '';
}

export function legalDe(obra) {
  const etiqueta = (obra.etiqueta || '').trim().toLowerCase();
  const nombre = (obra.nombre || '').trim().toLowerCase();
  if (!nombre || nombre === etiqueta || nombre.startsWith(etiqueta)) return '';
  return obra.nombre;
}

export function obrasHtml(obras) {
  const items = obras.map((obra) => {
    const legal = legalDe(obra);
    return `<button type="button" class="obra" data-obra="${obra.id}">
      <span class="sigla">${esc(obra.etiqueta)}</span>
      ${legal ? `<span class="legal">${esc(legal)}</span>` : ''}
    </button>`;
  }).join('');
  return `${items}<button type="button" class="obra" data-accion="obra-otra"><span class="sigla">Otra</span><span class="legal">No está en la lista. La escribo yo.</span></button>`;
}
