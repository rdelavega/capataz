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

## Estructura de carpetas propuesta

```
capataz/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # settings (pydantic-settings)
│   │   ├── db.py                 # engine, session
│   │   ├── models/                # SQLAlchemy models
│   │   ├── schemas/                # Pydantic schemas
│   │   ├── routers/
│   │   │   ├── webhook.py        # POST/GET /webhook/whatsapp
│   │   │   └── dashboard.py      # endpoints REST para el frontend
│   │   ├── services/
│   │   │   ├── whatsapp.py       # cliente Graph API (enviar mensajes, descargar media)
│   │   │   ├── parser.py         # clasifica eventos entrantes
│   │   │   ├── storage.py        # subida a R2
│   │   │   └── transcription.py  # cliente Whisper
│   │   └── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/                  # cliente fetch hacia backend
│   ├── package.json
│   └── .env.example
├── schema.sql
└── CLAUDE.md
```

## Próximo paso inmediato

1. Crear `backend/` con FastAPI + SQLAlchemy models a partir de `schema.sql`.
2. Implementar `GET /webhook/whatsapp` (verificación de Meta) y
   `POST /webhook/whatsapp` (recepción de mensajes → insert en `events`).
3. Implementar `parser.py` con lógica mínima: detectar tipo de mensaje y
   asociar `worker_id` por `phone_number`.
4. Seed script: insertar 1 company, 1-2 branches, 3-5 workers de prueba.
5. Endpoint `GET /dashboard/overview` que regrese datos para el tablero.
6. Frontend mínimo: tabla de workers + semáforo por branch.
