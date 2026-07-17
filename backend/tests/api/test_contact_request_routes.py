from typing import Any, cast

from httpx import AsyncClient
import pytest


async def test_create_contact_request_sends_email_without_authentication(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_payloads: list[dict[str, Any]] = []

    async def fake_send_contact_request_email(**kwargs: Any) -> bool:
        sent_payloads.append(kwargs)
        return True

    monkeypatch.setattr(
        'app.routers.contact_requests.mailer_service.send_contact_request_email',
        fake_send_contact_request_email,
    )

    response = await client.post(
        '/contact-requests',
        json={
            'name': 'Jean Dupont',
            'email': 'jean.dupont@example.com',
            'reason': "Essayer l'application",
            'message': 'Je souhaite tester Bâti Budget pour mon projet de rénovation.',
        },
    )

    assert response.status_code == 202
    assert sent_payloads
    payload = sent_payloads[0]
    assert payload['name'] == 'Jean Dupont'
    assert payload['email'] == 'jean.dupont@example.com'
    assert payload['reason'] == "Essayer l'application"
    assert payload['message'] == (
        'Je souhaite tester Bâti Budget pour mon projet de rénovation.'
    )


async def test_create_contact_request_rejects_missing_fields(
    client: AsyncClient,
) -> None:
    response = await client.post(
        '/contact-requests',
        json={
            'name': 'Jean Dupont',
            'email': 'not-an-email',
            'reason': '',
            'message': '',
        },
    )

    assert response.status_code == 422


async def test_create_contact_request_honeypot_skips_email(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_payloads: list[dict[str, Any]] = []

    async def fake_send_contact_request_email(**kwargs: Any) -> bool:
        sent_payloads.append(kwargs)
        return True

    monkeypatch.setattr(
        'app.routers.contact_requests.mailer_service.send_contact_request_email',
        fake_send_contact_request_email,
    )

    response = await client.post(
        '/contact-requests',
        json={
            'name': 'Bot',
            'email': 'bot@example.com',
            'reason': 'spam',
            'message': 'spam',
            'website': 'https://spam.example.com',
        },
    )

    assert response.status_code == 202
    assert sent_payloads == []


async def test_create_contact_request_returns_502_when_email_fails(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_send_contact_request_email(**kwargs: Any) -> bool:
        return False

    monkeypatch.setattr(
        'app.routers.contact_requests.mailer_service.send_contact_request_email',
        fake_send_contact_request_email,
    )

    response = await client.post(
        '/contact-requests',
        json={
            'name': 'Jean Dupont',
            'email': 'jean.dupont@example.com',
            'reason': "Essayer l'application",
            'message': 'Message de test.',
        },
    )

    assert response.status_code == 502


async def test_contact_request_email_uses_resend_from_when_support_email_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import mailer

    captured_payloads: list[dict[str, Any]] = []

    class FakeResponse:
        status_code = 202

    class FakeAsyncClient:
        async def __aenter__(self) -> 'FakeAsyncClient':
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, *args: object, **kwargs: Any) -> FakeResponse:
            captured_payloads.append(cast(dict[str, Any], kwargs['json']))
            return FakeResponse()

    monkeypatch.setattr(mailer.settings, 'resend_api_key', 'test-key')
    monkeypatch.setattr(mailer.settings, 'resend_from', 'support@example.com')
    monkeypatch.setattr(mailer.settings, 'support_email', None)
    monkeypatch.setattr(mailer.httpx, 'AsyncClient', FakeAsyncClient)

    sent = await mailer.send_contact_request_email(
        name='Jean Dupont',
        email='jean.dupont@example.com',
        reason="Essayer l'application",
        message='Message de test.',
    )

    assert sent is True
    assert captured_payloads[0]['to'] == ['support@example.com']
    assert captured_payloads[0]['reply_to'] == 'jean.dupont@example.com'
