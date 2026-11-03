# Plantillas de WhatsApp para Capataz

Los mensajes que el bot manda **sin que el trabajador haya escrito primero**
(recordatorio de llegada, preguntar por una tarea, resumen al dueño) tienen que
ser plantillas aprobadas por Meta. Sin plantilla, ese envío automático
simplemente no corre: el resto de Capataz funciona igual.

Costo (México, oct 2026): ~$0.0085 USD por mensaje de utilidad. Para 20
trabajadores con recordatorio diario son ~$4–5 USD al mes.

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
Hola {{1}}, todavía no tenemos tu registro de hoy. Cuando llegues, aprieta *Ya llegué* o manda "presente".
```
Ejemplo de {{1}}: `Luis`

**Botones (respuesta rápida):**
1. `Ya llegué`
2. `Hoy no voy`

---

### 2. ¿Cómo va la tarea?

- **Nombre:** `capataz_avance_tarea`
- **Variable en Railway:** `WA_TEMPLATE_JOB_PROGRESS`
- **Hora:** `JOB_PROGRESS_TIME` (default 15:00), para tareas que vencen hoy o ya
  vencieron y no tienen foto de hoy. También lo usa el botón "Que el bot
  pregunte" del tablero.

**Cuerpo:**
```
Hola {{1}}, ¿cómo va *{{2}}*? Vence: {{3}}. Si ya terminaste, aprieta el botón y manda una foto de cómo quedó.
```
Ejemplos: `Luis` · `Colado de losa 2º piso` · `hoy`

**Botones (respuesta rápida):**
1. `Ya terminé`
2. `Sigo en eso`
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
