import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError

from app.dependencies.auth import get_current_user
from app.models.user import User
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


@router.post(
    '', response_model=IssueReportResponse, status_code=status.HTTP_202_ACCEPTED
)
async def create_issue_report(
    category: IssueReportCategory = Form(...),
    description: str = Form(...),
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

        prepared_attachments.append(
            {
                'filename': upload.filename or 'attachment',
                'content_type': upload.content_type or 'application/octet-stream',
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
