import logging
from typing import Any

import httpx

from app.core.settings import settings

RESEND_API_URL = 'https://api.resend.com/emails'
logger = logging.getLogger(__name__)


async def send_reset_password_email(
    to_email: str, reset_link: str, subject: str = 'Reset your password'
) -> bool:
    api_key = settings.resend_api_key
    from_email = settings.resend_from

    if not api_key or not from_email:
        logger.error('Cannot send password reset email: Resend configuration is missing')
        return False

    headers: dict[str, str] = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }

    html = f"""
    <p>Bonjour,</p>
    <p>Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :</p>
    <p><a href=\"{reset_link}\">Réinitialiser mon mot de passe</a></p>
    <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail en toute sécurité.</p>
    """

    payload: dict[str, Any] = {
        'from': from_email,
        'to': [to_email],
        'subject': subject,
        'html': html,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                RESEND_API_URL, json=payload, headers=headers, timeout=10.0
            )

            if resp.status_code not in (200, 202):
                logger.error(
                    'Resend rejected password reset email with status code %s',
                    resp.status_code,
                )
                return False

            return True
    except Exception:
        logger.exception('Failed to send password reset email through Resend')
        return False
