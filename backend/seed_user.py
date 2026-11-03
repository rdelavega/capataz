#!/usr/bin/env python3
"""
Crea (o actualiza) el usuario dueño del dashboard.

Con --phone, el dueño recibe el resumen diario por WhatsApp (requiere la
plantilla WA_TEMPLATE_DAILY_SUMMARY). La columna phone_number la crea la app al
arrancar; despliega antes de correr esto con --phone.
"""
import argparse
import asyncio
import os
import uuid

from dotenv import load_dotenv
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.phone import normalize_phone

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def run(email: str, password: str, name: str, company_id: str, phone: str | None) -> None:
    raw_url = os.environ["DATABASE_URL"]
    for prefix in ("postgresql://", "postgres://"):
        if raw_url.startswith(prefix):
            db_url = "postgresql+asyncpg://" + raw_url[len(prefix):]
            break
    else:
        db_url = raw_url

    engine = create_async_engine(db_url)
    password_hash = pwd_context.hash(password)

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO users (id, company_id, email, name, password_hash, phone_number)
                VALUES (:id, :company_id, :email, :name, :password_hash, :phone)
                ON CONFLICT (email) DO UPDATE
                  SET name = EXCLUDED.name,
                      password_hash = EXCLUDED.password_hash,
                      phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number)
            """),
            {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "email": email,
                "name": name,
                "password_hash": password_hash,
                "phone": normalize_phone(phone) if phone else None,
            },
        )
    await engine.dispose()
    print(f"✅ Usuario '{name}' <{email}> listo.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email",    required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name",     required=True)
    parser.add_argument("--phone",    help="WhatsApp del dueño para el resumen diario (ej. 999 123 4567)")
    args = parser.parse_args()

    company_id = os.environ.get("COMPANY_ID", "")
    if not company_id:
        print("❌ Falta COMPANY_ID en .env")
        raise SystemExit(1)

    asyncio.run(run(args.email, args.password, args.name, company_id, args.phone))
