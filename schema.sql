-- Capataz — Schema Postgres
-- Diseñado para Supabase. Multi-tenant listo por company_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

-- por_revisar: el trabajador dijo "terminé"; espera foto y visto bueno del dueño.
CREATE TYPE job_status AS ENUM ('pendiente', 'en_progreso', 'por_revisar', 'completado', 'atrasado');
CREATE TYPE event_type AS ENUM ('checkin', 'photo', 'audio', 'location', 'text', 'unknown');
CREATE TYPE attendance_status AS ENUM ('presente', 'ausente', 'tarde');

-- ─── COMPANIES ────────────────────────────────────────────────────────────────

CREATE TABLE companies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── BRANCHES (sucursal / cuadrilla) ─────────────────────────────────────────

CREATE TABLE branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    latitude    DOUBLE PRECISION,      -- ubicación de la obra (geocerca del check-in)
    longitude   DOUBLE PRECISION,
    geofence_m  INTEGER,               -- radio propio; NULL = GEOFENCE_METERS
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── WORKERS ──────────────────────────────────────────────────────────────────

-- ─── crews: cuadrillas (equipos con encargado). Una obra puede tener varias ──

CREATE TABLE crews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,  -- obra habitual
    name            TEXT NOT NULL,
    lead_worker_id  UUID,             -- FK a workers, se agrega abajo
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id    UUID REFERENCES branches(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    phone_number TEXT NOT NULL,           -- E.164, e.g. +5215512345678
    title        TEXT,                    -- puesto (Albañil, Electricista…)
    crew_id      UUID REFERENCES crews(id) ON DELETE SET NULL,
    location_notice_at TIMESTAMPTZ,       -- cuándo se le explicó el uso de su ubicación
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, phone_number)
);

-- ─── JOBS ─────────────────────────────────────────────────────────────────────

CREATE TABLE jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id    UUID REFERENCES branches(id) ON DELETE SET NULL,
    worker_id    UUID REFERENCES workers(id) ON DELETE SET NULL,  -- opcional
    crew_id      UUID REFERENCES crews(id) ON DELETE SET NULL,    -- lo normal
    title        TEXT NOT NULL,
    description  TEXT,
    status       job_status NOT NULL DEFAULT 'pendiente',
    due_date     DATE,
    completed_at TIMESTAMPTZ,          -- cuándo dijo "terminé"
    approved_at  TIMESTAMPTZ,          -- cuándo el dueño aprobó
    review_note  TEXT,                 -- por qué se regresó
    acknowledged_at TIMESTAMPTZ,       -- cuándo el encargado apretó "Enterado"
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── EVENTS (fuente de verdad) ────────────────────────────────────────────────

CREATE TABLE events (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    worker_id            UUID REFERENCES workers(id) ON DELETE SET NULL,
    job_id               UUID REFERENCES jobs(id) ON DELETE SET NULL,
    whatsapp_message_id  TEXT NOT NULL UNIQUE,   -- idempotencia: Meta puede reenviar
    event_type           event_type NOT NULL DEFAULT 'unknown',
    raw_payload          JSONB NOT NULL,
    text_content         TEXT,
    media_url            TEXT,                   -- URL en R2
    transcription        TEXT,                   -- audio → texto (Whisper)
    latitude             DOUBLE PRECISION,
    longitude            DOUBLE PRECISION,       -- se borran a los LOCATION_RETENTION_DAYS
    photo_hash           TEXT,                   -- dHash de la foto (fotos repetidas)
    duplicate_of_id      UUID REFERENCES events(id) ON DELETE SET NULL,
    received_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_worker_id_idx    ON events(worker_id);
CREATE INDEX events_company_id_idx   ON events(company_id);
CREATE INDEX events_received_at_idx  ON events(received_at DESC);
CREATE INDEX events_event_type_idx   ON events(event_type);
CREATE INDEX idx_events_job          ON events(job_id);

-- ─── ATTENDANCE DAILY (derivado de events, para queries rápidas) ──────────────

CREATE TABLE attendance_daily (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    worker_id    UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    work_date    DATE NOT NULL,
    status       attendance_status NOT NULL DEFAULT 'presente',
    checkin_at   TIMESTAMPTZ,
    event_id     UUID REFERENCES events(id) ON DELETE SET NULL,
    -- Verificación de presencia: solo el resultado, sin coordenadas.
    location_status     TEXT,         -- en_sitio · lejos · sin_referencia · NULL (no la mandó)
    location_distance_m INTEGER,
    location_branch_id  UUID REFERENCES branches(id) ON DELETE SET NULL,
    location_at         TIMESTAMPTZ,
    UNIQUE (worker_id, work_date)
);

CREATE INDEX attendance_company_date_idx ON attendance_daily(company_id, work_date DESC);

-- ─── USERS (dueño / admin) ────────────────────────────────────────────────────

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    password_hash TEXT,
    phone_number  TEXT,               -- WhatsApp del dueño (resumen diario)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── notifications: mensajes que el bot manda por iniciativa propia ──────────

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,        -- checkin_reminder | job_progress | daily_summary
    worker_id   UUID REFERENCES workers(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
    ok          BOOLEAN NOT NULL DEFAULT TRUE,
    error       TEXT,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_sent ON notifications (company_id, sent_at DESC);

-- Candado: cada envío programado corre una vez por día aunque haya reinicios.
CREATE TABLE scheduled_runs (
    kind      TEXT NOT NULL,
    run_date  DATE NOT NULL,
    ran_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, run_date)
);

ALTER TABLE crews ADD CONSTRAINT crews_lead_fk
    FOREIGN KEY (lead_worker_id) REFERENCES workers(id) ON DELETE SET NULL;
CREATE INDEX idx_jobs_crew ON jobs (crew_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
