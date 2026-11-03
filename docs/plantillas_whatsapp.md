# Plantillas de WhatsApp para Capataz

Los mensajes que el bot manda **sin que el trabajador haya escrito primero**
(recordatorio de llegada, preguntar por una tarea, resumen al dueño) tienen que
ser plantillas aprobadas por Meta. Sin plantilla, ese envío automático
simplemente no corre: el resto de Capataz funciona igual.

Costo (México, oct 2026): ~$0.0085 USD por mensaje de utilidad; marketing
cuesta ~5 veces más. Si Meta reclasifica una plantilla como marketing, **no la
uses**: créala de nuevo con otro nombre y otra redacción.

A los trabajadores, Capataz primero intenta sin plantilla: si escribieron en las
últimas 24 h, el mensaje cae en la ventana de servicio (1,000 gratis al mes por
número). Las plantillas 1 y 2 solo se usan con quien no ha escrito.

## Cómo darlas de alta

1. Entra a **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**.
2. Categoría: **Utilidad**. Idioma: **Español (MEX)** (`es_MX`).
3. Copia el nombre, el cuerpo y los botones tal cual vienen abajo. Los
   `{{1}}`, `{{2}}` son variables: Meta pide un ejemplo para cada una.
4. Cuando Meta la apruebe (de minutos a 1–2 días), pon el nombre en la variable
   de Railway correspondiente. A partir de ese momento el envío corre solo.

Los botones son **respuesta rápida** (no URL): Capataz llena su contenido al
enviar, así sabe qué tarea contestó el trabajador.

---

### 1. Recordatorio de llegada

- **Nombre:** `capataz_recordatorio_llegada`
- **Variable en Railway:** `WA_TEMPLATE_CHECKIN_REMINDER`
- **Hora:** `CHECKIN_REMINDER_TIME` (default 08:30), solo a quien no ha mandado "presente".

**Cuerpo:**
```
Hola {{1}}, no hay registro de tu llegada de hoy. Indica tu asistencia con uno de los botones o envía "presente" al llegar.
```
Ejemplo de {{1}}: `Luis`

**Botones (respuesta rápida):**
1. `Ya llegué`
2. `Hoy no voy`

---

### 2. Estado de tarea asignada

> La primera versión (`capataz_avance_tarea`, "¿cómo va…?") Meta la reclasificó
> como **marketing**. Bórrala o ignórala y crea esta con **otro nombre**.

- **Nombre:** `capataz_estado_tarea`
- **Variable en Railway:** `WA_TEMPLATE_JOB_PROGRESS`
- **Hora:** `JOB_PROGRESS_TIME` (default 15:00), para tareas que vencen hoy o ya
  vencieron y no tienen foto de hoy. También la usa el botón "Que el bot
  pregunte" del tablero.
- **Casi nunca se usa:** si el trabajador escribió en las últimas 24 h (mandó
  "presente" en la mañana), el bot le pregunta con un mensaje normal, sin
  plantilla. Esta es el respaldo para quien no ha escrito.

**Cuerpo:**
```
Hola {{1}}, se requiere el estado de la tarea asignada "{{2}}", con fecha de entrega {{3}}. Indica el estado con uno de los botones. Si ya está terminada, envía una foto como evidencia.
```
Ejemplos: `Luis` · `Colado de losa 2º piso` · `hoy`

**Botones (respuesta rápida):**
1. `Terminada`
2. `En proceso`
3. `Tengo un problema`

Por qué así: Meta clasifica como utilidad lo que se refiere a algo concreto que
ya existe entre la empresa y la persona (una tarea asignada con fecha), con
tono de aviso. Lo que suena a "¿qué tal?", a invitación o a seguimiento para
platicar lo manda a marketing. Sin emojis, sin signos de exclamación, sin
preguntas abiertas.

---

### 2b. Trabajo asignado

- **Nombre:** `capataz_trabajo_asignado`
- **Variable en Railway:** `WA_TEMPLATE_JOB_ASSIGNED`
- **Cuándo:** al crear un trabajo en el dashboard con "Avisarle por WhatsApp"
  marcado. Le llega al **encargado** de la cuadrilla (o a la persona asignada).
- **Casi nunca se usa:** si el encargado escribió en las últimas 24 h, el aviso
  va como mensaje normal (gratis dentro de los 1,000 de servicio). Esta es el
  respaldo para cuando no ha escrito.

**Cuerpo:**
```
Hola {{1}}, se te asignó el trabajo "{{2}}" con fecha de entrega {{3}}. Detalles: {{4}}. Confirma de recibido con el botón. Al terminar, indícalo y envía una foto como evidencia.
```
Ejemplos: `Jorge` · `Fumigar casa García` · `mañana` · `Calle 60 #123, Centro`

**Botones (respuesta rápida):**
1. `Enterado`
2. `Terminado`
3. `Tengo un problema`

---

### 3. Resumen diario al dueño

- **Nombre:** `capataz_resumen_diario`
- **Variable en Railway:** `WA_TEMPLATE_DAILY_SUMMARY`
- **Hora:** `DAILY_SUMMARY_TIME` (default 18:00), a los usuarios con teléfono
  (`python seed_user.py ... --phone "999 123 4567"`).

**Cuerpo:**
```
Resumen de {{1}}

✅ Llegaron {{2}} de {{3}}. Faltaron: {{4}}.
📸 Tareas terminadas hoy: {{5}}. Esperan tu visto bueno: {{6}}.
🔴 Atrasadas: {{7}}.

Revisa el detalle en tu panel de Capataz.
```
Ejemplos: `Hoy 02/11` · `18` · `20` · `Pedro May, Raúl Dzib` · `5` · `2` ·
`Impermeabilización azotea (Pedro May)`

**Botón (opcional, tipo URL):** `Abrir panel` → la URL de tu dashboard en Vercel.

---

## Notas

- Las variables no pueden llevar saltos de línea; Capataz ya las limpia.
- Si Meta rechaza una plantilla por "marketing", quita emojis y cualquier frase
  que suene a promoción. Estas tres son operativas (utilidad).
- Los envíos quedan registrados en la tabla `notifications` (con error si Meta
  lo rechazó). Con eso el panel dice "el bot le preguntó a las 8:30".
