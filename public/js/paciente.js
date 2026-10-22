import { api, claseValidacion, esc, larga, obrasHtml, partesFecha } from './util.js';

const app = document.querySelector('#app');
const state = {
  inicio: null,
  paso: 'datos',
  form: { nombre: '', apellido: '', dni: '', nro: '', obraOtra: '' },
  obra: null,
  otra: false,
  validacion: null,
  dias: [],
  fecha: '',
  hora: '',
  turno: null,
  vigente: null,
  error: '',
  cargando: false,
  sheet: false,
  obras: [],
  buscar: '',
  codigoCancelar: '',
};

function marca() {
  const inicio = state.inicio;
  return `<div class="lockup">
    <img class="mark" src="/image/logo.png" alt="">
    <div>
      <p class="marca">${esc(inicio.marca)}</p>
      <h1>${esc(inicio.profesional)}</h1>
      <p class="matricula">Odontología · Matrícula ${esc(inicio.matricula)}</p>
    </div>
  </div>`;
}

function nota(texto, clase) {
  if (!texto) return '';
  return `<div class="nota ${clase || ''}" role="status"><p>${esc(texto)}</p></div>`;
}

function pista() {
  const formato = state.obra?.formato;
  if (state.otra) return 'Como figura en el carnet.';
  if (formato === 'pami') return '14 números del carnet. Los primeros 11 son el CUIL del titular.';
  if (formato === 'ioma') return 'Números del carnet de IOMA, sin la barra.';
  if (formato === 'ninguno') return '';
  if (formato === 'libre') return 'Como figura en el carnet. Si es un CUIL, se controla el dígito y que coincida con el DNI.';
  return 'Elegí la obra social para ver cómo cargar el número.';
}

function pantallaDatos() {
  const obra = state.obra;
  const esconderNumero = obra?.formato === 'ninguno' && !state.otra;
  return `<div class="ficha">
    ${marca()}
    <p class="direccion">${esc(state.inicio.direccion)}</p>
    <p class="bajada">${esc(state.inicio.bajada)}</p>
    <div class="pasos" aria-hidden="true"><span class="on"></span><span></span></div>
    <div class="par">
      <div>
        <label for="nombre">Nombre</label>
        <input id="nombre" data-field="nombre" autocomplete="given-name" maxlength="60" value="${esc(state.form.nombre)}">
      </div>
      <div>
        <label for="apellido">Apellido</label>
        <input id="apellido" data-field="apellido" autocomplete="family-name" maxlength="60" value="${esc(state.form.apellido)}">
      </div>
    </div>
    <label for="dni">DNI</label>
    <input id="dni" data-field="dni" inputmode="numeric" autocomplete="off" maxlength="12" value="${esc(state.form.dni)}">
    <p class="etiqueta">Obra social</p>
    <button type="button" class="elegida" data-accion="abrir-obras">
      <strong>${esc(obra ? obra.etiqueta : state.otra ? 'Otra' : 'Elegir')}</strong>
      <span>Buscar</span>
    </button>
    ${state.otra ? `<label for="obraOtra">Cuál</label><input id="obraOtra" data-field="obraOtra" maxlength="80" value="${esc(state.form.obraOtra)}">` : ''}
    ${esconderNumero ? '' : `<label for="nro">Número de afiliado</label>
      <input id="nro" data-field="nro" inputmode="text" autocomplete="off" maxlength="24" value="${esc(state.form.nro)}">
      <p class="pista">${esc(pista())}</p>`}
    ${nota(state.error, 'mal')}
    <div class="cierre">
      <button class="btn" type="button" data-accion="continuar" ${state.cargando ? 'disabled' : ''}>${state.cargando ? 'Revisando…' : 'Ver turnos'}</button>
      <button class="btn claro" type="button" data-accion="ir-buscar">Ya tengo un turno</button>
    </div>
  </div>
  ${state.sheet ? sheetObras() : ''}`;
}

function sheetObras() {
  return `<div class="sheet">
    <h2>Obra social</h2>
    <p class="bajada">Nacionales y de la provincia de Buenos Aires.</p>
    <label for="buscar-obra">Buscar</label>
    <input id="buscar-obra" data-field="buscar" placeholder="IOMA, PAMI, OSDE…" value="${esc(state.buscar)}">
    <div class="lista" id="lista-obras">${obrasHtml(state.obras)}</div>
    <button class="btn secundario" type="button" data-accion="cerrar-sheet">Cerrar</button>
  </div>`;
}

function pantallaTurno() {
  const dia = state.dias.find((item) => item.fecha === state.fecha) || state.dias[0];
  const horas = dia?.horas || [];
  return `${marca()}
    <div class="pasos" aria-hidden="true"><span class="on"></span><span class="on"></span></div>
    <h2>Hola, ${esc(state.form.nombre)}.</h2>
    <p class="bajada">Estos horarios son en el consultorio. En las clínicas no se saca turno por acá.</p>
    ${state.validacion ? nota(state.validacion.detalle, claseValidacion(state.validacion.estado)) : ''}
    ${state.dias.length ? `<div class="dias">${state.dias.map((item) => {
    const parte = partesFecha(item.fecha);
    return `<button type="button" class="dia ${item.fecha === dia.fecha ? 'on' : ''}" data-fecha="${esc(item.fecha)}">
        <small>${esc(parte.semana)}</small>
        ${esc(parte.numero)}
      </button>`;
  }).join('')}</div>
      <div class="horas">${horas.map((hora) => `
        <button type="button" class="hora" data-hora="${esc(hora)}" aria-pressed="${hora === state.hora}">${esc(hora)}</button>
      `).join('')}</div>` : nota('Por ahora no hay horarios abiertos en el consultorio. Cuando Alejandra los cargue, van a aparecer acá.')}
    ${nota(state.error, 'mal')}
    <button class="btn" type="button" data-accion="reservar" ${state.cargando || !state.hora ? 'disabled' : ''}>${state.cargando ? 'Reservando…' : 'Confirmar turno'}</button>
    <button class="enlace" type="button" data-accion="volver-datos">Volver a los datos</button>`;
}

function pantallaListo() {
  const turno = state.turno;
  return `${marca()}
    <p class="eyebrow">Turno reservado</p>
    <h2>Listo, ${esc(state.form.nombre)}.</h2>
    <p class="bajada">${esc(turno.cuando)}</p>
    <p class="hora-grande">${esc(turno.hora)}</p>
    <p class="direccion">${esc(state.inicio.direccion)}</p>
    <div class="codigo"><p>Código para cancelar</p><b>${esc(turno.codigo)}</b></div>
    ${state.validacion ? nota(state.validacion.detalle, claseValidacion(state.validacion.estado)) : ''}
    <p class="bajada">Traé el DNI y el carnet. Si no podés venir, cancelá con el código.</p>
    <button class="texto peligro" type="button" data-accion="cancelar-recien">Cancelar este turno</button>`;
}

function pantallaVigente() {
  const turno = state.vigente;
  if (!turno) {
    return `${marca()}
      <h2>No hay un turno activo con ese DNI.</h2>
      <button class="btn" type="button" data-accion="volver-datos">Sacar un turno</button>`;
  }
  return `${marca()}
    <p class="eyebrow">Turno reservado</p>
    <h2>${esc(turno.cuando)}</h2>
    <p class="hora-grande">${esc(turno.hora)}</p>
    <label for="codigo">Código de la reserva</label>
    <input id="codigo" data-field="codigoCancelar" maxlength="8" autocapitalize="characters" value="${esc(state.codigoCancelar)}">
    ${nota(state.error, 'mal')}
    <button class="btn secundario" type="button" data-accion="cancelar-codigo">Cancelar turno</button>
    <button class="enlace" type="button" data-accion="volver-datos">Volver</button>`;
}

function pantallaBuscar() {
  return `${marca()}
    <h2>Buscar mi turno</h2>
    <label for="dni">DNI</label>
    <input id="dni" data-field="dni" inputmode="numeric" maxlength="12" value="${esc(state.form.dni)}">
    ${nota(state.error, 'mal')}
    <button class="btn" type="button" data-accion="buscar-turno">Buscar</button>
    <button class="enlace" type="button" data-accion="volver-datos">Volver</button>`;
}

function render() {
  if (!state.inicio) {
    app.innerHTML = '<p class="bajada">Cargando el consultorio…</p>';
    return;
  }
  const pantallas = {
    datos: pantallaDatos,
    turno: pantallaTurno,
    listo: pantallaListo,
    vigente: pantallaVigente,
    buscar: pantallaBuscar,
  };
  app.innerHTML = (pantallas[state.paso] || pantallaDatos)();
  app.classList.toggle('una', state.paso === 'datos' && !state.sheet);
  if (state.sheet) document.querySelector('#buscar-obra')?.focus();
}

let busquedaTimer = 0;
async function buscarObras(texto) {
  state.obras = await api(`/api/obras?q=${encodeURIComponent(texto)}`);
  const lista = document.querySelector('#lista-obras');
  if (lista) lista.innerHTML = obrasHtml(state.obras);
}

function cuerpo() {
  return {
    nombre: state.form.nombre,
    apellido: state.form.apellido,
    dni: state.form.dni,
    nro: state.form.nro,
    obraId: state.otra ? null : state.obra?.id,
    obraOtra: state.otra ? state.form.obraOtra : '',
  };
}

async function continuar() {
  state.cargando = true;
  state.error = '';
  render();
  try {
    const revision = await api('/api/revisar', { method: 'POST', body: cuerpo() });
    state.validacion = revision.validacion;
    if (!revision.ok) {
      state.error = revision.errores?.[0] || 'Revisá los datos.';
      state.paso = 'datos';
      return;
    }
    if (revision.turno) {
      state.vigente = revision.turno;
      state.paso = 'vigente';
      state.error = 'Ya tenés un turno. Para elegir otro, primero cancelá este.';
      return;
    }
    state.dias = (await api('/api/disponibles')).dias;
    state.fecha = state.dias[0]?.fecha || '';
    state.hora = '';
    state.paso = 'turno';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.cargando = false;
    render();
  }
}

async function reservar() {
  state.cargando = true;
  state.error = '';
  render();
  try {
    const resultado = await api('/api/turnos', {
      method: 'POST',
      body: { ...cuerpo(), fecha: state.fecha, hora: state.hora },
    });
    if (!resultado.ok) {
      state.error = resultado.error;
      if (resultado.turno) {
        state.vigente = resultado.turno;
        state.paso = 'vigente';
      } else {
        state.dias = (await api('/api/disponibles')).dias;
        if (!state.dias.some((dia) => dia.fecha === state.fecha)) state.fecha = state.dias[0]?.fecha || '';
        state.hora = '';
      }
      return;
    }
    state.turno = resultado.turno;
    state.paso = 'listo';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.cargando = false;
    render();
  }
}

app.addEventListener('input', (evento) => {
  const campo = evento.target.dataset.field;
  if (!campo) return;
  if (campo === 'buscar') {
    state.buscar = evento.target.value;
    clearTimeout(busquedaTimer);
    busquedaTimer = setTimeout(() => buscarObras(state.buscar), 160);
    return;
  }
  if (campo === 'codigoCancelar') state.codigoCancelar = evento.target.value;
  else state.form[campo] = evento.target.value;
});

app.addEventListener('click', async (evento) => {
  const obraId = evento.target.closest('[data-obra]')?.dataset.obra;
  if (obraId) {
    state.obra = state.obras.find((obra) => String(obra.id) === obraId) || null;
    state.otra = false;
    state.sheet = false;
    state.error = '';
    render();
    return;
  }
  const fecha = evento.target.closest('[data-fecha]')?.dataset.fecha;
  if (fecha) {
    state.fecha = fecha;
    state.hora = '';
    render();
    return;
  }
  const hora = evento.target.closest('[data-hora]')?.dataset.hora;
  if (hora) {
    state.hora = hora;
    render();
    return;
  }
  const accion = evento.target.closest('[data-accion]')?.dataset.accion;
  if (!accion) return;
  if (accion === 'abrir-obras') {
    state.sheet = true;
    state.buscar = '';
    state.obras = await api('/api/obras');
    render();
  } else if (accion === 'cerrar-sheet') {
    state.sheet = false;
    render();
  } else if (accion === 'obra-otra') {
    state.otra = true;
    state.obra = null;
    state.sheet = false;
    render();
  } else if (accion === 'continuar') {
    await continuar();
  } else if (accion === 'volver-datos') {
    state.paso = 'datos';
    state.error = '';
    render();
  } else if (accion === 'reservar') {
    await reservar();
  } else if (accion === 'ir-buscar') {
    state.paso = 'buscar';
    state.error = '';
    render();
  } else if (accion === 'buscar-turno') {
    const resultado = await api('/api/mio', { method: 'POST', body: { dni: state.form.dni } });
    if (!resultado.ok) {
      state.error = resultado.errores?.[0] || 'Revisá el DNI.';
      render();
      return;
    }
    state.vigente = resultado.turno;
    state.paso = 'vigente';
    state.error = '';
    render();
  } else if (accion === 'cancelar-codigo' || accion === 'cancelar-recien') {
    const codigo = accion === 'cancelar-recien' ? state.turno?.codigo : state.codigoCancelar;
    const resultado = await api('/api/cancelar', {
      method: 'POST',
      body: { dni: state.form.dni, codigo },
    });
    if (!resultado.ok) {
      state.error = resultado.error;
      render();
      return;
    }
    state.turno = null;
    state.vigente = null;
    state.paso = 'datos';
    state.error = '';
    state.form.nro = state.form.nro;
    render();
    app.insertAdjacentHTML('beforeend', nota('El turno quedó cancelado. Podés elegir otro.', 'bien'));
  }
});

state.inicio = await api('/api/inicio');
state.obras = await api('/api/obras');
render();
