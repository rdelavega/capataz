import mimetypes

import boto3
from botocore.config import Config

from app.config import settings

_r2_client = None


def _get_client():
    global _r2_client
    if _r2_client is None:
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _r2_client


def upload_to_r2(data: bytes, key: str, content_type: str | None = None) -> str:
    """Sube bytes a R2 y retorna la URL pública."""
    if content_type is None:
        content_type, _ = mimetypes.guess_type(key)
        content_type = content_type or "application/octet-stream"

    client = _get_client()
    client.put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return f"{settings.r2_public_url}/{key}"
