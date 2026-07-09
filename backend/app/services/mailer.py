import base64
import logging
from html import escape
from typing import Any, TypedDict

import httpx

from app.core.settings import settings
from app.models.user import User
from app.schemas.issue_report import IssueReportCategory, IssueReportMetadata

RESEND_API_URL = 'https://api.resend.com/emails'
logger = logging.getLogger(__name__)


class EmailAttachment(TypedDict):
    filename: str
    content_type: str
    content: bytes


def _resend_config_available() -> bool:
    if not settings.resend_api_key or not settings.resend_from:
        return False
    return True


def _resend_headers() -> dict[str, str]:
    return {
        'Authorization': f'Bearer {settings.resend_api_key}',
        'Content-Type': 'application/json',
    }


async def send_reset_password_email(
    to_email: str, reset_link: str, subject: str = 'Réinitialisation du mot de passe'
) -> bool:
    from_email = settings.resend_from

    if not _resend_config_available():
        logger.error(
            'Cannot send password reset email: Resend configuration is missing'
        )
        return False

    headers = _resend_headers()

    safe_reset_link = escape(reset_link, quote=True)

    html = f"""\
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escape(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f7f9fb; color:#1b2433; font-family:'Source Sans 3', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f9fb; margin:0; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#ffffff; border:1px solid #dde3ea; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background:#1f2f52; padding:24px 28px;">
                <p style="margin:0 0 6px; color:#d4a73d; font-size:13px; font-weight:700; letter-spacing:0.02em;">
                  Budget Construction
                </p>
                <h1 style="margin:0; color:#f8fafc; font-family:Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.2; font-weight:700;">
                  Réinitialisation du mot de passe
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px; font-size:16px; line-height:1.6;">
                  Bonjour,
                </p>
                <p style="margin:0 0 22px; font-size:16px; line-height:1.6;">
                  Nous avons reçu une demande de réinitialisation du mot de passe de votre compte. Utilisez le bouton ci-dessous pour définir un nouveau mot de passe.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:6px; background:#d4a73d;">
                      <a href="{safe_reset_link}" style="display:inline-block; padding:12px 18px; color:#2a2418; font-size:15px; font-weight:700; text-decoration:none;">
                        Réinitialiser mon mot de passe
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 14px; font-size:14px; line-height:1.6; color:#64748b;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
                </p>
                <p style="margin:0 0 22px; font-size:13px; line-height:1.6; word-break:break-all;">
                  <a href="{safe_reset_link}" style="color:#2f57a8; text-decoration:underline;">{safe_reset_link}</a>
                </p>
                <p style="margin:0; font-size:14px; line-height:1.6; color:#64748b;">
                  Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail. Votre mot de passe actuel restera inchangé.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f1f5f9; border-top:1px solid #dde3ea; padding:18px 28px;">
                <p style="margin:0; font-size:12px; line-height:1.5; color:#64748b;">
                  Cet e-mail a été envoyé automatiquement par Budget Construction.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    text = f"""\
Bonjour,

Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Budget Construction.

Pour définir un nouveau mot de passe, ouvrez ce lien :
{reset_link}

Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail. Votre mot de passe actuel restera inchangé.
"""

    payload: dict[str, Any] = {
        'from': from_email,
        'to': [to_email],
        'subject': subject,
        'html': html,
        'text': text,
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


async def send_issue_report_email(
    *,
    category: IssueReportCategory,
    description: str,
    metadata: IssueReportMetadata,
    user: User,
    attachments: list[EmailAttachment],
) -> bool:
    if not _resend_config_available():
        logger.error('Cannot send issue report email: Resend configuration is missing')
        return False

    recipient_email = settings.support_email or settings.resend_from
    if settings.support_email is None:
        logger.info(
            'SUPPORT_EMAIL is not configured; using RESEND_FROM for issue reports'
        )

    category_label = str(category).replace('_', ' ').title()
    attachment_names = [attachment['filename'] for attachment in attachments]
    metadata_rows: list[tuple[str, str]] = [
        ('Page', metadata.route),
        ('Project', metadata.project_name or 'None'),
        ('User', f'{user.name} <{user.email}>'),
        ('User ID', str(user.id)),
        ('Browser', metadata.user_agent),
        ('Timestamp', metadata.timestamp.isoformat()),
        (
            'Attachments',
            ', '.join(attachment_names) if attachment_names else 'None',
        ),
    ]

    html_metadata = ''.join(
        '<tr>'
        f'<th align="left" style="padding:6px 10px; border-bottom:1px solid #dde3ea;">{escape(label)}</th>'
        f'<td style="padding:6px 10px; border-bottom:1px solid #dde3ea;">{escape(value)}</td>'
        '</tr>'
        for label, value in metadata_rows
    )
    text_metadata = '\n'.join(f'{label}: {value}' for label, value in metadata_rows)
    subject = f'Budget Construction issue report: {category_label}'

    html = f"""\
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>{escape(subject)}</title></head>
  <body style="font-family:Arial, sans-serif; color:#1b2433;">
    <h1 style="font-size:20px;">{escape(subject)}</h1>
    <p style="white-space:pre-wrap;">{escape(description)}</p>
    <h2 style="font-size:16px;">Metadata</h2>
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;">{html_metadata}</table>
  </body>
</html>
"""

    text = f"""\
{subject}

{description}

Metadata
{text_metadata}
"""

    payload: dict[str, Any] = {
        'from': settings.resend_from,
        'to': [recipient_email],
        'reply_to': user.email,
        'subject': subject,
        'html': html,
        'text': text,
    }

    if attachments:
        payload['attachments'] = [
            {
                'filename': attachment['filename'],
                'content': base64.b64encode(attachment['content']).decode('ascii'),
                'content_type': attachment['content_type'],
            }
            for attachment in attachments
        ]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                RESEND_API_URL, json=payload, headers=_resend_headers(), timeout=10.0
            )

            if resp.status_code not in (200, 202):
                logger.error(
                    'Resend rejected issue report email with status code %s',
                    resp.status_code,
                )
                return False

            return True
    except Exception:
        logger.exception('Failed to send issue report email through Resend')
        return False
