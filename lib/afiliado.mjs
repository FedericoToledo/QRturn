import { compactarNumero } from './texto.mjs';
import { digitosCuilValidos, dniDentroDeCuil } from './cuil.mjs';

function cuilContraDni(once, dni) {
  if (!digitosCuilValidos(once)) {
    return {
      estado: 'cuil_invalido',
      titulo: 'El CUIL no cierra',
      detalle: 'Esos 11 números parecen un CUIL, pero el dígito verificador no coincide. Revisá el carnet.',
      puede: false,
    };
  }
  if (dniDentroDeCuil(once, dni)) {
    return {
      estado: 'cuil_ok',
      titulo: 'CUIL válido',
      detalle: 'El número cierra como CUIL y coincide con el DNI.',
      puede: true,
    };
  }
  return {
    estado: 'cuil_otro_titular',
    titulo: 'CUIL de otra persona',
    detalle: 'El CUIL es válido, pero es de otro DNI. Si el carnet es del titular y esta persona es familiar, se puede seguir.',
    puede: true,
  };
}

function validarPami(dni, numero) {
  if (!/^\d{11}$/.test(numero) && !/^\d{14}$/.test(numero)) {
    return {
      estado: 'formato_invalido',
      titulo: 'Revisá el número de PAMI',
      detalle: 'El número de beneficio tiene 14 números. Los primeros 11 son el CUIL del titular.',
      puede: false,
    };
  }
  const resultado = cuilContraDni(numero.slice(0, 11), dni);
  if (!resultado.puede && resultado.estado === 'cuil_invalido') {
    return {
      estado: 'cuil_invalido',
      titulo: 'El número de PAMI no cierra',
      detalle: 'Los primeros 11 números tienen que ser un CUIL válido, el del titular del carnet.',
      puede: false,
    };
  }
  if (numero.length === 14 && resultado.estado === 'cuil_ok') {
    return {
      estado: 'pami_titular',
      titulo: 'PAMI, número de titular',
      detalle: 'Los 14 números tienen un CUIL válido y coincide con este DNI.',
      puede: true,
    };
  }
  if (numero.length === 14) {
    return {
      estado: 'pami_familiar',
      titulo: 'PAMI, posible familiar',
      detalle: 'El CUIL del carnet es válido y es de otra persona. En PAMI suele ser el del titular.',
      puede: true,
    };
  }
  return resultado;
}

function validarIoma(numero) {
  if (!/^\d{5,14}$/.test(numero)) {
    return {
      estado: 'formato_invalido',
      titulo: 'Revisá el número de IOMA',
      detalle: 'Usá los números del carnet, sin barras. Tienen entre 5 y 14 dígitos.',
      puede: false,
    };
  }
  return {
    estado: 'sin_padron',
    titulo: 'Formato de IOMA aceptado',
    detalle: 'IOMA no publica el padrón de afiliados. La cantidad de números es la esperada. Alejandra lo confirma con el carnet.',
    puede: true,
  };
}

function validarLibre(dni, numero) {
  if (numero.length < 4 || numero.length > 20) {
    return {
      estado: 'formato_invalido',
      titulo: 'Revisá el número',
      detalle: 'Tiene que tener entre 4 y 20 letras o números.',
      puede: false,
    };
  }
  if (/^\d{11}$/.test(numero)) return cuilContraDni(numero, dni);
  return {
    estado: 'sin_padron',
    titulo: 'Número aceptado',
    detalle: 'No hay un padrón público de afiliados para contrastar este número. Alejandra lo confirma con el carnet.',
    puede: true,
  };
}

function mismoNumero(guardado, escrito) {
  return compactarNumero(guardado) === escrito;
}

export function validarAfiliado({ dni, nro, formato, padron }) {
  if (formato === 'ninguno') {
    return {
      estado: 'particular',
      titulo: 'Particular',
      detalle: 'Sin obra social.',
      puede: true,
    };
  }

  const numero = compactarNumero(nro);
  if (!numero) {
    return {
      estado: 'vacio',
      titulo: 'Falta el número',
      detalle: 'Completá el número de afiliado tal como figura en el carnet.',
      puede: false,
    };
  }

  if (padron?.tienePadron) {
    const coincidencia = padron.delDni.some((fila) => mismoNumero(fila.nro_afiliado, numero));
    if (coincidencia) {
      return {
        estado: 'verificado_padron',
        titulo: 'Figura en el padrón cargado',
        detalle: 'El DNI y el número coinciden con el archivo que cargaste en la agenda.',
        puede: true,
      };
    }
    if (padron.delDni.length) {
      return {
        estado: 'padron_distinto',
        titulo: 'El número no coincide',
        detalle: 'Ese DNI está en el padrón de esta obra social, con otro número de afiliado.',
        puede: false,
      };
    }
    if (padron.estricto) {
      return {
        estado: 'fuera_de_padron',
        titulo: 'No figura en el padrón',
        detalle: 'Esta obra social tiene un padrón cargado y este DNI no aparece.',
        puede: false,
      };
    }
  }

  if (formato === 'pami') return validarPami(dni, numero);
  if (formato === 'ioma') return validarIoma(numero);
  return validarLibre(dni, numero);
}
