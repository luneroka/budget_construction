from __future__ import annotations

from urllib.parse import quote
from typing import TYPE_CHECKING, BinaryIO

import boto3

from app.core.settings import settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


def _required_setting(name: str, value: str | None) -> str:
    if not value:
        raise RuntimeError(f'Missing required R2 setting: {name}')

    return value.strip()


def get_r2_client() -> S3Client:
    return boto3.client(  # pyright: ignore[reportUnknownMemberType]
        's3',
        endpoint_url=_required_setting('R2_ENDPOINT_URL', settings.r2_endpoint_url),
        aws_access_key_id=_required_setting(
            'R2_ACCESS_KEY_ID', settings.r2_access_key_id
        ),
        aws_secret_access_key=_required_setting(
            'R2_SECRET_ACCESS_KEY', settings.r2_secret_access_key
        ),
        region_name='auto',
    )


def upload_file_to_r2(
    file: BinaryIO,
    object_key: str,
    content_type: str,
) -> str:
    client = get_r2_client()

    client.upload_fileobj(
        Fileobj=file,
        Bucket=_required_setting('R2_BUCKET_NAME', settings.r2_bucket_name),
        Key=object_key,
        ExtraArgs={'ContentType': content_type},
    )

    return object_key


def generate_download_url(
    object_key: str,
    filename: str | None = None,
    expires_in: int = 300,
) -> str:
    client = get_r2_client()

    params = {
        'Bucket': _required_setting('R2_BUCKET_NAME', settings.r2_bucket_name),
        'Key': object_key,
    }
    if filename:
        safe_filename = filename.replace('"', '').replace('\r', '').replace('\n', '')
        params['ResponseContentDisposition'] = (
            f'attachment; filename="{safe_filename}"; '
            f"filename*=UTF-8''{quote(filename, safe='')}"
        )

    return client.generate_presigned_url(
        ClientMethod='get_object',
        Params=params,
        ExpiresIn=expires_in,
    )


def delete_file_from_r2(object_key: str) -> None:
    client = get_r2_client()

    client.delete_object(
        Bucket=_required_setting('R2_BUCKET_NAME', settings.r2_bucket_name),
        Key=object_key,
    )
