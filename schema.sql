-- Capataz — Schema Postgres
-- Diseñado para Supabase. Multi-tenant listo por company_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE job_status AS ENUM ('pendiente', 'en_progreso', 'completado', 'atrasado');
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
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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
