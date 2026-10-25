import { exportarPdf } from './imprimir.js';
import { api, aplicarApariencia, corta, esc, larga, obrasHtml, sumar } from './util.js';

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
  vacaciones: [],
  horarioAbiertos: { dia: false, vacaciones: false },
  vacacionDesde: '',
  vacacionHasta: '',
  pacientes: [],
  consulta: '',
  ajustes: null,
  mensaje: '',
  mensajeMal: false,
  anotar: null,
  horarioDia: null,
  semana: null,
  semanasAdelante: 0,
  patologias: [],
  inicio: null,
  aviso: '',
  nuevaPatologia: '',
  nuevaMinutos: '',
  claveNueva: '',
  pacienteAbierto: null,
  facturacionAbierta: null,
  historias: [],
  historiaForm: false,
  historiaDiagnostico: '',
  historiaAnotacion: '',
  apartado: null,
  archivos: [],
  sumarAbierto: false,
  capturaPaciente: null,
  editando: null,
  edicion: null,
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
      <img class="mark" src="${esc(state.inicio?.logo || '/image/logoRebranding.png')}" alt="">
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
  if (!dia.vacaciones) {
    for (const bloque of dia.bloques) {
      if (bloque.tipo === 'consultorio') continue;
      eventos.push({ tipo: 'bloque', desde: bloque.desde, hasta: bloque.hasta, lugar: bloque.lugar, clase: bloque.tipo });
    }
  }
  for (const turno of dia.turnos) eventos.push({ tipo: 'turno', desde: turno.hora, turno });
  for (const hora of dia.libres) eventos.push({ tipo: 'libre', desde: hora });
  eventos.sort((a, b) => a.desde.localeCompare(b.desde) || (a.tipo === 'bloque' ? -1 : 1));
  return eventos;
}

function agenda() {
  const dia = state.dia;
  const consultorio = dia.bloques.filter((bloque) => bloque.tipo === 'consultorio');
  const horasConsultorio = dia.vacaciones
    ? 'vacaciones'
    : consultorio.length
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
    return `<article class="turno" data-turno="${turno.id}">
      <div class="fila"><span>${esc(turno.hora)}</span><span>${esc(turno.estado)}</span></div>
      <div class="quien">${esc(turno.apellido)}, ${esc(turno.nombre)}</div>
      ${turno.patologia || turno.duracion_min ? `<div class="detalle">${esc(turno.patologia ? `${turno.patologia} · ` : '')}${esc(turno.duracion_min)} min</div>` : ''}
      <div class="detalle">${esc(turno.obra)} · DNI ${esc(turno.dni)}</div>
      ${abierto ? `<div class="detalle">Afiliado ${esc(turno.nro_afiliado || '—')} · código ${esc(turno.codigo)}</div>
        <div class="acciones">
          <button type="button" class="chico" data-estado="confirmado" data-id="${turno.id}">Cobertura ok</button>
          <button type="button" class="chico" data-estado="atendido" data-id="${turno.id}">Atendido</button>
          <button type="button" class="chico" data-estado="ausente" data-id="${turno.id}">No vino</button>
          <button type="button" class="texto peligro" data-estado="cancelado" data-id="${turno.id}">Cancelar</button>
        </div>` : ''}
    </article>`;
  }).join('');
  return `<div class="dia-nav">
      <button type="button" class="flecha" data-accion="dia-anterior" aria-label="Día anterior">‹</button>
      <div><p class="eyebrow">Agenda</p><h2>${esc(larga(dia.fecha))}</h2></div>
      <button type="button" class="flecha" data-accion="dia-siguiente" aria-label="Día siguiente">›</button>
    </div>
    <p class="bajada">Consultorio: ${esc(horasConsultorio)}.</p>
    ${dia.vacaciones ? '<p class="bajada">Esos días el paciente no ve horarios. Los turnos que ya están quedan.</p>' : ''}
    ${dia.fecha === hoyLocal() ? '' : '<button class="btn secundario chico" type="button" data-accion="hoy">Volver a hoy</button>'}
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

function motivoInicial(lista) {
  const items = lista || [];
  return items.find((item) => item.nombre.toLocaleLowerCase('es').includes('primera vez')) || items[0] || null;
}

function opcionesMotivo(elegido) {
  return (state.patologias || []).map((item) => (
    `<option value="${esc(item.id)}" ${String(item.id) === String(elegido) ? 'selected' : ''}>${esc(item.nombre)} · ${esc(item.minutos)} min</option>`
  )).join('');
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
    <label for="a-motivo">Motivo</label>
    <select id="a-motivo" data-anotar="patologiaId">${opcionesMotivo(anotar.patologiaId)}</select>
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
  if (ocupado.tipo === 'vacaciones') return 'Vacaciones';
  if (ocupado.tipo === 'cerrado') return 'Cerrado';
  return `${Number(ocupado.desde.slice(0, 2))}–${Number(ocupado.hasta.slice(0, 2))}`;
}

function filaVacacion(item) {
  const texto = item.desde === item.hasta
    ? larga(item.desde)
    : `Del ${larga(item.desde)} al ${larga(item.hasta)}`;
  return `<div class="item fila">
    <div>${esc(texto)}</div>
    <button type="button" class="texto peligro" data-borrar-vacacion="${item.id}">Quitar</button>
  </div>`;
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
    const turnos = dia.turnos.map((turno) => {
      const detalle = [turno.apellido, turno.patologia, turno.duracion_min ? `${turno.duracion_min} min` : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="celda ${esc(turno.estado)}" data-ir-fecha="${esc(dia.fecha)}" data-ir-id="${turno.id}" title="${esc(detalle)}" aria-label="${esc(turno.hora)} ${esc(detalle)}">${esc(turno.hora)}</button>`;
    });
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
    <p class="pista">Suave: ocupado. Intenso: turno.</p>
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
    </section>
    <section class="dia-card">
      <h3>Horarios ocupados</h3>
      <p class="bajada">El ${esc(NOMBRES[dia].toLowerCase())} estas horas quedan ocupadas. El paciente no las ve.</p>
      <div class="franjas">
        ${ocupadas.map(franjaFila).join('') || '<p class="vacio">Este día no hay horarios ocupados.</p>'}
      </div>
      <details class="suelto" data-detalle="dia"${state.horarioAbiertos.dia ? ' open' : ''}>
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
      <details class="suelto" data-detalle="vacaciones"${state.horarioAbiertos.vacaciones ? ' open' : ''}>
        <summary>Unas vacaciones distintas${state.vacaciones.length ? ` · ${state.vacaciones.length}` : ''}</summary>
        <p class="pista">Esos días el paciente no ve horarios. Los turnos que ya están quedan.</p>
        ${state.vacaciones.map(filaVacacion).join('')}
        <form class="mini" data-form="vacaciones">
          <label class="ancho">Desde<input name="desde" type="date" required value="${esc(state.vacacionDesde)}"></label>
          <label class="ancho">Hasta<input name="hasta" type="date" required value="${esc(state.vacacionHasta)}"></label>
          <button class="chico" type="submit">Guardar las vacaciones</button>
        </form>
      </details>
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

function marcaNumero(paciente) {
  if (paciente.padron === 'bien') return '<span class="badge bien">Número bien</span>';
  if (paciente.padron === 'mal') return '<span class="badge mal">Número mal</span>';
  return '';
}

function clasePlazo(plazo) {
  return plazo?.nivel === 'rojo' ? 'rojo' : '';
}

function circuloPlazo(paciente) {
  const plazo = paciente.plazo;
  if (!plazo) return '';
  const tono = plazo.nivel === 'amarillo' || plazo.nivel === 'rojo' ? plazo.nivel : '';
  return `<button type="button" class="plazo ${tono}" data-accion="facturacion" data-paciente="${paciente.id}" aria-label="Plazo de facturación, cierra ${esc(plazo.cuando)}"></button><span class="plazo-fecha">cierra ${esc(plazo.cuando)}</span>`;
}

function fechaClinica(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(fecha);
}

function icono(dibujo) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${dibujo}</svg>`;
}

function iconoGaleria() {
  return icono('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.2"/><path d="m7 16 3.2-3.2a1 1 0 0 1 1.4 0L15 16"/><path d="m13.5 14.2 1.1-1.1a1 1 0 0 1 1.4 0L19 16"/>');
}

function iconoDocumento() {
  return icono('<path d="M8 4.5h6l4 4V19a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V6A1.5 1.5 0 0 1 8 4.5z"/><path d="M14 4.5V8.5h4"/><path d="M9 12.5h6M9 16h4"/>');
}

function iconoEditar() {
  return icono('<path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5v4z"/><path d="m13.5 6.5 4 4"/>');
}

function iconoEliminar() {
  return icono('<path d="M5 8h14"/><path d="M9 8V6.2h6V8"/><path d="M7.6 8.4 8.3 18h7.4l.7-9.6"/>');
}

function iconoPdf() {
  return icono('<path d="M7 3.5h7l4 4V20H7z"/><path d="M14 3.5V8h4"/><path d="M12 11v6M9.6 14.4 12 16.8l2.4-2.4"/>');
}

function formularioEdicion(paciente) {
  if (state.editando !== paciente.id || !state.edicion) return '';
  const edicion = state.edicion;
  return `<div class="edicion">
    <div class="par">
      <div><label for="edicion-nombre">Nombre</label><input id="edicion-nombre" data-edicion="nombre" maxlength="60" value="${esc(edicion.nombre)}"></div>
      <div><label for="edicion-apellido">Apellido</label><input id="edicion-apellido" data-edicion="apellido" maxlength="60" value="${esc(edicion.apellido)}"></div>
    </div>
    <div class="par">
      <div><label for="edicion-dni">DNI</label><input id="edicion-dni" data-edicion="dni" inputmode="numeric" maxlength="8" value="${esc(edicion.dni)}"></div>
      <div><label for="edicion-nro">Número</label><input id="edicion-nro" data-edicion="nro" maxlength="20" value="${esc(edicion.nro)}"></div>
    </div>
    <label for="edicion-obra">Obra social</label>
    <input id="edicion-obra" data-edicion="obra" maxlength="80" value="${esc(edicion.obra)}">
    <button class="btn" type="button" data-accion="guardar-paciente" data-paciente="${paciente.id}">Guardar</button>
  </div>`;
}

function filaHistoria(paciente) {
  const notas = state.historias.map((item) => `<article class="nota-clinica">
    <p class="fecha-nota">${esc(fechaClinica(item.creado))}</p>
    ${item.diagnostico ? `<p>${esc(item.diagnostico)}</p>` : ''}
    ${item.anotacion ? `<p class="detalle">${esc(item.anotacion)}</p>` : ''}
    <button type="button" class="icono-accion" data-accion="pdf-nota" data-nota="${item.id}" data-paciente="${paciente.id}" aria-label="Exportar PDF" title="Exportar PDF">${iconoPdf()}</button>
  </article>`).join('');
  const form = state.historiaForm ? `<label for="historia-diagnostico">Diagnóstico</label>
    <input id="historia-diagnostico" class="campo" maxlength="500" value="${esc(state.historiaDiagnostico)}">
    <label for="historia-anotacion">Anotación</label>
    <textarea id="historia-anotacion" maxlength="500">${esc(state.historiaAnotacion)}</textarea>
    <button class="btn" type="button" data-accion="guardar-historia" data-paciente="${paciente.id}">Sumar</button>` : '';
  return `<tr class="sigue ${clasePlazo(paciente.plazo)}"><td>
    ${formularioEdicion(paciente)}
    ${notas}
    <button class="mas" type="button" data-accion="nueva-historia" aria-label="Sumar a la historia">+</button>
    ${form}
    ${state.aviso === 'historia' ? nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien') : ''}
  </td></tr>`;
}

function filaFactura(paciente) {
  return `<tr class="sigue ${clasePlazo(paciente.plazo)}"><td>
    <p class="detalle">Cargar antes del ${esc(paciente.plazo.cuando)}. Es el plazo de esa obra, a mes vencido.</p>
    <button class="btn" type="button" data-accion="cargue" data-paciente="${paciente.id}" data-periodo="${esc(paciente.plazo.periodo)}">Cargué la facturación</button>
  </td></tr>`;
}

function filaPaciente(paciente) {
  const plazo = paciente.plazo;
  return `<tr class="fila-paciente ${clasePlazo(plazo)}" data-accion="historia" data-paciente="${paciente.id}">
    <td>
      <p class="nombre-paciente">${esc(paciente.apellido)}, ${esc(paciente.nombre)}</p>
      <div class="detalle">DNI ${esc(paciente.dni)} · <span class="mutual">${esc(paciente.obra)}${circuloPlazo(paciente)}</span></div>
      <div class="detalle">${esc(paciente.nro_afiliado || 'Sin número')} ${marcaNumero(paciente)}</div>
      <div class="paciente-acciones">
        <button type="button" class="camara" data-accion="sacar-foto" data-paciente="${paciente.id}" aria-label="Sacar foto o subir archivo">${iconoCamara()}</button>
        <button type="button" class="icono-accion" data-accion="apartado" data-apartado="galeria" data-paciente="${paciente.id}" aria-label="Galería" title="Galería">${iconoGaleria()}</button>
        <button type="button" class="icono-accion" data-accion="apartado" data-apartado="documentos" data-paciente="${paciente.id}" aria-label="Documentos" title="Documentos">${iconoDocumento()}</button>
        <button type="button" class="icono-accion" data-accion="editar" data-paciente="${paciente.id}" aria-label="Editar paciente" title="Editar">${iconoEditar()}</button>
        <button type="button" class="icono-accion peligro" data-accion="eliminar" data-paciente="${paciente.id}" aria-label="Eliminar paciente" title="Eliminar">${iconoEliminar()}</button>
      </div>
    </td>
  </tr>
  ${state.pacienteAbierto === paciente.id ? filaHistoria(paciente) : ''}
  ${state.facturacionAbierta === paciente.id && plazo ? filaFactura(paciente) : ''}`;
}

function iconoCamara() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M8.2 7.2 9.4 5.6h5.2l1.2 1.6H19a1.4 1.4 0 0 1 1.4 1.4v9.2A1.4 1.4 0 0 1 19 19H5a1.4 1.4 0 0 1-1.4-1.4V8.6A1.4 1.4 0 0 1 5 7.2h3.2z"/>
    <circle cx="12" cy="12.6" r="2.7"/>
  </svg>`;
}

function tituloApartado(tipo) {
  if (tipo === 'galeria') return 'Galería';
  return 'Documentos';
}

function apartadoVista() {
  const { id, tipo } = state.apartado;
  const paciente = state.pacientes.find((item) => item.id === id);
  const lista = state.archivos.filter((item) => {
    if (tipo === 'galeria') return item.tipo === 'foto';
    if (tipo === 'documentos') return item.tipo === 'documento';
    return true;
  });
  const piezas = lista.map((item) => {
    const url = `/api/admin/pacientes/${id}/archivos/${item.id}`;
    const cuerpo = item.tipo === 'foto'
      ? `<img src="${esc(url)}" alt="${esc(item.nombre)}">`
      : `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(item.nombre)}</a>`;
    return `<tr>
      <td class="vista">${cuerpo}</td>
      <td class="accion"><button type="button" class="texto peligro" data-quitar-archivo="${item.id}">Quitar</button></td>
    </tr>`;
  }).join('');
  const opciones = state.sumarAbierto
    ? (tipo === 'documentos'
      ? '<button type="button" class="texto" data-accion="abrir-archivo" data-cual="archivo">Subir archivo</button>'
      : `<button type="button" class="texto" data-accion="abrir-archivo" data-cual="camara">Tomar foto</button>
         <button type="button" class="texto" data-accion="abrir-archivo" data-cual="archivo">Subir archivo</button>`)
    : '';
  const tabla = piezas
    ? `<table class="tabla archivos"><tbody>${piezas}</tbody></table>`
    : '<p class="vacio">Todavía no hay nada.</p>';
  return `<div class="dia-nav apartado-nav">
      <button type="button" class="flecha" data-accion="volver-pacientes" aria-label="Volver">‹</button>
      <div>
        <p class="eyebrow">${esc(paciente ? `${paciente.apellido}, ${paciente.nombre}` : '')}</p>
        <h2>${tituloApartado(tipo)}</h2>
      </div>
      ${tipo === 'galeria' && lista.length ? `<button type="button" class="icono-accion al-fondo" data-accion="pdf-galeria" aria-label="Exportar galería" title="Exportar PDF">${iconoPdf()}</button>` : ''}
    </div>
    <button type="button" class="mas" data-accion="sumar-archivo" aria-label="Sumar">+</button>
    ${opciones}
    ${tabla}
    ${state.aviso === 'archivo' ? nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien') : ''}`;
}

function archivosOcultos() {
  return `<input id="archivo-camara" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden>
    <input id="archivo-paciente" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt" hidden>`;
}

function pacientes() {
  const filas = state.pacientes.map(filaPaciente).join('');
  const cuerpo = state.apartado ? apartadoVista() : `<p class="eyebrow">Pacientes</p>
    <h2>Listado de pacientes registrados</h2>
    <label for="q">Buscar</label>
    <input id="q" data-consulta value="${esc(state.consulta)}" placeholder="Apellido o DNI">
    ${filas ? `<table class="tabla pacientes"><thead><tr><th>Paciente</th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="vacio">Todavía no hay pacientes.</p>'}
    ${state.aviso === 'archivo' || state.aviso === 'paciente' ? nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien') : ''}`;
  return cuerpo + archivosOcultos();
}

function logoDe(ajustes) {
  return ajustes?.logo || state.inicio?.logo || '/image/logoRebranding.png';
}

function apariencia() {
  const tema = state.ajustes.tema || 'turquesa';
  const fuente = state.ajustes.fuente || 'fraunces';
  const logo = logoDe(state.ajustes);
  const propio = logo.startsWith('/logo');
  const temas = [
    ['original', 'Original'],
    ['turquesa', 'Turquesa pastel'],
    ['verdes', 'Verdes pastel'],
    ['oscuro', 'Oscuro gris'],
  ].map(([id, nombre]) => `<button type="button" class="tema${tema === id ? ' on' : ''}" data-poner-tema="${id}" aria-pressed="${tema === id}"><i class="muestra ${id}"></i>${nombre}</button>`).join('');
  const fuentes = [
    ['fraunces', 'Fraunces', 'Editorial'],
    ['source-serif', 'Source Serif', 'Institucional'],
    ['literata', 'Literata', 'Lectura'],
    ['source-sans', 'Source Sans', 'Clínica'],
    ['manrope', 'Manrope', 'Precisa'],
  ].map(([id, nombre, rol]) => `<button type="button" class="fuente fuente-${id}${fuente === id ? ' on' : ''}" data-poner-fuente="${id}" aria-pressed="${fuente === id}"><span>${nombre}</span><small>${rol}</small></button>`).join('');
  return `<section class="dia-card" id="tema">
    <h3>Tema</h3>
    <p class="bajada">El color de esta agenda y de la pantalla que ve el paciente.</p>
    <div class="temas">${temas}</div>
    <h3>Títulos</h3>
    <p class="bajada">Cinco fuentes de consultorio. Cambian los títulos y los subtítulos. El texto chico queda igual.</p>
    <div class="fuentes">${fuentes}</div>
    <h3>Logo</h3>
    <p class="bajada">El del consultorio. Se ve al sacar turno y en el QR de la puerta.</p>
    <div class="logo-fila">
      <img class="logo-previa" src="${esc(logo)}" alt="">
      <div>
        <button class="btn secundario archivo" type="button" data-accion="elegir-logo">Cambiar logo</button>
        <input id="logo-archivo" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        ${propio ? '<button class="btn secundario chico" type="button" data-accion="logo-original">Volver al original</button>' : ''}
      </div>
    </div>
    ${state.aviso === 'logo' ? nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien') : ''}
  </section>`;
}

function tiemposTurnos() {
  const lista = state.ajustes.patologias || [];
  const filas = lista.map((item) => `<tr data-patologia="${esc(item.id)}">
    <td>${esc(item.nombre)}</td>
    <td class="min">${esc(item.minutos)}</td>
    <td class="accion"><button type="button" class="texto peligro" data-quitar-patologia="${esc(item.id)}">Quitar</button></td>
  </tr>`).join('');
  return `<section class="dia-card" id="tiempos">
    <h3>Tiempos de turnos</h3>
    <p class="bajada">El paciente elige el motivo. Esos minutos ocupan la agenda para que el turno de después no se pise.</p>
    <table class="tabla">
      <thead><tr><th>Patología</th><th class="min">Min</th><th></th></tr></thead>
      <tbody>
        ${filas}
        <tr class="nueva">
          <td><input id="nueva-patologia" maxlength="60" placeholder="Nueva patología" autocomplete="off" value="${esc(state.nuevaPatologia)}"></td>
          <td class="min"><input id="nueva-minutos" inputmode="numeric" placeholder="30" autocomplete="off" value="${esc(state.nuevaMinutos)}"></td>
          <td class="accion"><button class="texto" type="button" data-accion="agregar-patologia">Agregar</button></td>
        </tr>
      </tbody>
    </table>
  </section>`;
}

function tarjetaQr(ajustes) {
  return `<section class="dia-card" id="qr-card">
    <h3>QR de la puerta</h3>
    <label for="url">Link público</label>
    <input id="url" data-ajuste="urlPublica" placeholder="https://..." value="${esc(ajustes.urlPublica)}">
    <p class="pista">Hoy el QR abre ${esc(ajustes.urlQr)}. Con el wifi de casa alcanza si la computadora queda encendida. Para la puerta, con datos móviles, hace falta un link de internet.</p>
    <section id="poster">
      <img class="poster-logo" src="${esc(logoDe(ajustes))}" alt="">
      <p class="marca">${esc(ajustes.marca)}</p>
      <h2>${esc(ajustes.profesional)}</h2>
      <p>Odontología · Matrícula ${esc(ajustes.matricula)}</p>
      <img src="/api/admin/qr.svg?t=${Date.now()}" alt="Código QR para sacar turno">
      <p class="poster-pie">Sacá tu turno</p>
      <p>${esc(ajustes.direccion)}</p>
    </section>
    <button class="btn secundario" type="button" data-accion="imprimir">Imprimir para la puerta</button>
  </section>`;
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
    ${tiemposTurnos()}
    <label for="horizonte">Días hacia adelante</label><input id="horizonte" data-ajuste="horizonteDias" inputmode="numeric" value="${esc(ajustes.horizonteDias)}">
    <label for="anticipo">Horas de anticipación</label><input id="anticipo" data-ajuste="anticipacionHoras" inputmode="numeric" value="${esc(ajustes.anticipacionHoras)}">
    ${tarjetaQr(ajustes)}
    ${state.aviso === 'ajustes' ? nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien') : ''}
    <button class="btn" type="button" data-accion="guardar-ajustes">Guardar</button>
    ${apariencia()}
    <section class="dia-card" id="clave">
      <h3>Clave nueva</h3>
      <p class="bajada">Seis números. Si la cambiás, la anterior deja de abrir la agenda.</p>
      <label for="clave-nueva">6 números</label>
      <input id="clave-nueva" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="Dejar vacío para no cambiarla" value="${esc(state.claveNueva)}">
      ${state.aviso === 'clave' ? nota(state.mensaje, state.mensajeMal ? 'mal' : 'bien') : ''}
      <button class="btn" type="button" data-accion="cambiar-clave">Cambiar clave</button>
    </section>
    <button class="btn peligro" type="button" data-accion="salir">Cerrar sesión</button>`;
}

function render() {
  const cuerpo = !state.authed
    ? login()
    : { agenda, horarios, pacientes, mas }[state.tab]();
  app.innerHTML = cuerpo + nav();
}

function irAlTope() {
  const subir = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  subir();
  requestAnimationFrame(subir);
}

async function cargarDia() {
  state.dia = await api(`/api/admin/dia?fecha=${encodeURIComponent(state.fecha || '')}`);
  state.fecha = state.dia.fecha;
}

async function cargarBloques() {
  const [bloques, vacaciones] = await Promise.all([
    api('/api/admin/bloques'),
    api('/api/admin/vacaciones'),
  ]);
  state.bloques = bloques;
  state.vacaciones = Array.isArray(vacaciones) ? vacaciones : [];
}

async function cargarSemana() {
  const desde = state.semanasAdelante > 0 ? sumar(hoyLocal(), state.semanasAdelante * 7) : '';
  state.semana = await api(desde ? `/api/admin/semana?desde=${encodeURIComponent(desde)}` : '/api/admin/semana');
}

let timerConsulta = 0;
let timerObra = 0;

app.addEventListener('input', (evento) => {
  const campoEdicion = evento.target.dataset.edicion;
  if (campoEdicion && state.edicion) {
    state.edicion[campoEdicion] = evento.target.value;
    return;
  }
  if (evento.target.id === 'historia-diagnostico') state.historiaDiagnostico = evento.target.value;
  if (evento.target.id === 'historia-anotacion') state.historiaAnotacion = evento.target.value;
  if (evento.target.id === 'nueva-patologia') state.nuevaPatologia = evento.target.value;
  if (evento.target.id === 'nueva-minutos') state.nuevaMinutos = evento.target.value;
  if (evento.target.id === 'clave-nueva') state.claveNueva = evento.target.value;
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

app.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter') return;
  if (evento.target.id !== 'nueva-patologia' && evento.target.id !== 'nueva-minutos') return;
  evento.preventDefault();
  document.querySelector('[data-accion="agregar-patologia"]')?.click();
});

function archivoDePaciente(archivo) {
  const nombre = archivo.name.toLowerCase();
  const imagen = /^image\/(png|jpe?g|webp)$/.test(archivo.type);
  const texto = archivo.type === 'application/pdf' || nombre.endsWith('.pdf')
    || archivo.type === 'text/plain' || nombre.endsWith('.txt');
  if (imagen) return 'foto';
  if (texto) return 'documento';
  return '';
}

app.addEventListener('change', async (evento) => {
  const esArchivo = evento.target.id === 'archivo-camara' || evento.target.id === 'archivo-paciente';
  if (esArchivo) {
    const archivo = evento.target.files?.[0];
    const pacienteId = state.capturaPaciente || state.apartado?.id;
    evento.target.value = '';
    if (!archivo || !pacienteId) return;
    const tipo = archivoDePaciente(archivo);
    const aviso = (mensaje) => {
      state.aviso = 'archivo';
      state.mensaje = mensaje;
      state.mensajeMal = true;
      render();
    };
    if (!tipo) {
      aviso('Subí una foto (JPG o PNG) o un texto.');
      return;
    }
    if (archivo.size > 6_000_000) {
      aviso('El archivo tiene que pesar menos de 6 MB.');
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => reject(lector.error);
      lector.readAsDataURL(archivo);
    });
    const resultado = await api(`/api/admin/pacientes/${pacienteId}/archivos`, {
      method: 'POST',
      body: { nombre: archivo.name, archivo: dataUrl, tipo },
    });
    state.sumarAbierto = false;
    if (!resultado.ok) {
      aviso(resultado.error);
      return;
    }
    const vista = resultado.tipo === 'foto' ? 'galeria' : 'documentos';
    const cambia = !state.apartado || state.apartado.id !== pacienteId || state.apartado.tipo !== vista;
    state.apartado = { id: pacienteId, tipo: vista };
    state.capturaPaciente = pacienteId;
    state.aviso = '';
    state.mensaje = '';
    state.archivos = await api(`/api/admin/pacientes/${pacienteId}/archivos`);
    render();
    if (cambia) irAlTope();
    return;
  }
  if (evento.target.id !== 'logo-archivo') return;
  const archivo = evento.target.files?.[0];
  if (!archivo || !state.ajustes) return;
  if (archivo.size > 1_500_000) {
    state.aviso = 'logo';
    state.mensaje = 'El logo tiene que pesar menos de 1,5 MB.';
    state.mensajeMal = true;
    render();
    return;
  }
  const imagen = await new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
  const y = window.scrollY;
  const resultado = await api('/api/admin/logo', { method: 'POST', body: { imagen } });
  state.aviso = 'logo';
  state.mensaje = resultado.ok ? 'Logo actualizado.' : resultado.error;
  state.mensajeMal = !resultado.ok;
  if (resultado.ok) {
    state.ajustes.logo = resultado.logo;
    if (state.inicio) state.inicio.logo = resultado.logo;
    aplicarApariencia(state.ajustes);
  }
  render();
  window.scrollTo(0, y);
});

app.addEventListener('toggle', (evento) => {
  const detalles = evento.target;
  if (!(detalles instanceof HTMLDetailsElement)) return;
  const cual = detalles.dataset.detalle;
  if (cual !== 'dia' && cual !== 'vacaciones') return;
  state.horarioAbiertos[cual] = detalles.open;
}, true);

app.addEventListener('submit', async (evento) => {
  const form = evento.target.closest('form');
  if (!form) return;
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.form === 'vacaciones') {
    state.horarioAbiertos.vacaciones = true;
    state.vacacionDesde = datos.desde || '';
    state.vacacionHasta = datos.hasta || '';
    const resultado = await api('/api/admin/vacaciones', { method: 'POST', body: datos });
    state.mensaje = resultado.ok ? 'Vacaciones guardadas.' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.vacacionDesde = '';
      state.vacacionHasta = '';
      await cargarBloques();
      await cargarSemana();
    }
    render();
    return;
  }
  if (form.dataset.form === 'semana') datos.weekday = Number(form.dataset.weekday);
  if (form.dataset.form === 'excepcion') state.horarioAbiertos.dia = true;
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
    state.aviso = '';
    state.anotar = null;
    if (tab === 'pacientes') {
      state.apartado = null;
      state.pacienteAbierto = null;
      state.facturacionAbierta = null;
      state.pacientes = await api('/api/admin/pacientes?q=');
    }
    if (tab === 'mas') {
      state.ajustes = await api('/api/admin/ajustes');
      state.patologias = state.ajustes.patologias || [];
      aplicarApariencia(state.ajustes);
    }
    if (tab === 'horarios') {
      await cargarBloques();
      await cargarSemana();
    }
    render();
    irAlTope();
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
        state.tab = 'agenda';
        state.apartado = null;
        state.pacienteAbierto = null;
        state.facturacionAbierta = null;
        state.editando = null;
        state.edicion = null;
        state.pin = '';
        state.error = '';
        await cargarDia();
        await cargarBloques();
        const inicio = await api('/api/inicio');
        state.inicio = inicio;
        state.patologias = inicio.patologias || [];
        aplicarApariencia(inicio);
      } catch (error) {
        state.pin = '';
        state.error = error.message;
      }
      render();
      if (state.authed) irAlTope();
    }
    return;
  }
  const temaElegido = evento.target.closest('[data-poner-tema]')?.dataset.ponerTema;
  const fuenteElegida = evento.target.closest('[data-poner-fuente]')?.dataset.ponerFuente;
  if ((temaElegido || fuenteElegida) && state.ajustes) {
    const y = window.scrollY;
    if (temaElegido) state.ajustes.tema = temaElegido;
    if (fuenteElegida) state.ajustes.fuente = fuenteElegida;
    aplicarApariencia(state.ajustes);
    const resultado = await api('/api/admin/ajustes', {
      method: 'PUT',
      body: { tema: state.ajustes.tema, fuente: state.ajustes.fuente },
    });
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    render();
    window.scrollTo(0, y);
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
        patologiaId: anotar.patologiaId,
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
        horizonteDias: ajustes.horizonteDias,
        anticipacionHoras: ajustes.anticipacionHoras,
        urlPublica: ajustes.urlPublica,
        tema: ajustes.tema,
        fuente: ajustes.fuente,
      },
    });
    state.aviso = 'ajustes';
    state.mensaje = resultado.ok ? 'Guardado.' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.ajustes = await api('/api/admin/ajustes');
      state.patologias = state.ajustes.patologias || [];
      aplicarApariencia(state.ajustes);
    }
    render();
    return;
  }
  if (accion === 'imprimir') {
    window.print();
    return;
  }
  if (accion === 'agregar-patologia') {
    const nombre = document.querySelector('#nueva-patologia')?.value || '';
    const minutos = document.querySelector('#nueva-minutos')?.value || '';
    const y = window.scrollY;
    const resultado = await api('/api/admin/patologias', { method: 'POST', body: { nombre, minutos } });
    state.aviso = 'ajustes';
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.nuevaPatologia = '';
      state.nuevaMinutos = '';
      state.ajustes = await api('/api/admin/ajustes');
      state.patologias = state.ajustes.patologias || [];
    }
    render();
    window.scrollTo(0, y);
    return;
  }
  if (accion === 'elegir-logo') {
    document.querySelector('#logo-archivo')?.click();
    return;
  }
  if (accion === 'cambiar-clave') {
    const pin = document.querySelector('#clave-nueva')?.value.trim() || '';
    if (!/^\d{6}$/.test(pin)) {
      state.aviso = 'clave';
      state.mensaje = 'La clave nueva tiene que ser de 6 números.';
      state.mensajeMal = true;
      render();
      document.querySelector('#clave')?.scrollIntoView({ block: 'center' });
      return;
    }
    if (!window.confirm('¿Confirmás la clave nueva? La anterior deja de abrir la agenda.')) return;
    const y = window.scrollY;
    const resultado = await api('/api/admin/ajustes', { method: 'PUT', body: { pin } });
    state.aviso = 'clave';
    state.mensaje = resultado.ok ? 'Clave cambiada.' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) state.claveNueva = '';
    render();
    window.scrollTo(0, y);
    return;
  }
  if (accion === 'logo-original') {
    const y = window.scrollY;
    const resultado = await api('/api/admin/logo', { method: 'DELETE' });
    state.aviso = 'logo';
    state.mensaje = resultado.ok ? 'Volvió el logo original.' : (resultado.error || 'No pude volver al logo original.');
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.ajustes.logo = resultado.logo;
      if (state.inicio) state.inicio.logo = resultado.logo;
      aplicarApariencia(state.ajustes);
    }
    render();
    window.scrollTo(0, y);
    return;
  }
  if (accion === 'salir') {
    if (!window.confirm('¿Confirmás cerrar la sesión?')) return;
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
    if (!state.patologias?.length) state.patologias = (await api('/api/inicio')).patologias || [];
    const defecto = motivoInicial(state.patologias);
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
      patologiaId: defecto ? String(defecto.id) : '',
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
  const pacienteId = Number(evento.target.closest('[data-paciente]')?.dataset.paciente || 0);
  if (accion === 'historia' && pacienteId) {
    if (evento.target.closest('button, a, input, textarea, label')) return;
    if (state.pacienteAbierto === pacienteId) {
      state.pacienteAbierto = null;
      state.editando = null;
      render();
      return;
    }
    state.pacienteAbierto = pacienteId;
    state.editando = null;
    state.facturacionAbierta = null;
    state.historiaForm = false;
    state.historiaDiagnostico = '';
    state.historiaAnotacion = '';
    state.aviso = '';
    state.historias = await api(`/api/admin/pacientes/${pacienteId}/historia`);
    render();
    return;
  }
  if (accion === 'editar' && pacienteId) {
    const paciente = state.pacientes.find((item) => item.id === pacienteId);
    if (!paciente) return;
    state.pacienteAbierto = pacienteId;
    state.facturacionAbierta = null;
    state.editando = pacienteId;
    state.edicion = {
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      obra: paciente.obra,
      nro: paciente.nro_afiliado || '',
    };
    state.aviso = '';
    state.historias = await api(`/api/admin/pacientes/${pacienteId}/historia`);
    render();
    return;
  }
  if (accion === 'guardar-paciente' && pacienteId && state.edicion) {
    const resultado = await api(`/api/admin/pacientes/${pacienteId}`, { method: 'PUT', body: state.edicion });
    state.aviso = 'historia';
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.editando = null;
      state.pacientes = await api(`/api/admin/pacientes?q=${encodeURIComponent(state.consulta)}`);
    }
    render();
    return;
  }
  if (accion === 'eliminar' && pacienteId) {
    const paciente = state.pacientes.find((item) => item.id === pacienteId);
    const quien = paciente ? `${paciente.apellido}, ${paciente.nombre}` : 'este paciente';
    if (!window.confirm(`¿Confirmás eliminar a ${quien}? Se borran los turnos, la historia y los archivos.`)) return;
    const resultado = await api(`/api/admin/pacientes/${pacienteId}`, { method: 'DELETE' });
    state.aviso = 'paciente';
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.pacienteAbierto = null;
      state.editando = null;
      state.apartado = null;
      state.pacientes = await api(`/api/admin/pacientes?q=${encodeURIComponent(state.consulta)}`);
    }
    render();
    return;
  }
  if (accion === 'pdf-nota' && pacienteId) {
    const notaId = Number(evento.target.closest('[data-nota]')?.dataset.nota);
    const clinica = state.historias.find((item) => item.id === notaId);
    const paciente = state.pacientes.find((item) => item.id === pacienteId);
    if (!clinica || !paciente || !state.inicio) return;
    await exportarPdf({
      titulo: `Historia ${paciente.apellido}`,
      ficha: state.inicio,
      paciente,
      nota: {
        fecha: fechaClinica(clinica.creado),
        diagnostico: clinica.diagnostico,
        anotacion: clinica.anotacion,
      },
    });
    return;
  }
  if (accion === 'pdf-galeria' && state.apartado) {
    const paciente = state.pacientes.find((item) => item.id === state.apartado.id);
    const fotos = state.archivos.filter((item) => item.tipo === 'foto');
    if (!paciente || !fotos.length || !state.inicio) return;
    await exportarPdf({
      titulo: `Galería ${paciente.apellido}`,
      ficha: state.inicio,
      paciente,
      fotos: fotos.map((item) => ({
        src: `/api/admin/pacientes/${paciente.id}/archivos/${item.id}`,
        nombre: item.nombre,
      })),
    });
    return;
  }
  if (accion === 'nueva-historia') {
    state.historiaForm = !state.historiaForm;
    state.aviso = '';
    render();
    return;
  }
  if (accion === 'guardar-historia' && pacienteId) {
    const resultado = await api(`/api/admin/pacientes/${pacienteId}/historia`, {
      method: 'POST',
      body: { diagnostico: state.historiaDiagnostico, anotacion: state.historiaAnotacion },
    });
    state.aviso = 'historia';
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.historiaDiagnostico = '';
      state.historiaAnotacion = '';
      state.historiaForm = false;
      state.historias = await api(`/api/admin/pacientes/${pacienteId}/historia`);
    }
    render();
    return;
  }
  if (accion === 'facturacion' && pacienteId) {
    state.facturacionAbierta = state.facturacionAbierta === pacienteId ? null : pacienteId;
    if (state.facturacionAbierta) state.pacienteAbierto = null;
    render();
    return;
  }
  if (accion === 'cargue' && pacienteId) {
    const periodo = evento.target.closest('[data-periodo]')?.dataset.periodo;
    const resultado = await api(`/api/admin/pacientes/${pacienteId}/carga`, { method: 'POST', body: { periodo } });
    state.aviso = 'historia';
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.facturacionAbierta = null;
      state.pacientes = await api(`/api/admin/pacientes?q=${encodeURIComponent(state.consulta)}`);
    }
    render();
    return;
  }
  if (accion === 'sacar-foto' && pacienteId) {
    state.capturaPaciente = pacienteId;
    document.querySelector('#archivo-paciente')?.click();
    return;
  }
  if (accion === 'apartado' && pacienteId) {
    const tipo = evento.target.closest('[data-apartado]')?.dataset.apartado;
    state.apartado = { id: pacienteId, tipo };
    state.sumarAbierto = false;
    state.aviso = '';
    state.archivos = await api(`/api/admin/pacientes/${pacienteId}/archivos`);
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (accion === 'volver-pacientes') {
    state.apartado = null;
    state.archivos = [];
    state.sumarAbierto = false;
    state.aviso = '';
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (accion === 'sumar-archivo') {
    state.sumarAbierto = !state.sumarAbierto;
    render();
    return;
  }
  if (accion === 'abrir-archivo') {
    const cual = evento.target.closest('[data-cual]')?.dataset.cual;
    state.capturaPaciente = state.apartado?.id || state.capturaPaciente;
    document.querySelector(cual === 'camara' ? '#archivo-camara' : '#archivo-paciente')?.click();
    return;
  }
  const quitarArchivo = evento.target.closest('[data-quitar-archivo]')?.dataset.quitarArchivo;
  if (quitarArchivo && state.apartado) {
    await api(`/api/admin/pacientes/${state.apartado.id}/archivos/${quitarArchivo}`, { method: 'DELETE' });
    state.archivos = await api(`/api/admin/pacientes/${state.apartado.id}/archivos`);
    render();
    return;
  }
  const quitarPatologia = evento.target.closest('[data-quitar-patologia]')?.dataset.quitarPatologia;
  if (quitarPatologia) {
    const y = window.scrollY;
    const resultado = await api(`/api/admin/patologias/${quitarPatologia}`, { method: 'DELETE' });
    state.aviso = 'ajustes';
    state.mensaje = resultado.ok ? '' : resultado.error;
    state.mensajeMal = !resultado.ok;
    if (resultado.ok) {
      state.ajustes = await api('/api/admin/ajustes');
      state.patologias = state.ajustes.patologias || [];
    }
    render();
    window.scrollTo(0, y);
    return;
  }
  const borrarVacacion = evento.target.closest('[data-borrar-vacacion]')?.dataset.borrarVacacion;
  if (borrarVacacion) {
    state.horarioAbiertos.vacaciones = true;
    await api(`/api/admin/vacaciones/${borrarVacacion}`, { method: 'DELETE' });
    await cargarBloques();
    await cargarSemana();
    state.mensaje = 'Vacaciones quitadas.';
    state.mensajeMal = false;
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

try {
  const inicio = await api('/api/inicio');
  state.inicio = inicio;
  state.patologias = inicio.patologias || [];
  aplicarApariencia(inicio);
  await cargarDia();
  state.authed = true;
  await cargarBloques();
} catch (error) {
  state.authed = false;
  if (error.status !== 401) state.error = error.message;
}
render();
