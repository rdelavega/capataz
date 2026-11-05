# Recorrido de pruebas antes de una demo

Para validar con tu celular y el dashboard que todo funciona antes de
enseñarlo. Toma unos 45 minutos. Cada paso dice qué hacer y **qué debe pasar**:
si no pasa eso, anótalo y no sigas con la demo hasta que esté resuelto.

Los nombres son los del giro `construccion` de `seed_demo.py`. Con otro giro
cambian los nombres, pero los pasos son los mismos.

**Tú eres Ángel Couoh**: fierrero, encargado de la *Cuadrilla Cholul* en la
*Obra Cholul — Casa Muestra*, y el que "no ha llegado". Tu cuadrilla tiene un
solo trabajo abierto: *Armado de castillos fachada*.

Equipo: tu celular con WhatsApp (la app, no WhatsApp Web) y la laptop con el
dashboard. Al final repite lo del dashboard **desde el celular**.

---

## 0. Preparación

- [ ] **Desplegado**: la última versión está en Railway. En los logs del
      arranque debe salir `Migraciones aplicadas`. `GET /health` responde `ok`.
- [ ] **Supabase despierto**: el dashboard carga datos.
- [ ] **Token de WhatsApp permanente**: si el `WHATSAPP_TOKEN` es el temporal
      de la consola de Meta, caduca en 24 h y el bot deja de contestar sin
      avisar. Usa el de un *usuario del sistema* (Business Settings → Usuarios
      del sistema).
- [ ] **Tu número está en la lista de prueba de Meta** (mientras no haya app
      review, el bot solo puede escribir a esos 5 números).
- [ ] **R2 y OpenAI configurados** en Railway (sin R2 no hay fotos; sin OpenAI
      no hay transcripción de audios).
- [ ] **Datos de demo**:
      En **tu máquina** (no con `railway ssh`: dentro del contenedor no están tus
      fotos). `railway run` corre el script aquí con las variables de Railway:
      ```bash
      cd backend
      railway run .venv/bin/python seed_demo.py --giro construccion \
          --empresa "Constructora Pech" --mi-numero "<tu cel>" \
          --fotos ~/demo_fotos/construccion
      ```
      Debe imprimir: Fernando Ku llegó tarde, Manuel Chan checó a 2.4 km,
      Raúl Dzib checó sin ubicación, *hay una foto repetida* y que tú eres
      Ángel Couoh.
- [ ] **Ubicación de tu obra donde estás tú**: Equipo → Personas → en el
      encabezado de *OBRA CHOLUL — CASA MUESTRA*, a la derecha, toca
      *Ubicación fijada · cambiar* y pega la ubicación de donde vas a hacer la
      prueba (ver "Cómo fijar la ubicación" al final). Si no, el sistema te va
      a marcar a varios km de la obra.

## 1. El panel antes de que llegues

Abre **Hoy** en la laptop.

- [ ] *Necesita tu atención* muestra:
  - [ ] **Ángel Couoh no ha llegado** (si ya pasaron las 8:10), con *el bot le
        preguntó a las 8:30 am*, y el botón **Escribirle**.
  - [ ] **Colado de losa nivel 3: venció ayer** (tarea atrasada).
  - [ ] **1 tarea terminada espera tu visto bueno** (*Levantar muros de baño*).
  - [ ] **Manuel Chan checó a 2.4 km de Obra Altabrisa — Torre B**.
  - [ ] **Raúl Dzib mandó una foto que parece repetida** (solo si usaste `--fotos`).
  - [ ] **Fernando Ku llegó tarde N veces esta semana**.
- [ ] Las 4 métricas tienen barras de 14 días (no están vacías).
- [ ] Semáforo: *Obra Altabrisa* en **rojo** (atrasada) y *Obra Cholul* en
      **amarillo** (falta gente).
- [ ] **Escribirle** en Ángel abre WhatsApp con el mensaje ya escrito. En la
      laptop abre WhatsApp Web; en el celular, la app.
- [ ] **Ver ficha** de Manuel Chan: junto a *Llegó 7:18 am* aparece
      **A 2.4 km de Obra Altabrisa**. Nunca hay mapa ni coordenadas, en ninguna
      ficha: el panel solo dice "En obra", "A X km" o "Sin ubicación".
- [ ] Ficha de Raúl Dzib: aparece **Sin ubicación**. Su foto de hoy tiene la
      etiqueta **Repetida**; al abrirla salen **las dos fotos lado a lado** con el
      texto "Tú decides".

## 2. El momento en vivo: llegar

Todo desde tu celular, al número del bot. Ten el panel abierto en la laptop
(se actualiza solo cada 10 s).

- [ ] Manda **presente**. En segundos llega **un solo mensaje**: *✅ ¡Presente!
      Buenos días/tardes, Ángel…*, *Toca Enviar ubicación…*, la explicación de
      que tu ubicación solo se usa para confirmar la llegada, y el botón
      **Enviar ubicación**.
- [ ] En el panel: desaparece *Ángel Couoh no ha llegado*; en tu ficha sale
      *Llegó* (o *Tarde*, si ya pasaron las 8:10) con **Sin ubicación**.

**La primera ubicación del día es la que cuenta**, y solo si llega en los 15
minutos después del presente (`LOCATION_WINDOW_MINUTES`). Así nadie checa desde
su casa y "se corrige" ya en la obra. Por eso cada caso se prueba en un día
limpio: entre una prueba y otra vuelve a correr `seed_demo.py`.

- [ ] **En obra** (el caso de la demo): toca **Enviar ubicación** → *Ubicación
      actual*. Respuesta: *Listo, quedaste registrado en Obra Cholul — Casa
      Muestra*. En el panel: **En Obra Cholul**.
- [ ] **Lejos** (otro día limpio): en lugar de tu ubicación actual, **elige un
      punto a 2 km o más**. Respuesta: *Recibida. Te marca a X km de Obra
      Cholul…*; en el panel **A X km** y el pendiente *Ángel Couoh checó a X km*.
      Probado 2026-11-04: WhatsApp **sí deja** elegir otro punto y Meta solo
      manda latitud y longitud, igual que una ubicación real (ver CLAUDE.md).
- [ ] Después de cualquiera de las dos, manda **otra ubicación**: contesta
      *Ubicación recibida* y el resultado del día **no cambia**.
- [ ] Manda **presente** otra vez: *Ya tenías registro de hoy…*, **sin** botón
      de ubicación.
- [ ] **Sin ubicación**: manda presente, **no** toques el botón y espera más de
      15 minutos. Ya no se ofrece el botón y una ubicación tardía no cuenta: tu
      ficha sigue en **Sin ubicación**.
- [ ] **Registros diarios**: las ubicaciones aparecen como *En Obra Cholul* o
      *A X km…*, nunca con coordenadas.

## 3. Reportar trabajo

- [ ] Manda una **foto** de algo (lo que sea). Como tu cuadrilla tiene un solo
      trabajo abierto: *📸 Foto de avance guardada en Armado de castillos
      fachada*. En **Tareas**, ese trabajo pasa a *En curso* con 1 foto.
- [ ] **Reenvía la misma foto** (desde la galería o reenviando el mensaje). El
      bot contesta igual, **sin** decirte nada de "repetida". En el panel: el
      pendiente *Ángel Couoh mandó una foto que parece repetida* y la etiqueta
      **Repetida** en tu ficha, con las dos fotos lado a lado.
- [ ] Manda **otra foto distinta** del mismo lugar: **no** debe salir como
      repetida.
- [ ] Manda un **audio**: "Jefe, ya estamos armando, falta alambre". Respuesta:
      *🎙️ Audio recibido*. En tu ficha (lo que hizo hoy) y en Registros sale
      la **transcripción**.
- [ ] Manda un **texto** cualquiera: *👍 Recibido, Ángel. Ya quedó anotado.*

## 4. Trabajos con foto y visto bueno

En **Tareas** (laptop):

- [ ] **+ Nuevo trabajo** para *Cuadrilla Cholul* ("Prueba de recorrido",
      vence hoy). A tu WhatsApp llega *📋 Nuevo trabajo para Cuadrilla Cholul…*
      con botones **Enterado / Ya terminé / Tengo un problema**.
- [ ] Aprieta **Enterado**: el bot confirma **con los botones Ya terminé / Tengo
      un problema** y el trabajo muestra que lo viste. En Registros, el
      "Enterado" dice de qué trabajo es.
- [ ] Manda una foto: ahora tu cuadrilla tiene **2 trabajos abiertos**, así
      que el bot pregunta **¿De cuál trabajo es?** con botones. Elige uno:
      *👍 Listo, la foto quedó en …*.
- [ ] En *Armado de castillos fachada* toca **Que el bot pregunte**: llegan
      botones. Aprieta **Ya terminé**: el bot pide foto. Mándala. El trabajo
      pasa a **Por revisar** con la foto, y sale en *Necesita tu atención*.
- [ ] **Aprobar**: te llega *✅ Tu jefe aprobó …*. El trabajo pasa a
      *Terminadas*.
- [ ] **Escribe** "ya terminé" (sin botón). Con 2 trabajos abiertos el bot
      pregunta **¿Cuál terminaron?** con botones; con uno solo lo manda directo a
      revisión y pide foto. "Todavía no terminamos" **no** cuenta.
- [ ] En "Prueba de recorrido" aprieta **Tengo un problema**: el bot pregunta
      **¿Qué pasó?**. Contesta con texto o audio ("no llegó el cemento"). El
      trabajo pasa a **Atrasadas** con *Problema: "no llegó el cemento"* en la
      tarjeta, y en Hoy: *Prueba de recorrido: Cuadrilla Cholul reportó un
      problema*.
- [ ] **Regresar** un trabajo por revisar con una nota: te llega la nota por
      WhatsApp.

## 5. Equipo y altas

- [ ] **+ Trabajador** con el teléfono escrito como "999 123 4567": queda
      guardado como +521… En la lista aparece en su obra.
- [ ] Dar de alta **el mismo número otra vez**: el mensaje dice *Ese número ya
      está registrado* (no "Error 500").
- [ ] **Buscar** por nombre y por 3+ dígitos del teléfono; **filtros** *Faltan
      hoy*, *Tarde hoy* y *Con atrasos* cuentan lo correcto.
- [ ] Pestaña **Cuadrillas**: cambiar encargado y mover a alguien de cuadrilla.
- [ ] **Escribirle por WhatsApp** en la ficha de alguien: abre WhatsApp con su
      número y "Hola <nombre>, " ya escrito.
- [ ] Desde **otro celular no registrado** (también en la lista de prueba de
      Meta) manda "hola": contesta *Este número es de Capataz… pídele a tu jefe
      que te registre*. Un segundo "hola" el mismo día ya **no** contesta.

## 6. Envíos programados (opcional, para verlos hoy)

Corren a su hora (8:30 llegada, 15:00 avance, 18:00 resumen) y **una sola vez
al día**. Para probarlos ahora:

1. En Railway cambia, por ejemplo, `JOB_PROGRESS_TIME` a 3 minutos en el
   futuro (Railway reinicia la app).
2. Si ese envío ya corrió hoy, bórralo para que vuelva a correr (SQL Editor de
   Supabase):
   ```sql
   delete from scheduled_runs where kind = 'job_progress' and run_date = current_date;
   ```
3. Espera la hora: te llegan los botones de avance de tus trabajos que vencen
   hoy sin foto. Regresa la variable a su hora normal.

- [ ] Recordatorio de llegada (`CHECKIN_REMINDER_TIME`): solo a quien **no** ha
      checado hoy y escribió en 24 h (o con plantilla aprobada).
- [ ] Resumen diario (`DAILY_SUMMARY_TIME`): necesita la plantilla aprobada y
      tu teléfono de dueño (`seed_user.py --phone`).

## 7. El dashboard en el celular

Repite rápido desde el navegador del celular:

- [ ] La barra de abajo navega entre Panel, Registros, Equipo y Tareas.
- [ ] La ficha del trabajador abre y cierra bien; se puede hacer scroll.
- [ ] La foto repetida muestra las dos fotos **una arriba de otra**.
- [ ] Los modales (nuevo trabajo, ubicación de la obra) caben en la pantalla
      y el teclado no tapa el botón de guardar.
- [ ] *Escribirle* abre la app de WhatsApp.
- [ ] Cerrar sesión y volver a entrar.

## 8. Dejarlo listo para la demo

- [ ] Vuelve a correr `seed_demo.py` (tus pruebas te dejaron como "presente").
- [ ] Fija la ubicación de *Obra Cholul* en **el lugar de la cita**, para que en
      vivo salgas *En Obra Cholul*. (O déjala lejos a propósito si quieres
      enseñar el aviso de "checó a X km".)
- [ ] **No le escribas al bot** hasta la demo.
- [ ] Abre el dashboard una vez la mañana de la demo (Supabase y Railway
      despiertos).

---

## Cómo fijar la ubicación de una obra

**Equipo → Personas**. Cada obra tiene un encabezado gris (por ejemplo *OBRA
CHOLUL — CASA MUESTRA · 3 personas · 2 llegaron*). A la derecha:

- **📍 Fijar ubicación de la obra** (en naranja) si no tiene, o
- **Ubicación fijada · cambiar** si ya tiene.

Tócalo y pega cualquiera de estas dos cosas:

- **Link de Google Maps.** En el celular: abre Google Maps, busca la obra o
  **deja presionado** el punto exacto hasta que salga el pin, toca
  **Compartir** y **Copiar**. Sirven los links cortos (`maps.app.goo.gl/…`).
- **Coordenadas.** Deja presionado el punto: arriba salen los números
  (`21.0449, -89.5555`). Cópialos tal cual.

El **radio** viene en 300 m. Súbelo si la obra es grande (un fraccionamiento)
o si ahí el GPS falla seguido. **Guardar**. *Ver en el mapa* abre la ubicación
guardada para confirmarla.

También puedes ponerla al crear la obra con **+ Sucursal**.

Ojo: el encabezado de una obra solo aparece si tiene al menos un trabajador.
Para una obra vacía, ponle la ubicación al crearla.

## Si algo falla en el recorrido

| Síntoma | Lo más probable |
|---|---|
| El bot no contesta nada | Token de WhatsApp caducado, tu número no está en la lista de prueba, o el webhook no está suscrito. Revisa los logs de Railway. |
| Contesta texto pero no sale el botón de ubicación | WhatsApp viejo en el celular. Actualízalo; WhatsApp Web no muestra el botón. |
| Fotos sin imagen en el panel | R2 sin configurar en Railway. |
| Audio sin transcripción | Falta `OPENAI_API_KEY` o no tiene saldo. |
| Siempre sale "Ubicación sin comparar" | Ninguna obra tiene ubicación fijada. |
| Sales a varios km estando en la obra | La ubicación de la obra está mal: ábrela con *Ver en el mapa*. |
| "No encontré la ubicación en ese link" | Pega las coordenadas en lugar del link. |
| El panel no cambia | Botón **Actualizar**; si sigue igual, revisa que el bot sí contestó. |
