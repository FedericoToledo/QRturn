/* Demo local para GitHub Pages. Imita las respuestas del consultorio y las guarda en el navegador. */
(function demoApi() {
  const CLAVE = 'dentapp-demo-v1';
  const SESION = 'dentapp-demo-sesion';
  const LOGO = 'image/logoRebranding.png';
  const URL_DEMO = 'https://federicotoledo.github.io/QRturn/';
  const PIN_INICIAL = '123456';
  const ZONA = 'America/Argentina/Buenos_Aires';
  const ESTADOS = ['reservado', 'confirmado', 'atendido', 'ausente', 'cancelado'];
  const TEMAS = ['original', 'turquesa', 'verdes', 'oscuro'];
  const FUENTES = ['fraunces', 'source-serif', 'literata', 'source-sans', 'manrope'];
  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const FRECUENTES = ['PARTICULAR', '902001', '500807', '400800', '800501', '126205', 'PREPAGA-SWISS', 'PREPAGA-GALENO'];
  const DIA_QUINCE = new Set(['500807', '902001']);
  const DIA_OCHO = new Set(['400800', '3009', '800501']);
  const OBRAS = (window.DEMO_OBRAS || []).map((obra) => ({
    ...obra,
    _n: norm(`${obra.etiqueta} ${obra.sigla} ${obra.nombre}`),
  }));

  function norm(valor) {
    return String(valor || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function partesDe(fecha) {
    const formato = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const partes = {};
    for (const parte of formato.formatToParts(fecha)) partes[parte.type] = parte.value;
    let hora = partes.hour === '24' ? '00' : partes.hour;
    return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${hora}:${partes.minute}` };
  }

  function hoyBA(desde = new Date()) { return partesDe(desde).fecha; }
  function horaAhora(desde = new Date()) { return partesDe(desde).hora; }

  function fechaValida(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const armada = new Date(Date.UTC(anio, mes - 1, dia));
    return armada.getUTCFullYear() === anio && armada.getUTCMonth() === mes - 1 && armada.getUTCDate() === dia;
  }

  function sumarDias(fecha, dias) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const armada = new Date(Date.UTC(anio, mes - 1, dia + dias));
    return `${armada.getUTCFullYear()}-${String(armada.getUTCMonth() + 1).padStart(2, '0')}-${String(armada.getUTCDate()).padStart(2, '0')}`;
  }

  function weekday(fecha) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  }

  function minutos(hora) {
    const [horas, mins] = hora.split(':').map(Number);
    return horas * 60 + mins;
  }

  function horaDesdeMinutos(total) {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function normalizarHora(valor) {
    const coincidencia = String(valor || '').match(/^(\d{2}):(\d{2})/);
    if (!coincidencia) return '';
    const hora = Number(coincidencia[1]);
    const minuto = Number(coincidencia[2]);
    if (hora > 23 || minuto > 59) return '';
    return `${coincidencia[1]}:${coincidencia[2]}`;
  }

  function selloBA(fecha, hora) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const [horas, mins] = hora.split(':').map(Number);
    const candidato = Date.UTC(anio, mes - 1, dia, horas + 3, mins, 0, 0);
    const objetivo = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    for (const ajuste of [0, 1, -1, 2, -2]) {
      const instante = candidato + ajuste * 3_600_000;
      const obtenido = partesDe(new Date(instante));
      if (obtenido.fecha === fecha && obtenido.hora === objetivo) return instante;
    }
    return candidato;
  }

  function ahoraBA(desde = new Date()) {
    const partes = partesDe(desde);
    return selloBA(partes.fecha, partes.hora);
  }

  function etiquetaLarga(fecha) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const texto = new Intl.DateTimeFormat('es-AR', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA,
    }).format(new Date(Date.UTC(anio, mes - 1, dia, 15)));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function cuandoPlazo(fecha) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric', month: 'long', timeZone: ZONA,
    }).format(new Date(Date.UTC(anio, mes - 1, dia, 15)));
  }

  function limpiarNombre(valor) {
    const texto = String(valor || '').trim().replace(/\s+/g, ' ');
    if (texto.length < 2 || texto.length > 60) return '';
    if (!/^[\p{L}][\p{L}'’.\- ]+$/u.test(texto)) return '';
    return texto;
  }

  function compactarNumero(valor) {
    return String(valor || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  }

  function validarDni(valor) {
    const dni = String(valor || '').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) return { ok: false, error: 'El DNI tiene 7 u 8 números, sin puntos.' };
    return { ok: true, dni };
  }

  function digitoVerificador(diez) {
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 10; i += 1) suma += Number(diez[i]) * pesos[i];
    const resto = suma % 11;
    const digito = 11 - resto;
    if (digito === 11) return 0;
    if (digito === 10) return null;
    return digito;
  }

  function cuilDe(dni) {
    const base = `27${String(dni).padStart(8, '0')}`;
    const digito = digitoVerificador(base);
    return digito == null ? '' : `${base}${digito}`;
  }

  function digitosCuilValidos(once) {
    if (!/^\d{11}$/.test(once)) return false;
    const esperado = digitoVerificador(once.slice(0, 10));
    return esperado != null && Number(once[10]) === esperado;
  }

  function dniDentroDeCuil(once, dni) {
    return once.slice(2, 10).replace(/^0+/, '') === String(dni).replace(/^0+/, '');
  }

  function cuilContraDni(once, dni) {
    if (!digitosCuilValidos(once)) {
      return { estado: 'cuil_invalido', titulo: 'El CUIL no cierra', detalle: 'Esos 11 números parecen un CUIL, pero el dígito verificador no coincide. Revisá el carnet.', puede: false };
    }
    if (dniDentroDeCuil(once, dni)) {
      return { estado: 'cuil_ok', titulo: 'CUIL válido', detalle: 'El número cierra como CUIL y coincide con el DNI.', puede: true };
    }
    return { estado: 'cuil_otro_titular', titulo: 'CUIL de otra persona', detalle: 'El CUIL es válido, pero es de otro DNI. Si el carnet es del titular y esta persona es familiar, se puede seguir.', puede: true };
  }

  function validarAfiliado({ dni, nro, formato }) {
    if (formato === 'ninguno') return { estado: 'particular', titulo: 'Particular', detalle: 'Sin obra social.', puede: true };
    const numero = compactarNumero(nro);
    if (!numero) return { estado: 'vacio', titulo: 'Falta el número', detalle: 'Completá el número de afiliado tal como figura en el carnet.', puede: false };
    if (formato === 'pami') {
      if (!/^\d{11}$/.test(numero) && !/^\d{14}$/.test(numero)) {
        return { estado: 'formato_invalido', titulo: 'Revisá el número de PAMI', detalle: 'El número de beneficio tiene 14 números. Los primeros 11 son el CUIL del titular.', puede: false };
      }
      const resultado = cuilContraDni(numero.slice(0, 11), dni);
      if (!resultado.puede && resultado.estado === 'cuil_invalido') {
        return { estado: 'cuil_invalido', titulo: 'El número de PAMI no cierra', detalle: 'Los primeros 11 números tienen que ser un CUIL válido, el del titular del carnet.', puede: false };
      }
      if (numero.length === 14 && resultado.estado === 'cuil_ok') {
        return { estado: 'pami_titular', titulo: 'PAMI, número de titular', detalle: 'Los 14 números tienen un CUIL válido y coincide con este DNI.', puede: true };
      }
      if (numero.length === 14) return { estado: 'pami_familiar', titulo: 'PAMI, posible familiar', detalle: 'El CUIL del carnet es válido y es de otra persona. En PAMI suele ser el del titular.', puede: true };
      return resultado;
    }
    if (formato === 'ioma') {
      if (!/^\d{5,14}$/.test(numero)) {
        return { estado: 'formato_invalido', titulo: 'Revisá el número de IOMA', detalle: 'Usá los números del carnet, sin barras. Tienen entre 5 y 14 dígitos.', puede: false };
      }
      return { estado: 'sin_padron', titulo: 'Formato de IOMA aceptado', detalle: 'IOMA no publica el padrón de afiliados. La cantidad de números es la esperada. Alejandra lo confirma con el carnet.', puede: true };
    }
    if (numero.length < 4 || numero.length > 20) {
      return { estado: 'formato_invalido', titulo: 'Revisá el número', detalle: 'Tiene que tener entre 4 y 20 letras o números.', puede: false };
    }
    if (/^\d{11}$/.test(numero)) return cuilContraDni(numero, dni);
    return { estado: 'sin_padron', titulo: 'Número aceptado', detalle: 'No hay un padrón público de afiliados para contrastar este número. Alejandra lo confirma con el carnet.', puede: true };
  }

  function obraPorId(id) {
    return OBRAS.find((obra) => String(obra.id) === String(id)) || null;
  }

  function revisarDatos(cuerpo) {
    const nombre = limpiarNombre(cuerpo.nombre);
    const apellido = limpiarNombre(cuerpo.apellido);
    const documento = validarDni(cuerpo.dni);
    const errores = [];
    if (!nombre) errores.push('Escribí el nombre.');
    if (!apellido) errores.push('Escribí el apellido.');
    if (!documento.ok) errores.push(documento.error);
    const obraOtra = String(cuerpo.obraOtra || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    let obra = null;
    let formato = 'libre';
    if (obraOtra) formato = 'libre';
    else if (cuerpo.obraId) {
      obra = obraPorId(cuerpo.obraId);
      if (!obra) errores.push('Elegí una obra social de la lista.');
      else formato = obra.formato;
    } else errores.push('Elegí la obra social.');
    if (errores.length) return { ok: false, errores };
    const validacion = validarAfiliado({ dni: documento.dni, nro: cuerpo.nro, formato });
    return {
      ok: validacion.puede,
      errores: validacion.puede ? [] : [validacion.detalle],
      validacion,
      obra,
      datos: {
        nombre,
        apellido,
        dni: documento.dni,
        obraId: obra ? obra.id : null,
        obraOtra,
        nro: formato === 'ninguno' ? '' : String(cuerpo.nro || '').trim(),
        validacion,
      },
    };
  }

  function acotar(valor, minimo, maximo, defecto) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return defecto;
    return Math.min(maximo, Math.max(minimo, Math.round(numero)));
  }

  function nombrePatologia(valor) {
    const texto = String(valor || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (texto.length < 2) return '';
    if (!/^[\p{L}0-9][\p{L}0-9'’.\-(), ]+$/u.test(texto)) return '';
    return texto;
  }

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  }

  function sesion() { return sessionStorage.getItem(SESION) === '1'; }

  function proximo(objetivo) {
    let fecha = sumarDias(hoyBA(), 1);
    for (let i = 0; i < 14; i += 1) {
      if (weekday(fecha) === objetivo) return fecha;
      fecha = sumarDias(fecha, 1);
    }
    return fecha;
  }

  function semilla() {
    const motivos = [
      ['Primera vez en el consultorio', 40],
      ['Ortodoncia', 30],
      ['Arreglo de carie', 45],
      ['Extracción', 45],
      ['Tratamiento de conducto', 60],
      ['Limpieza', 40],
      ['Otros', 30],
    ];
    const patologias = motivos.map(([nombre, minutos], orden) => ({ id: orden + 1, nombre, minutos, orden }));
    const bloques = [];
    let bloqueId = 1;
    for (const dia of [1, 2, 3, 4, 5]) {
      bloques.push({ id: bloqueId, weekday: dia, fecha: null, desde: '08:00', hasta: '17:00', tipo: 'clinica', lugar: 'Horarios ocupados' });
      bloqueId += 1;
    }
    bloques.push({ id: bloqueId, weekday: 2, fecha: null, desde: '18:00', hasta: '21:00', tipo: 'consultorio', lugar: 'Consultorio' });
    bloqueId += 1;
    bloques.push({ id: bloqueId, weekday: 4, fecha: null, desde: '18:00', hasta: '21:00', tipo: 'consultorio', lugar: 'Consultorio' });
    const ioma = OBRAS.find((obra) => obra.rnos === '902001');
    const pami = OBRAS.find((obra) => obra.rnos === '500807');
    const osde = OBRAS.find((obra) => obra.rnos === '400800');
    const particular = OBRAS.find((obra) => obra.rnos === 'PARTICULAR');
    const ahora = new Date().toISOString();
    const pacientes = [
      persona(1, 'Lucía', 'García', '30111222', ioma, '44556677', ahora),
      persona(2, 'Martín', 'Pérez', '28444555', pami, `${cuilDe('28444555')}001`, ahora),
      persona(3, 'Ana', 'Romero', '35666777', osde, '6234567890', ahora),
      persona(4, 'Sofía', 'Benítez', '33444555', particular, '', ahora),
    ];
    const martes = proximo(2);
    const jueves = proximo(4);
    const turnos = [
      turnoEjemplo(1, 1, jueves, '18:00', patologias[5], 'K7P3M'),
      turnoEjemplo(2, 2, martes, '18:00', patologias[0], 'Q2R8N'),
      turnoEjemplo(3, 3, martes, '19:00', patologias[1], 'H4T6L'),
    ];
    return {
      version: 1,
      pin: PIN_INICIAL,
      ajustes: {
        marca: 'Dent.',
        profesional: 'Alejandra Reverter',
        matricula: '61.178',
        direccion: 'Urquiza 300, San Nicolás de los Arroyos',
        bajada: 'Dejá tus datos y elegí un horario para que Alejandra te reciba.',
        duracionMin: 30,
        horizonteDias: 21,
        anticipacionHoras: 4,
        urlPublica: URL_DEMO,
        padronEstricto: false,
        tema: 'turquesa',
        fuente: 'fraunces',
        logo: LOGO,
      },
      patologias,
      bloques,
      vacaciones: [],
      pacientes,
      turnos,
      historias: [{
        id: 1,
        paciente_id: 1,
        diagnostico: 'Control de limpieza.',
        anotacion: 'Sin molestias. Próximo control en seis meses.',
        creado: ahora,
      }],
      archivos: [],
      cargas: [],
      ids: { paciente: 5, turno: 4, bloque: bloqueId + 1, vacacion: 1, patologia: 8, historia: 2, archivo: 1 },
    };
  }

  function persona(id, nombre, apellido, dni, obra, nro, creado) {
    return {
      id,
      nombre,
      apellido,
      dni,
      obra_id: obra?.id || null,
      obra_otra: obra ? '' : 'Particular',
      obra: obra?.etiqueta || 'Particular',
      rnos: obra?.rnos || '',
      formato: obra?.formato || 'ninguno',
      nro_afiliado: nro,
      validacion: null,
      creado,
    };
  }

  function turnoEjemplo(id, pacienteId, fecha, hora, motivo, codigo) {
    return {
      id,
      paciente_id: pacienteId,
      fecha,
      hora,
      duracion_min: motivo.minutos,
      patologia: motivo.nombre,
      estado: 'reservado',
      codigo,
      nota: '',
    };
  }

  function leer() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE) || '');
      if (guardado?.version === 1 && guardado.ajustes && Array.isArray(guardado.pacientes)) return guardado;
    } catch { /* vuelve a la semilla */ }
    return null;
  }

  let state = leer();
  if (!state) {
    state = semilla();
    guardar();
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function ficha() {
    const ajustes = state.ajustes;
    return {
      marca: ajustes.marca,
      profesional: ajustes.profesional,
      matricula: ajustes.matricula,
      direccion: ajustes.direccion,
      bajada: ajustes.bajada,
      tema: ajustes.tema,
      fuente: ajustes.fuente,
      patologias: state.patologias.map((item) => ({ id: item.id, nombre: item.nombre, minutos: item.minutos })),
      logo: ajustes.logo || LOGO,
    };
  }

  function urlQr() {
    const publica = String(state.ajustes.urlPublica || '').trim();
    if (/^https?:\/\/.+/i.test(publica)) return `${publica.replace(/\/$/, '')}/`;
    return URL_DEMO;
  }

  function pacienteDe(id) {
    return state.pacientes.find((item) => item.id === Number(id)) || null;
  }

  function turnoVigente(dni) {
    const hoy = hoyBA();
    const hora = horaAhora();
    return state.turnos
      .filter((turno) => turno.estado === 'reservado' || turno.estado === 'confirmado')
      .filter((turno) => {
        const paciente = pacienteDe(turno.paciente_id);
        return paciente && paciente.dni === dni && (turno.fecha > hoy || (turno.fecha === hoy && turno.hora >= hora));
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))[0] || null;
  }

  function publicoTurno(turno, conCodigo) {
    if (!turno) return null;
    return {
      id: turno.id,
      fecha: turno.fecha,
      hora: turno.hora,
      estado: turno.estado,
      cuando: etiquetaLarga(turno.fecha),
      codigo: conCodigo ? turno.codigo : undefined,
      patologia: turno.patologia || '',
      minutos: turno.duracion_min,
    };
  }

  function enVacaciones(fecha) {
    return state.vacaciones.some((item) => item.desde <= fecha && item.hasta >= fecha);
  }

  function bloquesDelDia(fecha) {
    const dia = weekday(fecha);
    return {
      semanales: state.bloques.filter((bloque) => !bloque.fecha && bloque.weekday === dia),
      puntuales: state.bloques.filter((bloque) => bloque.fecha === fecha),
    };
  }

  function menorDuracion() {
    if (!state.patologias.length) return state.ajustes.duracionMin || 30;
    return Math.min(...state.patologias.map((item) => acotar(item.minutos, 10, 180, 30)));
  }

  function motivoPorId(id) {
    if (id == null || id === '') {
      return state.patologias.find((item) => item.nombre.toLocaleLowerCase('es').includes('primera vez')) || state.patologias[0] || null;
    }
    return state.patologias.find((item) => String(item.id) === String(id)) || null;
  }

  function solapa(desdeA, hastaA, desdeB, hastaB) {
    return desdeA < hastaB && hastaA > desdeB;
  }

  function horasLibres(fecha, opciones = {}) {
    if (!fechaValida(fecha) || enVacaciones(fecha)) return [];
    const { semanales, puntuales } = bloquesDelDia(fecha);
    const consultorio = [
      ...semanales.filter((bloque) => bloque.tipo === 'consultorio'),
      ...puntuales.filter((bloque) => bloque.tipo === 'consultorio'),
    ];
    const ocupan = [
      ...semanales.filter((bloque) => bloque.tipo === 'clinica'),
      ...puntuales.filter((bloque) => bloque.tipo === 'clinica' || bloque.tipo === 'cerrado'),
    ];
    const duracion = acotar(opciones.duracion, 10, 180, state.ajustes.duracionMin || 30);
    const paso = Math.min(menorDuracion(), duracion);
    const propuestas = new Set();
    for (const bloque of consultorio) {
      let cursor = minutos(bloque.desde);
      const fin = minutos(bloque.hasta);
      while (cursor + duracion <= fin) {
        propuestas.add(horaDesdeMinutos(cursor));
        cursor += paso;
      }
    }
    const turnos = state.turnos.filter((turno) => turno.fecha === fecha && turno.estado !== 'cancelado');
    const anticipacion = acotar(state.ajustes.anticipacionHoras, 0, 168, 4) * 3_600_000;
    const limite = ahoraBA() + (opciones.saltearAnticipacion ? 0 : anticipacion);
    const ahora = ahoraBA() - 60_000;
    return [...propuestas].sort().filter((hora) => {
      const inicio = minutos(hora);
      const fin = inicio + duracion;
      if (ocupan.some((bloque) => solapa(inicio, fin, minutos(bloque.desde), minutos(bloque.hasta)))) return false;
      if (turnos.some((turno) => solapa(inicio, fin, minutos(turno.hora), minutos(turno.hora) + Number(turno.duracion_min)))) return false;
      const sello = selloBA(fecha, hora);
      return sello >= ahora && sello >= limite;
    });
  }

  function diasDisponibles(duracion) {
    const horizonte = acotar(state.ajustes.horizonteDias, 1, 60, 21);
    const hoy = hoyBA();
    const dias = [];
    for (let i = 0; i < horizonte; i += 1) {
      const fecha = sumarDias(hoy, i);
      const horas = horasLibres(fecha, { duracion });
      if (horas.length) dias.push({ fecha, horas });
    }
    return dias;
  }

  function guardarPaciente(datos) {
    const ahora = new Date().toISOString();
    const obra = datos.obraId ? obraPorId(datos.obraId) : null;
    const existe = state.pacientes.find((item) => item.dni === datos.dni);
    if (existe) {
      existe.nombre = datos.nombre;
      existe.apellido = datos.apellido;
      existe.obra_id = obra ? obra.id : null;
      existe.obra_otra = datos.obraOtra;
      existe.obra = obra?.etiqueta || datos.obraOtra || 'Particular';
      existe.rnos = obra?.rnos || '';
      existe.formato = obra?.formato || 'libre';
      existe.nro_afiliado = datos.nro;
      existe.validacion = datos.validacion || null;
      return existe.id;
    }
    const id = state.ids.paciente;
    state.ids.paciente += 1;
    state.pacientes.push({
      id,
      nombre: datos.nombre,
      apellido: datos.apellido,
      dni: datos.dni,
      obra_id: obra ? obra.id : null,
      obra_otra: datos.obraOtra,
      obra: obra?.etiqueta || datos.obraOtra || 'Particular',
      rnos: obra?.rnos || '',
      formato: obra?.formato || (datos.obraOtra ? 'libre' : 'ninguno'),
      nro_afiliado: datos.nro,
      validacion: datos.validacion || null,
      creado: ahora,
    });
    return id;
  }

  function crearTurno(datos, fecha, hora, opciones = {}) {
    if (!fechaValida(fecha) || !normalizarHora(hora)) return { ok: false, error: 'Elegí un día y un horario.' };
    if (enVacaciones(fecha)) {
      return { ok: false, error: opciones.admin ? 'Esos días son vacaciones. El consultorio no ofrece turnos.' : 'Ese horario ya no está disponible.' };
    }
    const motivo = opciones.patologia;
    if (!motivo) return { ok: false, error: 'Falta configurar los tiempos de turno.' };
    const vigente = turnoVigente(datos.dni);
    if (vigente) {
      return {
        ok: false,
        error: opciones.admin ? 'Esa persona ya tiene un turno activo.' : 'Ya tenés un turno reservado.',
        turno: publicoTurno(vigente, false),
      };
    }
    const libres = horasLibres(fecha, { saltearAnticipacion: !!opciones.saltearAnticipacion, duracion: motivo.minutos });
    if (!libres.includes(normalizarHora(hora))) {
      return { ok: false, error: opciones.admin ? 'Ese motivo no entra en ese horario. Quedaría pisando otro turno.' : 'Ese horario ya no está disponible.' };
    }
    const id = state.ids.turno;
    state.ids.turno += 1;
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    let codigo = '';
    for (let i = 0; i < 5; i += 1) codigo += ALFABETO[bytes[i] % ALFABETO.length];
    const turno = {
      id,
      paciente_id: guardarPaciente(datos),
      fecha,
      hora: normalizarHora(hora),
      duracion_min: motivo.minutos,
      patologia: motivo.nombre,
      estado: 'reservado',
      codigo,
      nota: '',
    };
    state.turnos.push(turno);
    guardar();
    return { ok: true, turno: publicoTurno(turno, true) };
  }

  function diaDeObra(rnos, formato) {
    if (!rnos || formato === 'ninguno') return null;
    if (DIA_QUINCE.has(rnos)) return 15;
    if (DIA_OCHO.has(rnos) || String(rnos).startsWith('PREPAGA-')) return 8;
    return 10;
  }

  function habil(anio, mes, dia) {
    const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    let fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
    const semana = weekday(fecha);
    if (semana === 6) fecha = sumarDias(fecha, -1);
    if (semana === 0) fecha = sumarDias(fecha, -2);
    return fecha;
  }

  function venceDe(fecha, dia) {
    const [anio, mes] = fecha.split('-').map(Number);
    const mesSiguiente = mes === 12 ? 1 : mes + 1;
    const anioSiguiente = mes === 12 ? anio + 1 : anio;
    return habil(anioSiguiente, mesSiguiente, dia);
  }

  function diasEntre(desde, hasta) {
    const [anio, mes, dia] = desde.split('-').map(Number);
    const [anioHasta, mesHasta, diaHasta] = hasta.split('-').map(Number);
    return Math.round((Date.UTC(anioHasta, mesHasta - 1, diaHasta) - Date.UTC(anio, mes - 1, dia)) / 86_400_000);
  }

  function plazoDe(paciente) {
    const dia = diaDeObra(paciente.rnos, paciente.formato);
    if (!dia) return null;
    const hoy = hoyBA();
    const cargados = new Set(state.cargas.filter((carga) => carga.paciente_id === paciente.id).map((carga) => carga.periodo));
    const vistos = new Set();
    const abiertos = [];
    for (const turno of state.turnos) {
      if (turno.paciente_id !== paciente.id || turno.estado === 'cancelado' || !fechaValida(turno.fecha)) continue;
      const periodo = turno.fecha.slice(0, 7);
      if (vistos.has(periodo) || cargados.has(periodo)) continue;
      vistos.add(periodo);
      const vence = venceDe(turno.fecha, dia);
      const dias = diasEntre(hoy, vence);
      if (dias < 0) continue;
      let habiles = 0;
      let cursor = hoy;
      for (let i = 0; i < 400 && cursor < vence; i += 1) {
        cursor = sumarDias(cursor, 1);
        const semana = weekday(cursor);
        if (semana !== 0 && semana !== 6) habiles += 1;
      }
      const nivel = dias === 0 ? 'rojo' : habiles <= 5 ? 'amarillo' : 'claro';
      abiertos.push({ periodo, vence, dias, nivel, cuando: cuandoPlazo(vence) });
    }
    abiertos.sort((a, b) => a.vence.localeCompare(b.vence));
    return abiertos[0] || null;
  }

  function listaPacientes(consulta) {
    const texto = norm(consulta);
    const lista = state.pacientes.filter((paciente) => {
      if (!texto) return true;
      return norm(`${paciente.apellido} ${paciente.nombre} ${paciente.dni} ${paciente.obra}`).includes(texto);
    }).map((paciente) => ({
      id: paciente.id,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      nro_afiliado: paciente.nro_afiliado,
      obra: paciente.obra || 'Particular',
      creado: paciente.creado,
      validacion: paciente.validacion,
      padron: paciente.validacion?.estado === 'verificado_padron' ? 'bien' : '',
      plazo: plazoDe(paciente),
    }));
    lista.sort((a, b) => {
      if (Boolean(a.plazo) !== Boolean(b.plazo)) return a.plazo ? -1 : 1;
      if (a.plazo && b.plazo && a.plazo.vence !== b.plazo.vence) return a.plazo.vence.localeCompare(b.plazo.vence);
      return String(a.creado).localeCompare(String(b.creado));
    });
    return lista.slice(0, 80);
  }

  function diaAdmin(fechaPedida) {
    const fecha = fechaValida(fechaPedida) ? fechaPedida : hoyBA();
    const { semanales, puntuales } = bloquesDelDia(fecha);
    const turnos = state.turnos
      .filter((turno) => turno.fecha === fecha && turno.estado !== 'cancelado')
      .sort((a, b) => a.hora.localeCompare(b.hora))
      .map((turno) => {
        const paciente = pacienteDe(turno.paciente_id);
        return {
          id: turno.id,
          fecha: turno.fecha,
          hora: turno.hora,
          duracion_min: turno.duracion_min,
          patologia: turno.patologia,
          estado: turno.estado,
          codigo: turno.codigo,
          nota: turno.nota || '',
          nombre: paciente?.nombre || '',
          apellido: paciente?.apellido || '',
          dni: paciente?.dni || '',
          nro_afiliado: paciente?.nro_afiliado || '',
          validacion: paciente?.validacion || null,
          obra: paciente?.obra || 'Sin obra social',
        };
      });
    const ahora = ahoraBA() - 60_000;
    return {
      fecha,
      bloques: [...semanales, ...puntuales],
      turnos,
      vacaciones: enVacaciones(fecha),
      libres: horasLibres(fecha, { saltearAnticipacion: true, duracion: menorDuracion() }).filter((hora) => selloBA(fecha, hora) >= ahora),
    };
  }

  function semana(desde) {
    const inicio = fechaValida(desde) ? desde : hoyBA();
    const dias = [];
    for (let i = 0; i < 7; i += 1) {
      const fecha = sumarDias(inicio, i);
      const turnos = state.turnos
        .filter((turno) => turno.fecha === fecha && turno.estado !== 'cancelado')
        .sort((a, b) => a.hora.localeCompare(b.hora))
        .map((turno) => ({
          id: turno.id,
          hora: turno.hora,
          estado: turno.estado,
          duracion_min: turno.duracion_min,
          patologia: turno.patologia,
          apellido: pacienteDe(turno.paciente_id)?.apellido || '',
        }));
      const { semanales, puntuales } = bloquesDelDia(fecha);
      const ocupados = enVacaciones(fecha)
        ? [{ desde: '00:00', hasta: '23:59', lugar: 'Vacaciones', tipo: 'vacaciones' }]
        : [...semanales, ...puntuales]
          .filter((bloque) => bloque.tipo !== 'consultorio')
          .map((bloque) => ({ desde: bloque.desde, hasta: bloque.hasta, lugar: bloque.lugar, tipo: bloque.tipo }));
      dias.push({ fecha, turnos, ocupados });
    }
    return { desde: inicio, hasta: sumarDias(inicio, 6), dias };
  }

  function buscarObras(consulta) {
    const texto = norm(consulta);
    let lista;
    if (!texto) lista = OBRAS.filter((obra) => obra.frecuente);
    else {
      lista = OBRAS.filter((obra) => obra._n.includes(texto));
      lista.sort((a, b) => {
        const as = a._n.startsWith(texto) ? 0 : 1;
        const bs = b._n.startsWith(texto) ? 0 : 1;
        if (as !== bs) return as - bs;
        if (a.frecuente !== b.frecuente) return b.frecuente - a.frecuente;
        return a.etiqueta.localeCompare(b.etiqueta, 'es');
      });
    }
    if (!texto) {
      lista = [...lista].sort((a, b) => {
        const ia = FRECUENTES.indexOf(a.rnos);
        const ib = FRECUENTES.indexOf(b.rnos);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.etiqueta.localeCompare(b.etiqueta, 'es');
      });
    }
    return lista.slice(0, 40).map(({ _n, ...obra }) => obra);
  }

  function ajustesPublicos() {
    return {
      ...ficha(),
      duracionMin: state.ajustes.duracionMin,
      horizonteDias: state.ajustes.horizonteDias,
      anticipacionHoras: state.ajustes.anticipacionHoras,
      urlPublica: state.ajustes.urlPublica,
      urlQr: urlQr(),
      padronEstricto: false,
      obras: OBRAS.length,
      padron: 0,
      lan: URL_DEMO,
    };
  }

  function atender(url, method, cuerpo) {
    const ruta = url.pathname;
    if (ruta === '/api/salud' && method === 'GET') return json({ ok: true, obras: OBRAS.length });
    if (ruta === '/api/inicio' && method === 'GET') return json(ficha());
    if (ruta === '/api/obras' && method === 'GET') return json(buscarObras(url.searchParams.get('q') || ''));
    if (ruta === '/api/patologias' && method === 'GET') return json(ficha().patologias);
    if (ruta === '/api/disponibles' && method === 'GET') {
      const motivo = motivoPorId(url.searchParams.get('patologia'));
      if (!motivo) return json({ dias: [], patologia: null });
      return json({ dias: diasDisponibles(motivo.minutos), patologia: motivo });
    }
    if (ruta === '/api/revisar' && method === 'POST') {
      const revision = revisarDatos(cuerpo || {});
      const turno = revision.datos ? publicoTurno(turnoVigente(revision.datos.dni), false) : null;
      return json({
        ok: revision.ok,
        errores: revision.errores,
        validacion: revision.validacion || null,
        turno,
        formato: revision.obra?.formato || (revision.datos?.obraOtra ? 'libre' : null),
      });
    }
    if (ruta === '/api/mio' && method === 'POST') {
      const documento = validarDni(cuerpo?.dni);
      if (!documento.ok) return json({ ok: false, errores: [documento.error] });
      return json({ ok: true, turno: publicoTurno(turnoVigente(documento.dni), false) });
    }
    if (ruta === '/api/cancelar' && method === 'POST') {
      const documento = validarDni(cuerpo?.dni);
      if (!documento.ok) return json({ ok: false, error: documento.error });
      const codigo = String(cuerpo?.codigo || '').trim().toUpperCase();
      const turno = state.turnos.find((item) => {
        const paciente = pacienteDe(item.paciente_id);
        return paciente?.dni === documento.dni && item.codigo === codigo && (item.estado === 'reservado' || item.estado === 'confirmado');
      });
      if (!turno) return json({ ok: false, error: 'El código no coincide con un turno activo.' });
      turno.estado = 'cancelado';
      guardar();
      return json({ ok: true });
    }
    if (ruta === '/api/turnos' && method === 'POST') {
      const revision = revisarDatos(cuerpo || {});
      if (!revision.ok) return json({ ok: false, error: revision.errores[0] || 'Revisá los datos.' });
      const motivo = motivoPorId(cuerpo.patologiaId);
      if (!motivo) return json({ ok: false, error: 'Elegí el motivo del turno.' });
      return json(crearTurno(revision.datos, cuerpo.fecha, cuerpo.hora, { patologia: motivo }));
    }
    if (ruta === '/api/admin/login' && method === 'POST') {
      if (String(cuerpo?.pin || '') !== String(state.pin)) return json({ error: 'Clave incorrecta.' }, 401);
      sessionStorage.setItem(SESION, '1');
      return json({ ok: true });
    }
    if (ruta === '/api/admin/logout' && method === 'POST') {
      sessionStorage.removeItem(SESION);
      return json({ ok: true });
    }
    if (ruta.startsWith('/api/admin')) {
      if (!sesion()) return json({ error: 'Tenés que entrar a la agenda.' }, 401);
      return rutaAdmin(ruta, method, cuerpo || {}, url);
    }
    return json({ error: 'No existe.' }, 404);
  }

  function rutaAdmin(ruta, method, cuerpo, url) {
    if (ruta === '/api/admin/dia' && method === 'GET') return json(diaAdmin(url.searchParams.get('fecha') || ''));
    if (ruta === '/api/admin/bloques' && method === 'GET') {
      return json([...state.bloques].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || a.weekday - b.weekday || a.desde.localeCompare(b.desde)));
    }
    if (ruta === '/api/admin/semana' && method === 'GET') return json(semana(url.searchParams.get('desde') || ''));
    if (ruta === '/api/admin/vacaciones' && method === 'GET') {
      return json([...state.vacaciones].sort((a, b) => a.desde.localeCompare(b.desde)));
    }
    if (ruta === '/api/admin/vacaciones' && method === 'POST') return json(agregarVacaciones(cuerpo.desde, cuerpo.hasta));
    if (ruta === '/api/admin/bloques' && method === 'POST') return json(agregarBloque(cuerpo));
    if (ruta === '/api/admin/turnos' && method === 'POST') {
      const revision = revisarDatos(cuerpo);
      if (!revision.ok) return json({ ok: false, error: revision.errores[0] || 'Revisá los datos.' });
      const motivo = motivoPorId(cuerpo.patologiaId);
      if (!motivo) return json({ ok: false, error: 'Elegí el motivo del turno.' });
      return json(crearTurno(revision.datos, cuerpo.fecha, cuerpo.hora, { saltearAnticipacion: true, admin: true, patologia: motivo }));
    }
    if (ruta === '/api/admin/patologias' && method === 'POST') return json(crearPatologia(cuerpo.nombre, cuerpo.minutos));
    if (ruta === '/api/admin/pacientes' && method === 'GET') return json(listaPacientes(url.searchParams.get('q') || ''));
    if (ruta === '/api/admin/ajustes' && method === 'GET') return json(ajustesPublicos());
    if (ruta === '/api/admin/ajustes' && method === 'PUT') return json(guardarAjustes(cuerpo));
    if (ruta === '/api/admin/logo' && method === 'POST') return json(guardarLogo(cuerpo.imagen));
    if (ruta === '/api/admin/logo' && method === 'DELETE') {
      state.ajustes.logo = LOGO;
      guardar();
      return json({ ok: true, logo: LOGO });
    }

    const tipoFranja = ruta.match(/^\/api\/admin\/bloques\/(\d+)\/tipo$/);
    if (tipoFranja && method === 'POST') return json(cambiarTipo(tipoFranja[1], cuerpo.tipo));
    const borrarBloqueRuta = ruta.match(/^\/api\/admin\/bloques\/(\d+)$/);
    if (borrarBloqueRuta && method === 'DELETE') {
      const antes = state.bloques.length;
      state.bloques = state.bloques.filter((bloque) => bloque.id !== Number(borrarBloqueRuta[1]));
      guardar();
      return json({ ok: state.bloques.length !== antes });
    }
    const vacacionRuta = ruta.match(/^\/api\/admin\/vacaciones\/(\d+)$/);
    if (vacacionRuta && method === 'DELETE') {
      state.vacaciones = state.vacaciones.filter((item) => item.id !== Number(vacacionRuta[1]));
      guardar();
      return json({ ok: true });
    }
    const turnoRuta = ruta.match(/^\/api\/admin\/turnos\/(\d+)$/);
    if (turnoRuta && method === 'POST') {
      const turno = state.turnos.find((item) => item.id === Number(turnoRuta[1]));
      if (!turno || !ESTADOS.includes(cuerpo.estado)) return json({ ok: false });
      turno.estado = cuerpo.estado;
      guardar();
      return json({ ok: true });
    }
    const patologiaRuta = ruta.match(/^\/api\/admin\/patologias\/(\d+)$/);
    if (patologiaRuta && method === 'DELETE') {
      if (state.patologias.length <= 1) return json({ ok: false, error: 'Dejá al menos un motivo de turno.' });
      const antes = state.patologias.length;
      state.patologias = state.patologias.filter((item) => item.id !== Number(patologiaRuta[1]));
      guardar();
      return json(antes === state.patologias.length ? { ok: false, error: 'Esa patología no está.' } : { ok: true });
    }
    const historiaRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/historia$/);
    if (historiaRuta && method === 'GET') {
      return json(state.historias.filter((item) => item.paciente_id === Number(historiaRuta[1])));
    }
    if (historiaRuta && method === 'POST') return json(crearHistoria(historiaRuta[1], cuerpo.diagnostico, cuerpo.anotacion));
    const cargaRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/carga$/);
    if (cargaRuta && method === 'POST') {
      const periodo = String(cuerpo.periodo || '');
      if (!/^\d{4}-\d{2}$/.test(periodo)) return json({ ok: false, error: 'No encontré ese período.' });
      state.cargas.push({ paciente_id: Number(cargaRuta[1]), periodo });
      guardar();
      return json({ ok: true });
    }
    const archivosRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/archivos$/);
    if (archivosRuta && method === 'GET') {
      return json(state.archivos.filter((item) => item.paciente_id === Number(archivosRuta[1])).map(archivoPublico));
    }
    if (archivosRuta && method === 'POST') return json(guardarArchivo(archivosRuta[1], cuerpo.nombre, cuerpo.archivo, cuerpo.tipo));
    const archivoRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)\/archivos\/(\d+)$/);
    if (archivoRuta && method === 'DELETE') {
      state.archivos = state.archivos.filter((item) => !(item.id === Number(archivoRuta[2]) && item.paciente_id === Number(archivoRuta[1])));
      guardar();
      return json({ ok: true });
    }
    const pacienteRuta = ruta.match(/^\/api\/admin\/pacientes\/(\d+)$/);
    if (pacienteRuta && method === 'PUT') return json(editarPaciente(pacienteRuta[1], cuerpo));
    if (pacienteRuta && method === 'DELETE') return json(borrarPaciente(pacienteRuta[1]));
    return json({ ok: false, error: 'En la demo esa acción no está.' });
  }

  function agregarBloque(cuerpo) {
    const desde = normalizarHora(cuerpo.desde);
    const hasta = normalizarHora(cuerpo.hasta);
    if (!desde || !hasta || minutos(hasta) <= minutos(desde)) return { ok: false, error: 'El horario de fin tiene que ser posterior al de inicio.' };
    if (!['consultorio', 'clinica', 'cerrado'].includes(cuerpo.tipo)) return { ok: false, error: 'Elegí si es el consultorio, una clínica o un día cerrado.' };
    let diaSemana = null;
    let fecha = null;
    if (cuerpo.fecha) {
      if (!fechaValida(cuerpo.fecha)) return { ok: false, error: 'La fecha no es válida.' };
      fecha = cuerpo.fecha;
    } else if (cuerpo.tipo === 'cerrado') return { ok: false, error: 'Para cerrar un día, elegí la fecha.' };
    else if (!Number.isInteger(Number(cuerpo.weekday)) || Number(cuerpo.weekday) < 0 || Number(cuerpo.weekday) > 6) return { ok: false, error: 'Elegí el día de la semana.' };
    else diaSemana = Number(cuerpo.weekday);
    const lugar = String(cuerpo.lugar || '').trim().slice(0, 60)
      || (cuerpo.tipo === 'consultorio' ? 'Consultorio' : cuerpo.tipo === 'cerrado' ? 'Cerrado' : 'Horarios ocupados');
    const id = state.ids.bloque;
    state.ids.bloque += 1;
    state.bloques.push({ id, weekday: diaSemana, fecha, desde, hasta, tipo: cuerpo.tipo, lugar });
    guardar();
    return { ok: true, id };
  }

  function cambiarTipo(id, tipo) {
    if (!['consultorio', 'clinica'].includes(tipo)) return { ok: false, error: 'Elegí disponible u ocupada.' };
    const bloque = state.bloques.find((item) => item.id === Number(id));
    if (!bloque || bloque.fecha) return { ok: false, error: 'Esa franja no se puede cambiar así.' };
    bloque.tipo = tipo;
    bloque.lugar = tipo === 'consultorio' ? 'Consultorio' : (bloque.lugar && bloque.lugar !== 'Consultorio' ? bloque.lugar : 'Horarios ocupados');
    guardar();
    return { ok: true };
  }

  function agregarVacaciones(desde, hasta) {
    const inicio = String(desde || '').trim();
    const fin = String(hasta || '').trim();
    if (!fechaValida(inicio) || !fechaValida(fin)) return { ok: false, error: 'La fecha no es válida.' };
    if (fin < inicio) return { ok: false, error: 'El último día tiene que ser el mismo o posterior al primero.' };
    let total = 1;
    let cursor = inicio;
    while (cursor < fin) {
      cursor = sumarDias(cursor, 1);
      total += 1;
      if (total > 90) break;
    }
    if (total > 90) return { ok: false, error: 'Las vacaciones pueden durar hasta 90 días.' };
    if (state.vacaciones.some((item) => item.desde <= fin && item.hasta >= inicio)) {
      return { ok: false, error: 'Esas fechas ya están dentro de otras vacaciones.' };
    }
    const id = state.ids.vacacion;
    state.ids.vacacion += 1;
    state.vacaciones.push({ id, desde: inicio, hasta: fin });
    guardar();
    return { ok: true, id };
  }

  function crearPatologia(nombre, minutos) {
    const limpio = nombrePatologia(nombre);
    const textoMin = String(minutos ?? '').trim();
    const mins = /^\d+$/.test(textoMin) ? Number(textoMin) : null;
    if (!limpio) return { ok: false, error: 'Escribí el nombre de la patología.' };
    if (mins == null || mins < 10 || mins > 180) return { ok: false, error: 'La duración va de 10 a 180 minutos.' };
    if (state.patologias.some((item) => norm(item.nombre) === norm(limpio))) return { ok: false, error: 'Esa patología ya está.' };
    const id = state.ids.patologia;
    state.ids.patologia += 1;
    state.patologias.push({ id, nombre: limpio, minutos: mins, orden: id });
    guardar();
    return { ok: true, id };
  }

  function guardarAjustes(cuerpo) {
    const texto = (valor, max, defecto) => {
      const limpio = String(valor ?? '').trim().slice(0, max);
      return limpio || defecto;
    };
    if (cuerpo.marca != null) state.ajustes.marca = texto(cuerpo.marca, 24, 'Dent.');
    if (cuerpo.profesional != null) state.ajustes.profesional = texto(cuerpo.profesional, 60, 'Alejandra Reverter');
    if (cuerpo.matricula != null) state.ajustes.matricula = texto(cuerpo.matricula, 20, '');
    if (cuerpo.direccion != null) state.ajustes.direccion = texto(cuerpo.direccion, 120, '');
    if (cuerpo.bajada != null) state.ajustes.bajada = texto(cuerpo.bajada, 280, '');
    if (cuerpo.duracionMin != null) state.ajustes.duracionMin = acotar(cuerpo.duracionMin, 10, 180, 30);
    if (cuerpo.horizonteDias != null) state.ajustes.horizonteDias = acotar(cuerpo.horizonteDias, 1, 60, 21);
    if (cuerpo.anticipacionHoras != null) state.ajustes.anticipacionHoras = acotar(cuerpo.anticipacionHoras, 0, 168, 4);
    if (cuerpo.urlPublica != null) {
      const publica = String(cuerpo.urlPublica).trim().slice(0, 200);
      if (publica && !/^https?:\/\/.+/i.test(publica)) return { ok: false, error: 'El link público tiene que empezar con http:// o https://' };
      state.ajustes.urlPublica = publica;
    }
    if (cuerpo.tema != null) state.ajustes.tema = TEMAS.includes(cuerpo.tema) ? cuerpo.tema : 'turquesa';
    if (cuerpo.fuente != null) state.ajustes.fuente = FUENTES.includes(cuerpo.fuente) ? cuerpo.fuente : 'fraunces';
    if (cuerpo.pin) {
      if (!/^\d{6}$/.test(String(cuerpo.pin))) return { ok: false, error: 'La clave nueva tiene que ser de 6 números.' };
      state.pin = String(cuerpo.pin);
    }
    guardar();
    return { ok: true, urlQr: urlQr(), logo: state.ajustes.logo || LOGO };
  }

  function guardarLogo(imagen) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(String(imagen || ''))) {
      return { ok: false, error: 'El logo tiene que ser PNG, JPG o WebP.' };
    }
    if (String(imagen).length > 2_100_000) return { ok: false, error: 'Esa imagen no sirve como logo. Usá un PNG, JPG o WebP de hasta 1,5 MB.' };
    state.ajustes.logo = imagen;
    if (!guardar()) return { ok: false, error: 'En la demo ese logo no entra en el navegador.' };
    return { ok: true, logo: imagen };
  }

  function textoClinico(valor) {
    return String(valor || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  }

  function crearHistoria(pacienteId, diagnostico, anotacion) {
    if (!pacienteDe(pacienteId)) return { ok: false, error: 'No encontré a ese paciente.' };
    const diag = textoClinico(diagnostico);
    const nota = textoClinico(anotacion);
    if (!diag && !nota) return { ok: false, error: 'Escribí el diagnóstico o una anotación.' };
    const id = state.ids.historia;
    state.ids.historia += 1;
    state.historias.push({ id, paciente_id: Number(pacienteId), diagnostico: diag, anotacion: nota, creado: new Date().toISOString() });
    guardar();
    return { ok: true, id };
  }

  function editarPaciente(pacienteId, cuerpo) {
    const actual = pacienteDe(pacienteId);
    if (!actual) return { ok: false, error: 'No encontré a ese paciente.' };
    const obraTexto = String(cuerpo?.obra || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const obra = obraTexto ? OBRAS.find((item) => item.etiqueta.toLocaleLowerCase('es') === obraTexto.toLocaleLowerCase('es')) : null;
    const revisado = revisarDatos({
      nombre: cuerpo?.nombre,
      apellido: cuerpo?.apellido,
      dni: cuerpo?.dni,
      obraId: obra ? obra.id : null,
      obraOtra: obra ? '' : obraTexto,
      nro: cuerpo?.nro,
    });
    if (!revisado.ok) return { ok: false, error: revisado.errores[0] };
    if (state.pacientes.some((item) => item.dni === revisado.datos.dni && item.id !== actual.id)) {
      return { ok: false, error: 'Ese DNI ya está en otro paciente.' };
    }
    actual.nombre = revisado.datos.nombre;
    actual.apellido = revisado.datos.apellido;
    actual.dni = revisado.datos.dni;
    actual.obra_id = revisado.datos.obraId;
    actual.obra_otra = revisado.datos.obraOtra;
    actual.obra = obra?.etiqueta || revisado.datos.obraOtra || 'Particular';
    actual.rnos = obra?.rnos || '';
    actual.formato = obra?.formato || 'libre';
    actual.nro_afiliado = revisado.datos.nro;
    actual.validacion = revisado.datos.validacion;
    guardar();
    return { ok: true };
  }

  function borrarPaciente(pacienteId) {
    const id = Number(pacienteId);
    if (!pacienteDe(id)) return { ok: false, error: 'No encontré a ese paciente.' };
    state.turnos = state.turnos.filter((turno) => turno.paciente_id !== id);
    state.historias = state.historias.filter((item) => item.paciente_id !== id);
    state.archivos = state.archivos.filter((item) => item.paciente_id !== id);
    state.cargas = state.cargas.filter((item) => item.paciente_id !== id);
    state.pacientes = state.pacientes.filter((item) => item.id !== id);
    guardar();
    return { ok: true };
  }

  function archivoPublico(item) {
    return { id: item.id, tipo: item.tipo, nombre: item.nombre, creado: item.creado, dataUrl: item.dataUrl };
  }

  function guardarArchivo(pacienteId, nombre, dataUrl, tipoPedido) {
    if (!pacienteDe(pacienteId)) return { ok: false, error: 'No encontré a ese paciente.' };
    const coincidencia = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp)|application\/pdf|text\/plain)/i);
    if (!coincidencia) return { ok: false, error: 'Subí una foto (JPG, PNG o WebP) o un texto (PDF o TXT).' };
    const mime = coincidencia[1].toLowerCase();
    const tipo = mime.startsWith('image/') ? 'foto' : 'documento';
    if (tipoPedido && tipoPedido !== tipo) return { ok: false, error: 'Subí una foto (JPG o PNG) o un texto.' };
    const id = state.ids.archivo;
    state.ids.archivo += 1;
    state.archivos.push({
      id,
      paciente_id: Number(pacienteId),
      tipo,
      nombre: textoClinico(nombre) || (tipo === 'foto' ? 'Foto' : 'Documento'),
      dataUrl,
      creado: new Date().toISOString(),
    });
    if (!guardar()) {
      state.archivos.pop();
      return { ok: false, error: 'En la demo ese archivo no entra en el navegador.' };
    }
    return { ok: true, id, tipo };
  }

  const red = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const crudo = typeof input === 'string' ? input : input.url;
    const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
    let url;
    try { url = new URL(crudo, location.href); } catch { return red(input, init); }
    if (!url.pathname.startsWith('/api/')) return red(input, init);
    let cuerpo = null;
    if (init.body) {
      try { cuerpo = JSON.parse(init.body); } catch { cuerpo = null; }
    }
    return Promise.resolve(atender(url, method, cuerpo));
  };
}());
