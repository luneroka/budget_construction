import json
import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import ValidationError

from app.core.rate_limit import ISSUE_REPORT_LIMIT, limiter
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.document_validation import MIME_EXTENSIONS, detect_mime_type
from app.schemas.issue_report import (
    IssueReportCategory,
    IssueReportMetadata,
    IssueReportResponse,
)
from app.services import mailer as mailer_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/issue-reports', tags=['Issue Reports'])

MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
MAX_ATTACHMENT_COUNT = 5
# Resend caps a whole message at 40 MB; keep a margin for the encoding.
MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024
MAX_DESCRIPTION_LENGTH = 5000
# Same allow-list as document uploads: screenshots and PDFs, checked by
# content rather than by the client-declared type.
ALLOWED_ATTACHMENT_TYPES = frozenset(MIME_EXTENSIONS)


@router.post(
    '', response_model=IssueReportResponse, status_code=status.HTTP_202_ACCEPTED
)
@limiter.limit(ISSUE_REPORT_LIMIT)
async def create_issue_report(
    request: Request,
    response: Response,
    category: IssueReportCategory = Form(...),
    description: str = Form(..., max_length=MAX_DESCRIPTION_LENGTH),
    metadata: str = Form(...),
    attachments: list[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
) -> IssueReportResponse:
    if not description.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Description is required',
        )

    if len(attachments) > MAX_ATTACHMENT_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Too many attachments',
        )

    try:
        parsed_metadata = IssueReportMetadata.model_validate(json.loads(metadata))
    except (json.JSONDecodeError, ValidationError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Invalid metadata',
        ) from error

    prepared_attachments: list[mailer_service.EmailAttachment] = []
    total_size = 0
    for upload in attachments:
        content = await upload.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='File is empty',
            )
        if len(content) > MAX_ATTACHMENT_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='File is too large',
            )
        total_size += len(content)
        if total_size > MAX_TOTAL_ATTACHMENT_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='File is too large',
            )

        detected_type = detect_mime_type(content[:32])
        if detected_type is None or detected_type not in ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Unsupported or invalid file content',
            )

        prepared_attachments.append(
            {
                'filename': upload.filename or 'attachment',
                'content_type': detected_type,
                'content': content,
            }
        )

    sent = await mailer_service.send_issue_report_email(
        category=category,
        description=description.strip(),
        metadata=parsed_metadata,
        user=current_user,
        attachments=prepared_attachments,
    )
    if not sent:
        logger.error('Issue report email failed for user_id=%s', current_user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to send issue report',
        )

    return IssueReportResponse(message='Issue report sent')
