import logging
from html import escape
from typing import Any

import httpx

from app.core.settings import settings

RESEND_API_URL = 'https://api.resend.com/emails'
logger = logging.getLogger(__name__)


async def send_reset_password_email(
    to_email: str, reset_link: str, subject: str = 'Réinitialisation du mot de passe'
) -> bool:
    api_key = settings.resend_api_key
    from_email = settings.resend_from

    if not api_key or not from_email:
        logger.error(
            'Cannot send password reset email: Resend configuration is missing'
        )
        return False

    headers: dict[str, str] = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }

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
