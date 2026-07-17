import logging

from fastapi import APIRouter, HTTPException, status

from app.schemas.contact_request import ContactRequestCreate, ContactRequestResponse
from app.services import mailer as mailer_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/contact-requests', tags=['Contact Requests'])


@router.post(
    '', response_model=ContactRequestResponse, status_code=status.HTTP_202_ACCEPTED
)
async def create_contact_request(
    payload: ContactRequestCreate,
) -> ContactRequestResponse:
    if payload.website.strip():
        logger.info('Contact request honeypot triggered; skipping email')
        return ContactRequestResponse(message='Contact request sent')

    sent = await mailer_service.send_contact_request_email(
        name=payload.name.strip(),
        email=payload.email,
        reason=payload.reason.strip(),
        message=payload.message.strip(),
    )
    if not sent:
        logger.error('Contact request email failed to send')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to send contact request',
        )

    return ContactRequestResponse(message='Contact request sent')
