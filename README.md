# Dent. Alejandra Reverter

Turnos del consultorio de casa. El paciente entra por el QR, deja nombre, apellido, DNI y obra social, y elige un horario. Alejandra ve la agenda en el teléfono y marca qué horas atiende en casa y cuáles está en otra clínica.

## Cómo abrirlo

Doble clic en `iniciar.bat`. La primera vez crea una clave de 6 números en `data/clave-inicial.txt`.

- Pacientes: http://localhost:4173
- Agenda: http://localhost:4173/admin

En la misma red wifi, el celular abre la dirección que muestra la consola. Para el QR de la puerta, con datos móviles, hace falta un link de internet: se pega en Más, en “Link público del QR”, y se vuelve a imprimir.

## Horarios de arranque

De lunes a viernes, 8 a 17, figura como “Otra clínica” y no se ofrece. Martes y jueves, 18 a 21, es el consultorio de casa. Se cambia en Horarios.

La matrícula 61.178 y Urquiza 300 salen del listado de prestadores del Círculo Odontológico de San Nicolás de septiembre de 2025. Si la credencial o la puerta dicen otra cosa, se corrigen en Más.
