import logging

from fastapi import UploadFile

from app.services.storage import delete_file_from_r2

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
MIME_EXTENSIONS = {
    'application/pdf': {'pdf'},
    'image/jpeg': {'jpg', 'jpeg'},
    'image/png': {'png'},
    'image/heic': {'heic'},
}
SIGNATURE_READ_SIZE = 32

logger = logging.getLogger(__name__)


class DocumentUploadValidationError(ValueError):
    pass


def detect_mime_type(signature: bytes) -> str | None:
    if signature.startswith(b'%PDF-'):
        return 'application/pdf'
    if signature.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if signature.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'

    # HEIC/HEIF files are ISO BMFF containers with an ftyp box near the start.
    if len(signature) >= 12 and signature[4:8] == b'ftyp':
        brand = signature[8:12]
        compatible_brands = signature[16:32]
        heic_brands = {
            b'heic',
            b'heix',
            b'hevc',
            b'hevx',
            b'heim',
            b'heis',
            b'mif1',
            b'msf1',
        }
        if brand in heic_brands or any(
            heic_brand in compatible_brands for heic_brand in heic_brands
        ):
            return 'image/heic'

    return None


def validate_document_upload(file: UploadFile) -> tuple[str, str, str, int]:
    if not file.filename:
        raise DocumentUploadValidationError('Missing filename')

    original_filename = file.filename

    if '.' not in original_filename:
        raise DocumentUploadValidationError('Missing file extension')

    extension = original_filename.rsplit('.', 1)[-1].lower()
    if extension not in {ext for exts in MIME_EXTENSIONS.values() for ext in exts}:
        raise DocumentUploadValidationError('Unsupported file extension')

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size == 0:
        raise DocumentUploadValidationError('File is empty')
    if file_size > MAX_FILE_SIZE:
        raise DocumentUploadValidationError('File is too large')

    signature = file.file.read(SIGNATURE_READ_SIZE)
    file.file.seek(0)

    detected_mime_type = detect_mime_type(signature)
    if detected_mime_type is None:
        raise DocumentUploadValidationError('Unsupported or invalid file content')

    if extension not in MIME_EXTENSIONS[detected_mime_type]:
        raise DocumentUploadValidationError(
            'File extension does not match file content'
        )

    return original_filename, extension, detected_mime_type, file_size


def cleanup_uploaded_file(object_key: str) -> None:
    try:
        delete_file_from_r2(object_key)
    except Exception:
        logger.exception('Failed to clean up uploaded document from R2')
