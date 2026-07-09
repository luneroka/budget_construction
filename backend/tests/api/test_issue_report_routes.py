import json
from datetime import datetime, UTC
from typing import Any, cast

from httpx import AsyncClient
import pytest


PASSWORD = 'Password123!'


async def register_user(client: AsyncClient, *, email: str) -> dict[str, object]:
    response = await client.post(
        '/auth/register',
        json={
            'name': 'Issue Reporter',
            'email': email,
            'password': PASSWORD,
        },
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


async def login_user(client: AsyncClient, *, email: str) -> str:
    response = await client.post(
        '/auth/login',
        data={
            'username': email,
            'password': PASSWORD,
        },
    )
    assert response.status_code == 200
    payload = cast(dict[str, object], response.json())
    access_token = payload.get('access_token')
    assert isinstance(access_token, str)
    return access_token


async def test_create_issue_report_sends_email_with_metadata_and_attachment(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    email = 'issue-report-user@example.com'
    await register_user(client, email=email)
    access_token = await login_user(client, email=email)
    sent_payloads: list[dict[str, Any]] = []

    async def fake_send_issue_report_email(**kwargs: Any) -> bool:
        sent_payloads.append(kwargs)
        return True

    monkeypatch.setattr(
        'app.routers.issue_reports.mailer_service.send_issue_report_email',
        fake_send_issue_report_email,
    )

    metadata = {
        'route': '/dashboard',
        'project_name': 'Maison Test',
        'user_agent': 'pytest-browser',
        'timestamp': datetime.now(UTC).isoformat(),
    }
    response = await client.post(
        '/issue-reports',
        headers={'Authorization': f'Bearer {access_token}'},
        data={
            'category': 'bug',
            'description': 'The dashboard card is empty.',
            'metadata': json.dumps(metadata),
        },
        files={
            'attachments': (
                'capture.png',
                b'\x89PNG\r\n\x1a\ncapture',
                'image/png',
            )
        },
    )

    assert response.status_code == 202
    assert sent_payloads
    payload = sent_payloads[0]
    assert payload['category'] == 'bug'
    assert payload['description'] == 'The dashboard card is empty.'
    assert payload['metadata'].route == '/dashboard'
    assert payload['metadata'].project_name == 'Maison Test'
    assert payload['metadata'].user_agent == 'pytest-browser'
    assert payload['user'].email == email
    assert payload['attachments'] == [
        {
            'filename': 'capture.png',
            'content_type': 'image/png',
            'content': b'\x89PNG\r\n\x1a\ncapture',
        }
    ]


async def test_create_issue_report_requires_authentication(
    client: AsyncClient,
) -> None:
    response = await client.post(
        '/issue-reports',
        data={
            'category': 'bug',
            'description': 'Missing auth',
            'metadata': json.dumps(
                {
                    'route': '/dashboard',
                    'project_name': None,
                    'user_agent': 'pytest-browser',
                    'timestamp': datetime.now(UTC).isoformat(),
                }
            ),
        },
    )

    assert response.status_code == 401


async def test_issue_report_email_uses_resend_from_when_support_email_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.models.user import User
    from app.schemas.issue_report import IssueReportCategory, IssueReportMetadata
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

    sent = await mailer.send_issue_report_email(
        category=IssueReportCategory.bug,
        description='Issue details',
        metadata=IssueReportMetadata(
            route='/dashboard',
            project_name=None,
            user_agent='pytest-browser',
            timestamp=datetime.now(UTC),
        ),
        user=User(
            id=1,
            name='Reporter',
            email='reporter@example.com',
            hashed_password='hashed',
        ),
        attachments=[],
    )

    assert sent is True
    assert captured_payloads[0]['to'] == ['support@example.com']
