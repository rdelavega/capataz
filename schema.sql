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
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── WORKERS ──────────────────────────────────────────────────────────────────

CREATE TABLE workers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id    UUID REFERENCES branches(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    phone_number TEXT NOT NULL,           -- E.164, e.g. +5215512345678
    title        TEXT,                    -- puesto (Albañil, Electricista…)
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, phone_number)
);

-- ─── JOBS ─────────────────────────────────────────────────────────────────────

CREATE TABLE jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id    UUID REFERENCES branches(id) ON DELETE SET NULL,
    worker_id    UUID REFERENCES workers(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    status       job_status NOT NULL DEFAULT 'pendiente',
    due_date     DATE,
    completed_at TIMESTAMPTZ,          -- cuándo dijo "terminé"
    approved_at  TIMESTAMPTZ,          -- cuándo el dueño aprobó
    review_note  TEXT,                 -- por qué se regresó
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
    longitude            DOUBLE PRECISION,
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
