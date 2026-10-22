import { api, claseValidacion, corta, esc, larga, obrasHtml, sumar } from './util.js';

const app = document.querySelector('#app');
const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const state = {
  authed: false,
  pin: '',
  error: '',
  tab: 'agenda',
  fecha: '',
  dia: null,
  abierto: null,
  bloques: [],
  pacientes: [],
  consulta: '',
  ajustes: null,
  mensaje: '',
  mensajeMal: false,
  anotar: null,
  horarioDia: null,
  semana: null,
  semanasAdelante: 0,
};

function nav() {
  if (!state.authed) return '';
  const item = (id, texto) => `<button type="button" data-tab="${id}" aria-current="${state.tab === id ? 'page' : 'false'}">${texto}</button>`;
  return `<nav class="nav">${item('agenda', 'Agenda')}${item('horarios', 'Horarios')}${item('pacientes', 'Pacientes')}${item('mas', 'Más')}</nav>`;
}

function nota(texto, clase) {
  if (!texto) return '';
  return `<div class="nota ${clase || ''}" role="status"><p>${esc(texto)}</p></div>`;
}

function login() {
  const puntos = [0, 1, 2, 3, 4, 5].map((i) => `<i class="${i < state.pin.length ? 'on' : ''}"></i>`).join('');
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((tecla) => (
    tecla
      ? `<button type="button" class="tecla" data-tecla="${tecla}">${tecla}</button>`
      : '<span class="tecla vacia"></span>'
  )).join('');
  return `<div class="lockup">
      <img class="mark" src="/image/logo.png" alt="">
      <div>
        <p class="marca">Dent.</p>
        <h1>Agenda</h1>
      </div>
    </div>
    <p class="bajada">Alejandra Reverter · solo en este teléfono.</p>
    <div class="puntos" aria-label="Clave">${puntos}</div>
    <div class="teclado">${teclas}</div>
    ${nota(state.error, 'mal')}`;
}

function eventosDelDia() {
  const dia = state.dia;
  const eventos = [];
  for (const bloque of dia.bloques) {
    if (bloque.tipo === 'consultorio') continue;
    eventos.push({ tipo: 'bloque', desde: bloque.desde, hasta: bloque.hasta, lugar: bloque.lugar, clase: bloque.tipo });
  }
  for (const turno of dia.turnos) eventos.push({ tipo: 'turno', desde: turno.hora, turno });
  for (const hora of dia.libres) eventos.push({ tipo: 'libre', desde: hora });
  eventos.sort((a, b) => a.desde.localeCompare(b.desde) || (a.tipo === 'bloque' ? -1 : 1));
  return eventos;
}

function agenda() {
  const dia = state.dia;
  const consultorio = dia.bloques.filter((bloque) => bloque.tipo === 'consultorio');
  const horasConsultorio = consultorio.length
    ? consultorio.map((bloque) => `${bloque.desde}–${bloque.hasta}`).join(', ')
    : 'sin horarios';
  const lista = eventosDelDia().map((evento) => {
    if (evento.tipo === 'bloque') {
      return `<article class="banda ${evento.clase === 'cerrado' ? 'cerrado' : ''}">
        <strong>${esc(evento.desde)}–${esc(evento.hasta)}</strong>
        <div>${esc(evento.lugar)}</div>
      </article>`;
    }
    if (evento.tipo === 'libre') {
      return `<button type="button" class="libre" data-hora-libre="${esc(evento.desde)}">${esc(evento.desde)} · Libre, anotar un turno</button>`;
    }
    const turno = evento.turno;
    const abierto = state.abierto === turno.id;
    const validacion = turno.validacion;
    return `<article class="turno" data-turno="${turno.id}">
      <div class="fila"><span>${esc(turno.hora)}</span><span>${esc(turno.estado)}</span></div>
      <div class="quien">${esc(turno.apellido)}, ${esc(turno.nombre)}</div>
      <div class="detalle">${esc(turno.obra)} · DNI ${esc(turno.dni)}</div>
      ${validacion ? `<span class="badge ${claseValidacion(validacion.estado)}">${esc(validacion.titulo)}</span>` : ''}
      ${abierto ? `<div class="detalle">Afiliado ${esc(turno.nro_afiliado || '—')} · código ${esc(turno.codigo)}</div>
        <p class="detalle">${esc(validacion?.detalle || '')}</p>
        <div class="acciones">
          <button type="button" class="chico" data-estado="confirmado" data-id="${turno.id}">Cobertura ok</button>
          <button type="button" class="chico" data-estado="atendido" data-id="${turno.id}">Atendido</button>
          <button type="button" class="chico" data-estado="ausente" data-id="${turno.id}">No vino</button>
          <button type="button" class="texto peligro" data-estado="cancelado" data-id="${turno.id}">Cancelar</button>
        </div>` : ''}
    </article>`;
  }).join('');
  return `<div class="dia-nav">
      <button type="button" data-accion="dia-anterior" aria-label="Día anterior">‹</button>
      <div><p class="eyebrow">Agenda</p><h2>${esc(larga(dia.fecha))}</h2></div>
      <button type="button" data-accion="dia-siguiente" aria-label="Día siguiente">›</button>
    </div>
    <p class="bajada">Consultorio: ${esc(horasConsultorio)}.</p>
    ${dia.fecha === hoyLocal() ? '' : '<button class="enlace" type="button" data-accion="hoy">Volver a hoy</button>'}
    ${lista || '<p class="vacio">Este día no tiene nada cargado.</p>'}
    ${state.anotar ? formularioAnotar() : ''}
    ${nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien')}`;
}

function hoyLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function weekdayDe(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

function rangoSemana(desde, hasta) {
  const texto = (fecha) => {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(anio, mes - 1, dia, 12)));
  };
  const inicio = texto(desde);
  const fin = texto(hasta);
  const mesInicio = inicio.split(' de ')[1];
  const mesFin = fin.split(' de ')[1];
  if (mesInicio === mesFin) return `${inicio.split(' de ')[0]} al ${fin}`;
  return `${inicio} al ${fin}`;
}

function formularioAnotar() {
  const anotar = state.anotar;
  return `<section class="caja" id="anotar">
    <h3>Anotar ${esc(anotar.hora)}</h3>
    <label for="a-nombre">Nombre</label>
    <input id="a-nombre" data-anotar="nombre" value="${esc(anotar.nombre)}">
    <label for="a-apellido">Apellido</label>
    <input id="a-apellido" data-anotar="apellido" value="${esc(anotar.apellido)}">
    <label for="a-dni">DNI</label>
    <input id="a-dni" data-anotar="dni" inputmode="numeric" value="${esc(anotar.dni)}">
    <label for="a-obra">Obra social</label>
    <input id="a-obra" data-anotar="q" placeholder="Buscar" value="${esc(anotar.q)}">
    <div id="lista-anotar">${obrasHtml(anotar.obras)}</div>
    <p class="pista">Elegida: ${esc(anotar.otra ? 'Otra' : anotar.obra?.etiqueta || 'ninguna')}</p>
    ${anotar.otra ? `<input data-anotar="obraOtra" placeholder="Nombre de la cobertura" value="${esc(anotar.obraOtra)}">` : ''}
    ${anotar.obra?.formato === 'ninguno' ? '' : `<label for="a-nro">Número de afiliado</label><input id="a-nro" data-anotar="nro" value="${esc(anotar.nro)}">`}
    ${nota(anotar.error, 'mal')}
    <button class="btn" type="button" data-accion="guardar-anotar">Guardar turno</button>
    <button class="texto" type="button" data-accion="cerrar-anotar">Cerrar</button>
  </section>`;
}

function bloqueItem(bloque) {
  const texto = bloque.tipo === 'consultorio' ? 'Consultorio' : bloque.tipo === 'clinica' ? 'Clínica' : 'Cerrado';
  return `<div class="item fila">
    <div><strong>${texto}</strong> ${esc(bloque.desde)}–${esc(bloque.hasta)}<div class="detalle">${esc(bloque.lugar)}</div></div>
    <button type="button" class="texto peligro" data-borrar="${bloque.id}">Quitar</button>
  </div>`;
}

function ocupacionDe(bloque) {
  const nombre = (bloque.lugar || '').trim();
  if (nombre) return nombre;
  if (bloque.tipo === 'consultorio') return 'Consultorio';
  if (bloque.tipo === 'cerrado') return 'Cerrado';
  return 'Horarios ocupados';
}

function franjaFila(bloque) {
  const libre = bloque.tipo === 'consultorio';
  return `<div class="franja">
    <div class="fila">
      <strong>${esc(bloque.desde)}–${esc(bloque.hasta)}</strong>
      <span class="ocupacion">${esc(ocupacionDe(bloque))}</span>
      <button type="button" class="texto peligro" data-borrar="${bloque.id}">Quitar</button>
    </div>
    <div class="elige">
      <button type="button" class="${libre ? 'on' : ''}" aria-pressed="${libre}" data-poner-tipo="consultorio" data-bloque-id="${bloque.id}">Disponible</button>
      <button type="button" class="${libre ? '' : 'on ocupada'}" aria-pressed="${!libre}" data-poner-tipo="clinica" data-bloque-id="${bloque.id}">Ocupada</button>
    </div>
  </div>`;
}

function textoOcupado(ocupado) {
  if (ocupado.tipo === 'cerrado') return 'Cerrado';
  return `${Number(ocupado.desde.slice(0, 2))}–${Number(ocupado.hasta.slice(0, 2))}`;
}

function minigrilla() {
  const semana = state.semana;
  if (!semana) return '<p class="vacio">Cargando los turnos…</p>';
  const cortos = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
  const hoy = hoyLocal();
  const columnas = semana.dias.map((dia) => {
    const ocupados = (dia.ocupados || []).map((ocupado) => (
      `<span class="celda ocupada" title="${esc(ocupado.lugar)}">${esc(textoOcupado(ocupado))}</span>`
    ));
    const turnos = dia.turnos.map((turno) => (
      `<button type="button" class="celda ${esc(turno.estado)}" data-ir-fecha="${esc(dia.fecha)}" data-ir-id="${turno.id}" aria-label="${esc(turno.hora)} ${esc(turno.apellido)}">${esc(turno.hora)}</button>`
    ));
    const celdas = [...ocupados, ...turnos].join('') || '<span class="celda hueco">·</span>';
    return `<div class="col ${dia.fecha === hoy ? 'hoy' : ''}">
      <span class="col-dia">${cortos[weekdayDe(dia.fecha)]}</span>
      <span class="col-num">${Number(dia.fecha.slice(8))}</span>
      ${celdas}
    </div>`;
  }).join('');
  const anterior = state.semanasAdelante
    ? '<button type="button" class="semana-paso" data-accion="semana-anterior">Anterior</button>'
    : '';
  return `<section class="grilla">
    <p class="eyebrow">Turnos</p>
    <h2>Próximos</h2>
    <p class="bajada">${esc(rangoSemana(semana.desde, semana.hasta))}</p>
    <div class="semana-pasos">
      ${anterior}
      <button type="button" class="semana-paso" data-accion="semana-siguiente">Siguiente semana</button>
    </div>
    <p class="pista">Marrón: ocupado. Verde: turno.</p>
    <div class="minigrilla">${columnas}</div>
  </section>`;
}

function horarios() {
  const dia = state.horarioDia == null ? (state.horarioDia = weekdayDe(hoyLocal())) : state.horarioDia;
  const cortos = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
  const chips = [1, 2, 3, 4, 5, 6, 0].map((numero) => (
    `<button type="button" data-horario-dia="${numero}" aria-pressed="${numero === dia}">${cortos[numero]}</button>`
  )).join('');
  const items = state.bloques.filter((bloque) => bloque.weekday === dia && !bloque.fecha);
  const disponibles = items.filter((bloque) => bloque.tipo === 'consultorio');
  const ocupadas = items.filter((bloque) => bloque.tipo !== 'consultorio');
  const excepciones = state.bloques.filter((bloque) => bloque.fecha);
  return `<p class="eyebrow">Horarios</p>
    <h2>Cada semana</h2>
    <p class="bajada">Elegí el día. Lo disponible sale en el QR.</p>
    ${nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien')}
    <section class="dia-card">
      <div class="semana-dias">${chips}</div>
      <h3>${NOMBRES[dia]}</h3>
      <div class="franjas">
        ${disponibles.map(franjaFila).join('') || '<p class="vacio">Este día el consultorio no tiene franja.</p>'}
      </div>
      <details class="suelto">
        <summary>Un día distinto${excepciones.length ? ` · ${excepciones.length}` : ''}</summary>
        ${excepciones.map((bloque) => `<div class="item"><div class="detalle">${esc(corta(bloque.fecha))} ${esc(larga(bloque.fecha))}</div>${bloqueItem(bloque)}</div>`).join('')}
        <form class="mini" data-form="excepcion">
          <input class="ancho" name="fecha" type="date" required>
          <select name="tipo">
            <option value="cerrado">Consultorio cerrado</option>
            <option value="consultorio">Consultorio extra</option>
            <option value="clinica">Estoy en una clínica</option>
          </select>
          <input name="desde" type="time" value="18:00" required>
          <input name="hasta" type="time" value="21:00" required>
          <input class="ancho" name="lugar" maxlength="60" placeholder="Detalle">
          <button class="chico" type="submit">Guardar el día</button>
        </form>
      </details>
    </section>
    <section class="dia-card">
      <h3>Horarios ocupados</h3>
      <p class="bajada">El ${esc(NOMBRES[dia].toLowerCase())} estas horas quedan ocupadas. El paciente no las ve.</p>
      <div class="franjas">
        ${ocupadas.map(franjaFila).join('') || '<p class="vacio">Este día no hay horarios ocupados.</p>'}
      </div>
    </section>
    <section class="dia-card">
      <h3>Nueva franja horaria</h3>
      <p class="bajada">Sumá un horario a este día y decí si el paciente lo ve.</p>
      <form data-form="semana" data-weekday="${dia}">
        <div class="horas-par">
          <label>Desde<input name="desde" type="time" value="08:00" required></label>
          <label>Hasta<input name="hasta" type="time" value="17:00" required></label>
        </div>
        <div class="elige">
          <label>Disponible<input type="radio" name="tipo" value="consultorio"></label>
          <label class="ocupada">Ocupada<input type="radio" name="tipo" value="clinica" checked></label>
        </div>
        <input class="lugar-clinica" name="lugar" maxlength="60" placeholder="Nombre de la clínica">
        <button class="btn" type="submit">Agregar</button>
      </form>
    </section>
    ${minigrilla()}`;
}

function pacientes() {
  const lista = state.pacientes.map((paciente) => `<article class="paciente-item">
    <strong>${esc(paciente.apellido)}, ${esc(paciente.nombre)}</strong>
    <div class="detalle">DNI ${esc(paciente.dni)} · ${esc(paciente.obra)}</div>
    <div class="detalle">${esc(paciente.nro_afiliado || 'Sin número')}</div>
    ${paciente.validacion ? `<span class="badge ${claseValidacion(paciente.validacion.estado)}">${esc(paciente.validacion.titulo)}</span>` : ''}
  </article>`).join('');
  return `<p class="eyebrow">Pacientes</p>
    <h2>Listado de pacientes registrados</h2>
    <label for="q">Buscar</label>
    <input id="q" data-consulta value="${esc(state.consulta)}" placeholder="Apellido o DNI">
    ${lista || '<p class="vacio">Todavía no hay pacientes.</p>'}`;
}

function mas() {
  const ajustes = state.ajustes;
  if (!ajustes) return '<p>Cargando…</p>';
  return `<p class="eyebrow">Consultorio</p>
    <h2>Ajustes y puerta</h2>
    <label for="marca">Marca</label><input id="marca" data-ajuste="marca" value="${esc(ajustes.marca)}">
    <label for="profesional">Nombre</label><input id="profesional" data-ajuste="profesional" value="${esc(ajustes.profesional)}">
    <label for="matricula">Matrícula</label><input id="matricula" data-ajuste="matricula" value="${esc(ajustes.matricula)}">
    <p class="pista">En el listado del Círculo Odontológico de San Nicolás de septiembre de 2025 figura 61.178. Cambiala si tu credencial dice otra.</p>
    <label for="direccion">Dirección</label><input id="direccion" data-ajuste="direccion" value="${esc(ajustes.direccion)}">
    <p class="pista">Ese listado dice Urquiza 300. Si la puerta es otra, escribila acá.</p>
    <label for="bajada">Texto para quien escanea</label><textarea id="bajada" data-ajuste="bajada">${esc(ajustes.bajada)}</textarea>
    <label for="duracion">Minutos de cada turno</label><input id="duracion" data-ajuste="duracionMin" inputmode="numeric" value="${esc(ajustes.duracionMin)}">
    <label for="horizonte">Días hacia adelante</label><input id="horizonte" data-ajuste="horizonteDias" inputmode="numeric" value="${esc(ajustes.horizonteDias)}">
    <label for="anticipo">Horas de anticipación</label><input id="anticipo" data-ajuste="anticipacionHoras" inputmode="numeric" value="${esc(ajustes.anticipacionHoras)}">
    <label for="url">Link público del QR</label><input id="url" data-ajuste="urlPublica" placeholder="https://..." value="${esc(ajustes.urlPublica)}">
    <p class="pista">Hoy el QR abre ${esc(ajustes.urlQr)}. Con el wifi de casa alcanza si la computadora queda encendida. Para la puerta, con datos móviles, hace falta un link de internet.</p>
    <label for="pin">Clave nueva, 6 números</label><input id="pin" data-ajuste="pin" inputmode="numeric" maxlength="6" placeholder="Dejar vacío para no cambiarla">
    <label class="check"><input data-ajuste="padronEstricto" type="checkbox" ${ajustes.padronEstricto ? 'checked' : ''}> Si cargo un padrón, rechazar quien no figure</label>
    ${nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien')}
    <button class="btn" type="button" data-accion="guardar-ajustes">Guardar</button>
    <section id="poster">
      <img class="poster-logo" src="/image/logo.png" alt="">
      <p class="marca">${esc(ajustes.marca)}</p>
      <h2>${esc(ajustes.profesional)}</h2>
      <p>Odontología · Matrícula ${esc(ajustes.matricula)}</p>
      <img src="/api/admin/qr.svg?t=${Date.now()}" alt="Código QR para sacar turno">
      <p class="poster-pie">Sacá tu turno</p>
      <p>${esc(ajustes.direccion)}</p>
    </section>
    <button class="btn secundario" type="button" data-accion="imprimir">Imprimir para la puerta</button>
    <section class="caja">
      <h3>Padrón de afiliados</h3>
      <p class="bajada">No existe un padrón nacional descargable: el número de afiliado es un dato de salud. La Superintendencia lo consulta de a una persona y con usuario de institución. Acá se controla el formato y, si el número es un CUIL, el dígito y el DNI.</p>
      <p class="bajada">Hay ${esc(ajustes.obras)} obras sociales y prepagas de la provincia cargadas, y ${esc(ajustes.padron)} afiliados en tu padrón propio.</p>
      <p class="bajada">Si una obra social te pasa un archivo, cargalo. Columnas: rnos, dni, numero. <a href="/api/admin/padron-plantilla.csv">Bajar plantilla</a></p>
      <input id="archivo-padron" type="file" accept=".csv,text/csv">
      <label class="check"><input id="reemplazar-padron" type="checkbox"> Reemplazar el padrón anterior</label>
      <button class="chico" type="button" data-accion="cargar-padron">Cargar archivo</button>
    </section>
    <button class="texto peligro" type="button" data-accion="salir">Cerrar sesión</button>`;
}

function render() {
  const cuerpo = !state.authed
    ? login()
    : { agenda, horarios, pacientes, mas }[state.tab]();
  app.innerHTML = cuerpo + nav();
}

async function cargarDia() {
  state.dia = await api(`/api/admin/dia?fecha=${encodeURIComponent(state.fecha || '')}`);
  state.fecha = state.dia.fecha;
}

async function cargarBloques() {
  state.bloques = await api('/api/admin/bloques');
}

async function cargarSemana() {
  const desde = state.semanasAdelante > 0 ? sumar(hoyLocal(), state.semanasAdelante * 7) : '';
  state.semana = await api(desde ? `/api/admin/semana?desde=${encodeURIComponent(desde)}` : '/api/admin/semana');
}

let timerConsulta = 0;
let timerObra = 0;

app.addEventListener('input', (evento) => {
  const ajuste = evento.target.dataset.ajuste;
  if (ajuste && state.ajustes) {
    state.ajustes[ajuste] = evento.target.type === 'checkbox' ? evento.target.checked : evento.target.value;
  }
  if (evento.target.dataset.consulta != null) {
    state.consulta = evento.target.value;
    clearTimeout(timerConsulta);
    timerConsulta = setTimeout(async () => {
      state.pacientes = await api(`/api/admin/pacientes?q=${encodeURIComponent(state.consulta)}`);
      const caja = document.querySelector('#q');
      const pos = caja?.selectionStart;
      render();
      const nuevo = document.querySelector('#q');
      if (nuevo) {
        nuevo.focus();
        if (pos != null) nuevo.setSelectionRange(pos, pos);
      }
    }, 180);
  }
  const campo = evento.target.dataset.anotar;
  if (campo && state.anotar) {
    state.anotar[campo] = evento.target.value;
    if (campo === 'q') {
      clearTimeout(timerObra);
      timerObra = setTimeout(async () => {
        state.anotar.obras = await api(`/api/obras?q=${encodeURIComponent(state.anotar.q)}`);
        const lista = document.querySelector('#lista-anotar');
        if (lista) lista.innerHTML = obrasHtml(state.anotar.obras);
      }, 160);
    }
  }
});

app.addEventListener('submit', async (evento) => {
  const form = evento.target.closest('form');
  if (!form) return;
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.form === 'semana') datos.weekday = Number(form.dataset.weekday);
  if (datos.tipo === 'cerrado') {
    datos.desde = '00:00';
    datos.hasta = '23:59';
  }
  const resultado = await api('/api/admin/bloques', { method: 'POST', body: datos });
  state.mensaje = resultado.ok ? 'Horario guardado.' : resultado.error;
  state.mensajeMal = !resultado.ok;
  if (resultado.ok) await cargarBloques();
  render();
});

app.addEventListener('click', async (evento) => {
  const tab = evento.target.closest('[data-tab]')?.dataset.tab;
  if (tab) {
    state.tab = tab;
    state.mensaje = '';
    state.mensajeMal = false;
    state.anotar = null;
    if (tab === 'pacientes') state.pacientes = await api('/api/admin/pacientes?q=');
    if (tab === 'mas') state.ajustes = await api('/api/admin/ajustes');
    if (tab === 'horarios') {
      await cargarBloques();
      await cargarSemana();
    }
    render();
    return;
  }
  const tecla = evento.target.closest('[data-tecla]')?.dataset.tecla;
  if (tecla) {
    if (tecla === '⌫') state.pin = state.pin.slice(0, -1);
    else if (state.pin.length < 6) state.pin += tecla;
    render();
    if (state.pin.length === 6) {
      try {
        await api('/api/admin/login', { method: 'POST', body: { pin: state.pin } });
        state.authed = true;
        state.pin = '';
        state.error = '';
        await cargarDia();
        await cargarBloques();
      } catch (error) {
        state.pin = '';
        state.error = error.message;
      }
      render();
    }
    return;
  }
  const accion = evento.target.closest('[data-accion]')?.dataset.accion;
  if (accion === 'dia-anterior' || accion === 'dia-siguiente') {
    state.fecha = sumar(state.fecha, accion === 'dia-anterior' ? -1 : 1);
    state.abierto = null;
    state.anotar = null;
    await cargarDia();
    render();
    return;
  }
  if (accion === 'hoy') {
    state.fecha = '';
    await cargarDia();
    render();
    return;
  }
  if (accion === 'semana-siguiente' || accion === 'semana-anterior') {
    const y = window.scrollY;
    state.semanasAdelante = Math.max(0, state.semanasAdelante + (accion === 'semana-siguiente' ? 1 : -1));
    await cargarSemana();
    render();
    window.scrollTo(0, y);
    return;
  }
  if (accion === 'cerrar-anotar') {
    state.anotar = null;
    render();
    return;
  }
  if (accion === 'guardar-anotar') {
    const anotar = state.anotar;
    const resultado = await api('/api/admin/turnos', {
      method: 'POST',
      body: {
        nombre: anotar.nombre,
        apellido: anotar.apellido,
        dni: anotar.dni,
        nro: anotar.nro,
        obraId: anotar.otra ? null : anotar.obra?.id,
        obraOtra: anotar.otra ? anotar.obraOtra : '',
        fecha: state.fecha,
        hora: anotar.hora,
      },
    });
    if (!resultado.ok) {
      anotar.error = resultado.error;
      render();
      return;
    }
    state.anotar = null;
    state.mensaje = 'Turno anotado.';
    state.mensajeMal = false;
    await cargarDia();
    render();
    return;
  }
  if (accion === 'guardar-ajustes') {
    const ajustes = state.ajustes;
    const resultado = await api('/api/admin/ajustes', {
      method: 'PUT',
      body: {
        marca: ajustes.marca,
        profesional: ajustes.profesional,
        matricula: ajustes.matricula,
        direccion: ajustes.direccion,
        bajada: ajustes.bajada,
        duracionMin: ajustes.duracionMin,
        horizonteDias: ajustes.horizonteDias,
        anticipacionHoras: ajustes.anticipacionHoras,
        urlPublica: ajustes.urlPublica,
        pin: ajustes.pin || '',
        padronEstricto: !!ajustes.padronEstricto,
      },
    });
    state.mensaje = resultado.ok ? 'Guardado.' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) state.ajustes = await api('/api/admin/ajustes');
    render();
    return;
  }
  if (accion === 'imprimir') {
    window.print();
    return;
  }
  if (accion === 'cargar-padron') {
    const archivo = document.querySelector('#archivo-padron').files?.[0];
    if (!archivo) {
      state.mensaje = 'Elegí un archivo CSV.';
      state.mensajeMal = true;
      render();
      return;
    }
    const texto = await archivo.text();
    const filas = parsearCsv(texto);
    const resultado = await api('/api/admin/padron', {
      method: 'POST',
      body: { filas, reemplazar: document.querySelector('#reemplazar-padron').checked },
    });
    state.mensaje = `Cargué ${resultado.cargadas} afiliados. ${resultado.omitidas} filas no se entendieron.`;
    state.mensajeMal = false;
    state.ajustes = await api('/api/admin/ajustes');
    render();
    return;
  }
  if (accion === 'salir') {
    await api('/api/admin/logout', { method: 'POST', body: {} });
    state.authed = false;
    state.pin = '';
    render();
    return;
  }
  if (accion === 'obra-otra' && state.anotar) {
    state.anotar.otra = true;
    state.anotar.obra = null;
    render();
    return;
  }

  const obraId = evento.target.closest('[data-obra]')?.dataset.obra;
  if (obraId && state.anotar) {
    state.anotar.obra = state.anotar.obras.find((obra) => String(obra.id) === obraId) || null;
    state.anotar.otra = false;
    render();
    return;
  }
  const anotarHora = evento.target.closest('[data-hora-libre]')?.dataset.horaLibre;
  if (anotarHora) {
    state.anotar = {
      hora: anotarHora,
      nombre: '',
      apellido: '',
      dni: '',
      nro: '',
      q: '',
      obras: await api('/api/obras'),
      obra: null,
      otra: false,
      obraOtra: '',
      error: '',
    };
    state.abierto = null;
    render();
    return;
  }
  const estado = evento.target.closest('[data-estado]')?.dataset.estado;
  const idEstado = evento.target.closest('[data-estado]')?.dataset.id;
  if (estado && idEstado) {
    evento.stopPropagation();
    await api(`/api/admin/turnos/${idEstado}`, { method: 'POST', body: { estado } });
    state.abierto = null;
    await cargarDia();
    render();
    return;
  }
  const diaHorario = evento.target.closest('[data-horario-dia]')?.dataset.horarioDia;
  if (diaHorario != null) {
    state.horarioDia = Number(diaHorario);
    render();
    return;
  }
  const ponerTipo = evento.target.closest('[data-poner-tipo]');
  if (ponerTipo) {
    const id = ponerTipo.dataset.bloqueId;
    const tipo = ponerTipo.dataset.ponerTipo;
    const actual = state.bloques.find((bloque) => String(bloque.id) === String(id));
    if (actual && actual.tipo === tipo) return;
    const resultado = await api(`/api/admin/bloques/${id}/tipo`, { method: 'POST', body: { tipo } });
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) await cargarBloques();
    render();
    return;
  }
  const ir = evento.target.closest('[data-ir-fecha]');
  if (ir) {
    state.tab = 'agenda';
    state.fecha = ir.dataset.irFecha;
    state.abierto = Number(ir.dataset.irId);
    state.anotar = null;
    state.mensaje = '';
    state.mensajeMal = false;
    await cargarDia();
    render();
    return;
  }
  const borrar = evento.target.closest('[data-borrar]')?.dataset.borrar;
  if (borrar) {
    await api(`/api/admin/bloques/${borrar}`, { method: 'DELETE' });
    await cargarBloques();
    state.mensaje = 'Horario quitado.';
    state.mensajeMal = false;
    render();
    return;
  }
  const turno = evento.target.closest('[data-turno]')?.dataset.turno;
  if (turno) {
    state.abierto = state.abierto === Number(turno) ? null : Number(turno);
    render();
  }
});

function parsearCsv(texto) {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
  if (!lineas.length) return [];
  const partir = (linea) => linea.split(/[;,]/).map((parte) => parte.trim().replace(/^"|"$/g, ''));
  const cabeza = partir(lineas[0]).map((parte) => parte.toLowerCase());
  let inicio = 0;
  let colRnos = 0;
  let colDni = 1;
  let colNumero = 2;
  const idx = (opciones) => cabeza.findIndex((parte) => opciones.some((opcion) => parte.includes(opcion)));
  if (idx(['dni', 'documento']) !== -1) {
    inicio = 1;
    colRnos = Math.max(0, idx(['rnos', 'codigo']));
    colDni = idx(['dni', 'documento']);
    colNumero = idx(['numero', 'número', 'afiliado', 'nro']);
    if (colNumero < 0) colNumero = 2;
  }
  return lineas.slice(inicio).map((linea) => {
    const columnas = partir(linea);
    return { rnos: columnas[colRnos], dni: columnas[colDni], numero: columnas[colNumero] };
  });
}

try {
  await cargarDia();
  state.authed = true;
  await cargarBloques();
} catch (error) {
  state.authed = false;
  if (error.status !== 401) state.error = error.message;
}
render();
