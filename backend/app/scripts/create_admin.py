"""Create or promote an administrator account.

There is no public registration endpoint, so the very first administrator
has to be created on the server. Run inside the backend container:

    uv run python -m app.scripts.create_admin --email admin@example.com --name "Admin"

If the email already exists, the account is promoted to admin (and
re-activated) instead of being created. A new account gets the password
typed at the prompt, or a random unusable one with --no-password (the user
then goes through "forgot password" to set one).
"""

import argparse
import asyncio
import getpass
import secrets
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 72


def _prompt_password() -> str:
    while True:
        password = getpass.getpass('Password (input hidden): ')
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f'Password must be at least {MIN_PASSWORD_LENGTH} characters.')
            continue
        if len(password.encode()) > MAX_PASSWORD_LENGTH:
            print(f'Password must be at most {MAX_PASSWORD_LENGTH} bytes.')
            continue
        if password != getpass.getpass('Confirm password: '):
            print('Passwords do not match.')
            continue
        return password


async def create_or_promote_admin(*, email: str, name: str, password: str | None) -> str:
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(User).where(User.email == email))

        if existing is not None:
            existing.is_admin = True
            existing.is_active = True
            existing.deleted_at = None
            await session.commit()
            return f'Promoted existing user #{existing.id} <{email}> to admin.'

        user = User(
            name=name,
            email=email,
            hashed_password=hash_password(password or secrets.token_urlsafe(32)),
            is_admin=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return f'Created admin user #{user.id} <{email}>.'


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument(
        '--no-password',
        action='store_true',
        help='Create with a random unusable password (set it via "forgot password").',
    )
    args = parser.parse_args(argv)

    password = None if args.no_password else _prompt_password()
    message = asyncio.run(
        create_or_promote_admin(email=args.email, name=args.name, password=password)
    )
    print(message)
    return 0


if __name__ == '__main__':
    sys.exit(main())
