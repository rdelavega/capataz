# Plan de demo y scouting

Objetivo de cada cita: que el dueño vea en 15 minutos que Capataz le quita
llamadas, y salir con respuestas a las preguntas de scouting. Vender es
secundario en esta etapa.

---

## 1. Un día antes

- [ ] **Fotos del giro**: 3–5 fotos reales (obra, taller, reparto…) en una
      carpeta local. Sin fotos la demo pierde mucho.
- [ ] **Preparar los datos** (BORRA los datos de la empresa en producción: no
      correr si ya hay un cliente piloto ahí; ver "Ambiente de demo" abajo):
      ```bash
      cd backend
      railway run python3 seed_demo.py --giro construccion \
          --empresa "Constructora Pech" --mi-numero "999 123 4567" \
          --fotos ~/demo_fotos/construccion
      ```
      Giros: `construccion`, `taller`, `distribuidora`, `servicios`.
      Tu número queda como el trabajador que "no ha llegado" y como
      **encargado** de una cuadrilla (en construcción: "Cuadrilla Cholul").
- [ ] **Ensayo completo** (la sección 2 de principio a fin) con el celular y la
      laptop, cronometrado.
- [ ] **Supabase despierto**: abrir el dashboard una vez (si estuvo inactivo
      días, Supabase pausa el proyecto).
- [ ] **WhatsApp**: el bot contesta a tu "hola"; saldo/método de pago en Meta.
- [ ] **No mandes nada al bot después del ensayo** hasta la demo, o ya no
      aparecerás como "no ha llegado". (Si pasó, vuelve a correr `seed_demo`.)

## 2. Guion (15–20 min)

**Equipo:** laptop con el dashboard (o el celular del dueño, mejor aún) + tu
celular con WhatsApp.

1. **El dolor (2 min) — pregunta, no presentes.**
   "¿Cómo sabes hoy quién llegó a la obra y cómo va el trabajo?"
   "¿Cuántas llamadas haces al día para eso?" Deja que hable. Anota.

2. **"Necesita tu atención" (3 min).**
   Abre **Hoy**. "Esto es lo primero que ves en la mañana: solo lo que requiere
   que hagas algo." Señala: quién no ha llegado (y que el bot ya le preguntó),
   la tarea atrasada, la tarea que espera tu visto bueno, el que llega tarde
   seguido. Toca **Escribirle**: abre WhatsApp con el mensaje listo.

3. **El momento en vivo (3 min).**
   "Ese que no ha llegado soy yo. Mira." Manda **"presente"** desde tu celular.
   El bot te contesta y en segundos el panel cambia (se actualiza solo).
   Mensaje clave: *el trabajador no instala nada; ya sabe usar WhatsApp.*

4. **Trabajo de cuadrilla con prueba (4 min).**
   Primero **Equipo → Cuadrillas**: "Tú no le dices a cada quien qué hacer; le
   mandas el trabajo a la cuadrilla y el encargado te reporta."
   Luego en **Tareas**, en el trabajo de tu cuadrilla ("Armado de castillos
   fachada" en construcción), toca **Que el bot pregunte**. Como encargado te
   llegan botones: aprieta **Ya terminé**, el bot pide foto, manda una. El
   trabajo pasa a **Por revisar** con la foto. Que el dueño lo **apruebe** él
   mismo. Mensaje clave: *ya no es "dice que ya quedó": es foto y visto bueno.*
   (Si la cuadrilla tuviera varios trabajos abiertos, el bot pregunta de cuál
   es la foto con botones.)

5. **Ficha del trabajador (2 min).**
   Pica a alguien en **Equipo**: 30 días de asistencia, a qué hora llega en
   promedio, qué hizo hoy, sus fotos. "Con esto hablas con datos."

6. **Resumen diario (1 min).**
   "A las 6 pm te llega esto a tu WhatsApp." Mientras Meta no apruebe la
   plantilla, enséñalo en captura (la maqueta del rediseño, sección 05).

7. **Scouting (5 min)** → preguntas de la sección 4. Es lo más importante.

**Cierre:** "¿Te gustaría probarlo con tu gente 15 días?" Si dice que sí, agenda
el alta: lista de trabajadores con teléfono, obras/sucursales, hora de entrada.

### Si algo falla en vivo
- **El bot no contesta**: sigue con el panel (los datos ya están); "el
  mensaje tarda a veces, mira cómo se ve cuando llega" y continúa.
- **El panel no se actualiza**: botón **Actualizar** arriba a la derecha.
- **Sin internet en la obra**: datos del celular; o enseña en el celular del
  dueño con su conexión.

## 3. Precios (propuesta a validar)

Por número de trabajadores activos, mensual, más IVA:

| Plan | Trabajadores | Precio/mes | Por trabajador |
|---|---|---|---|
| Básico | hasta 10 | $990 | ~$99 |
| Estándar | hasta 25 | $1,990 | ~$80 |
| Plus | hasta 50 | $3,490 | ~$70 |

- **Costo estimado** por trabajador: ~$20–25 MXN/mes (WhatsApp ~$0.0085 USD por
  mensaje con 1,000 gratis al mes por número, transcripción y fotos). Fijos
  (Railway, Supabase, dominio): ~$500–900 MXN/mes en total. Margen > 70%.
- **Ancla de valor**: un supervisor cuesta $12,000–20,000 MXN/mes; una hora
  diaria del dueño persiguiendo gente son ~22 h/mes.
- **Pilotos (primeros 3–5)**: 15 días de prueba sin costo (así lo dice la landing), a
  cambio de retroalimentación y de ser referencia. No regalar más de un mes.
- No dar el precio antes de que vea la demo. Si pregunta al inicio: "depende
  de cuánta gente tengas; te lo digo al final con tu caso".

## 4. Preguntas de scouting

Anota las respuestas tal cual las dice (sus palabras sirven para la landing).

**Operación**
1. ¿Cuántos trabajadores tienes en campo? ¿En cuántas obras/sucursales?
2. ¿A qué hora entra tu gente? ¿Es igual en todas las obras? ¿Cuánta tolerancia das?
3. ¿Quién te reporta hoy cómo va el trabajo y cómo (llamadas, WhatsApp, fotos, Excel)?
3b. ¿Le dices a cada quien qué hacer o mandas a la cuadrilla a un trabajo? ¿Cuántas
    cuadrillas tienes y quién es el encargado de cada una? ¿Una cuadrilla se mueve
    entre obras?
4. ¿Todos tus trabajadores tienen WhatsApp? ¿Celular propio?

**Dolor**
5. ¿Cuánto tiempo al día pierdes llamando para saber cómo va el trabajo?
6. ¿Cuál fue la última vez que te enteraste tarde de algo (alguien no llegó,
   un trabajo mal hecho, una obra parada)? ¿Cuánto te costó?
7. ¿Usas o usaste alguna app o checador? ¿Por qué la dejaste?

**Precio y decisión**
8. ¿A qué precio te parecería tan barato que desconfiarías?
9. ¿A qué precio ya ni lo considerarías?
10. ¿Lo pagarías tú o tendrías que consultarlo con alguien?
11. ¿Qué tendría que pasar en el primer mes para que digas "esto sí sirve"?

**Después de cada cita**: en una hoja, giro, # trabajadores, dolor principal
(sus palabras), rango de precio, ¿quiere piloto?, qué pidió que no existe.
Las features que pidan 3 o más prospectos son las que siguen.

## 5. Ambiente de demo (cuando haya un piloto)

`seed_demo` borra los datos de la empresa configurada en `COMPANY_ID`. En
cuanto haya un cliente real en producción, las demos van en un ambiente
aparte: segundo servicio en Railway + segunda base en Supabase con su propio
`COMPANY_ID` y un número de WhatsApp de demo. Ahí tiene sentido un botón
"Preparar demo" en el dashboard en lugar del script.
