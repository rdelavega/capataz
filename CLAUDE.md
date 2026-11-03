# Capataz — Contexto del Proyecto

## ¿Qué es Capataz?

Capataz es un SaaS B2B para PyMEs mexicanas (constructoras, talleres, distribuidoras,
servicios de campo) que resuelve un problema concreto: **el dueño no sabe qué está
pasando con su equipo en campo**.

La filosofía del producto: **el trabajador nunca abre una app**. Sigue usando WhatsApp
exactamente como ya lo hace (manda fotos, audios, "presente"). Un bot escucha esos
mensajes, los estructura, y el dueño ve todo en un dashboard web.

- El **trabajador** vive 100% en WhatsApp (cero onboarding, cero fricción).
- El **dueño** vive en un dashboard web simple (React), tipo semáforo:
  verde = al día, amarillo = en progreso, rojo = atrasado.

## MVP — Alcance actual

Mono-tenant (una sola empresa hardcodeada por ahora, pero el schema ya soporta
multi-tenant vía `company_id`). NO construir features de multi-tenancy/auth
multiempresa todavía — solo dejar el modelo de datos preparado.

### Features del MVP (en orden de prioridad)
1. **Webhook de WhatsApp Cloud API**: recibe mensajes (texto, foto, audio,
   ubicación, "presente") y los guarda crudos en `events`.
2. **Parser de eventos**: identifica al worker por `phone_number`, clasifica el
   tipo de mensaje (`event_type`), extrae media/transcripción/ubicación.
3. **Pase de lista**: si el mensaje es un check-in ("presente", buenos días, foto
   matutina), actualiza `attendance_daily`.
4. **Evidencia de avance**: fotos "antes/después" asociadas a un `job`, que
   actualizan su `status`.
5. **Dashboard del dueño**: una pantalla, tablero por sucursal/cuadrilla con
   semáforo, lista de workers + último evento, vista de evidencias.
6. **Transcripción de audios**: notas de voz → texto (Whisper), guardado en
   `events.transcription`.

### Fuera de alcance por ahora
- Multi-tenant real / registro de nuevas empresas.
- Pagos/facturación.
- Notificaciones proactivas (templates de utilidad de WhatsApp) — diseñar el
  flujo para que el **trabajador siempre escriba primero** y así todo caiga en
  la ventana de servicio gratis de WhatsApp.
- App móvil nativa — todo es WhatsApp + web responsive.

## Stack técnico

| Capa | Tecnología | Notas |
|---|---|---|
| Backend | **FastAPI** (Python) | async, ideal para webhooks |
| ORM / migraciones | **SQLAlchemy + Alembic** | |
| Base de datos | **Postgres** (Supabase) | ver `schema.sql` |
| Storage de media | **Cloudflare R2** | fotos/audios de WhatsApp |
| Transcripción | **Whisper API** (OpenAI o Groq) | audios → texto |
| WhatsApp | **WhatsApp Cloud API** (Meta, directo, sin BSP) | webhook + Graph API |
| Frontend | **React + Vite + Tailwind** | dashboard del dueño |
| Hosting backend | **Railway** o **Fly.io** | necesita endpoint público para webhook |
| Hosting frontend | **Vercel** | |

## Modelo de datos

El schema completo está en `schema.sql` (Postgres). Tablas principales:

- `companies` — 1 fila hoy, preparado para multi-tenant.
- `branches` — sucursal/cuadrilla, unidad de cobro y agrupación del dashboard.
- `workers` — identificados por `phone_number` (E.164), vínculo con WhatsApp.
- `jobs` — tareas asignadas a workers, con `status` enum
  (pendiente/en_progreso/completado/atrasado).
- `events` — **tabla central**, fuente de verdad. Cada mensaje de WhatsApp se
  guarda crudo en `raw_payload` (jsonb) + campos procesados (media_url,
  transcription, lat/lng, text_content). `whatsapp_message_id` es UNIQUE para
  idempotencia (Meta puede reenviar webhooks).
- `attendance_daily` — tabla resumen derivada de `events`, para que el
  dashboard no recalcule asistencia en cada query.
- `users` — login del dueño (futuro, simple).

## Flujo de datos end-to-end

```
WhatsApp (trabajador) 
  → Webhook FastAPI (POST /webhook/whatsapp)
  → Insert crudo en `events` (raw_payload)
  → Parser: identifica worker por phone_number, clasifica event_type
  → Si es media: descarga de Graph API → sube a R2 → guarda media_url
  → Si es audio: transcribe con Whisper → guarda transcription
  → Si es check-in: upsert en `attendance_daily`
  → Si es evidencia de job: actualiza `jobs.status`
  → Dashboard (React) consume API REST: GET /branches, GET /workers,
    GET /jobs, GET /events
```

## Convenciones de código

- Python: type hints obligatorios, Pydantic para schemas de API.
- Nombres de tablas y columnas en `snake_case`, inglés (el schema ya está así).
- Contenido visible al usuario (mensajes del bot, dashboard) en **español
  mexicano**, tono directo y simple (el dueño promedio no es técnico).
- Variables de entorno para todos los secretos (WhatsApp token, DB url, R2
  keys, Whisper API key) — usar `.env` + `pydantic-settings`.
- Idempotencia siempre: cualquier handler de webhook debe poder recibir el
  mismo mensaje dos veces sin duplicar datos (usar `whatsapp_message_id`).

- **Fechas siempre en hora local** (`America/Merida`, setting `TIMEZONE`):
  el servidor y la DB corren en UTC. Usar `local_today()` y
  `local_date(columna)` de `app/timeutil.py`, nunca `date.today()` ni
  `cast(..., Date)`. En el frontend, nada de `toISOString()` para fechas.
- **Teléfonos**: guardar con `normalize_phone()` (`+521XXXXXXXXXX` para
  México) y buscar con `phone_variants()` (`app/phone.py`).
- **El bot siempre contesta** cuando el trabajador escribe (acuse de recibo),
  así sabe que su mensaje llegó. Esas respuestas caen en la ventana de
  servicio gratis.
- Tests en `backend/tests/` con pytest (`pip install -r requirements-dev.txt`,
  `python -m pytest tests`). El parser se prueba con sesión y WhatsApp
  simulados.
- El build del frontend corre `tsc -b`: un import sin usar rompe el deploy de
  Vercel. Correr `npm run build` antes de hacer push.

## Estructura de carpetas

```
capataz/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app
│   │   ├── config.py             # settings (pydantic-settings)
│   │   ├── db.py                 # engine, session
│   │   ├── dependencies.py       # get_current_user (JWT)
│   │   ├── timeutil.py           # fechas en hora local
│   │   ├── phone.py              # normalización de teléfonos MX
│   │   ├── models/               # SQLAlchemy models
│   │   ├── routers/
│   │   │   ├── webhook.py        # POST/GET /webhook/whatsapp
│   │   │   ├── auth.py           # /auth/login, /auth/me
│   │   │   ├── dashboard.py      # /dashboard/overview, /events, /workers
│   │   │   ├── workers.py        # alta/baja de trabajadores y sucursales, recordar
│   │   │   └── jobs.py           # CRUD de tareas, recordar con botones de WA
│   │   └── services/
│   │       ├── whatsapp.py       # cliente Graph API (enviar mensajes, descargar media)
│   │       ├── parser.py         # clasifica eventos entrantes y contesta
│   │       ├── storage.py        # subida a R2
│   │       └── transcription.py  # cliente Whisper
│   ├── tests/
│   ├── seed.py                   # company inicial (crea tablas con create_all)
│   ├── seed_user.py              # usuario del dueño
│   ├── seed_demo.py              # día de demo creíble por giro (BORRA datos)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/           # Sidebar + MobileNav, WorkerFicha, BranchSection
│   │   ├── pages/                # Dashboard, RegistrosDiarios, Equipo, Tareas, Login
│   │   └── api/                  # cliente fetch hacia backend
│   └── package.json
├── schema.sql
└── CLAUDE.md
```

## Estado actual (2026-11-02)

En producción: Railway (backend), Vercel (frontend), Supabase (DB).
Funciona: webhook + parser, pase de lista, respuestas del bot, tareas con
botones de WhatsApp, login del dueño, dashboard con semáforo, registros
diarios con galería, alta de trabajadores y sucursales, navegación móvil.

Demos: `python seed_demo.py --giro {construccion,taller,distribuidora,servicios}
--empresa "..." --mi-numero "..." --fotos DIR`. El trabajador de
`--mi-numero` es el que falta: manda "presente" en vivo durante la demo.

## Próximos pasos

1. **Botón "Recordar"**: falla si el trabajador no escribió en las últimas
   24 h (error 131047 de Meta). Opción elegida: abrir `wa.me` desde el
   celular del dueño en lugar de enviar por la API.
2. Foto o ubicación cuentan como check-in (evidencia de presencia).
3. Ligar fotos a tareas (evidencia de avance, feature #4).
4. Historial: asistencia por mes por trabajador, exportable.
5. Validar firma `X-Hub-Signature-256` en el webhook.
6. Alembic (hoy las tablas se crean con `create_all`).

Infra pendiente: configurar R2 en Railway (sin R2 no hay fotos en la
galería) y evitar que Supabase pause el proyecto por inactividad.
