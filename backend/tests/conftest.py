import os

# Settings mínimos para importar la app sin .env real
os.environ.update({
    "DATABASE_URL": "postgresql://test:test@localhost/test",
    "WHATSAPP_VERIFY_TOKEN": "test",
    "WHATSAPP_TOKEN": "test",
    "WHATSAPP_PHONE_NUMBER_ID": "test",
    "COMPANY_ID": "00000000-0000-0000-0000-000000000001",
})
