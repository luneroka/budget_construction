"""Password hashing after the move from passlib to bcrypt directly.

The fixtures below were produced by the stack this replaced -- passlib 1.7.4
over bcrypt 4.0.1, exactly what production ran -- so they pin the one
guarantee that matters: every hash already in the users table keeps verifying.
"""

import pytest

from app.core.security import hash_password, verify_password

PASSLIB_ERA_HASHES = [
    pytest.param(
        'correct horse battery staple',
        '$2b$12$RuXZZZj5wIPQGG5LW20g9O01jZfvsyVwDQl6.JDxtWCD/jCMRdTw6',
        id='ascii',
    ),
    # 100 bytes: passlib hashed only the first 72.
    pytest.param(
        'é' * 50,
        '$2b$12$AmJHNxRtxmsxutSwFMS.AOz4nNxFqIya5pt0bWlXUUSmCX4cb8ZoO',
        id='longer-than-72-bytes',
    ),
    # 81 bytes whose 72nd byte falls inside a two-byte character, so the cut
    # has to happen on bytes, not characters, to match what passlib stored.
    pytest.param(
        'a' + 'é' * 40,
        '$2b$12$rLXbv2F4dcWHSy/7v1dTLOtz3Gky.R9oykUAe.1v0MFyLZSRkNBKW',
        id='cut-inside-a-character',
    ),
]


@pytest.mark.parametrize(('password', 'stored_hash'), PASSLIB_ERA_HASHES)
def test_hashes_stored_under_passlib_still_verify(password, stored_hash):
    assert verify_password(password, stored_hash)
    # Change the first character, not the last: past 72 bytes the last one is
    # ignored by design, so dropping it would still (correctly) verify.
    assert not verify_password('X' + password[1:], stored_hash)


def test_only_the_first_72_bytes_count_as_before():
    stored_hash = '$2b$12$AmJHNxRtxmsxutSwFMS.AOz4nNxFqIya5pt0bWlXUUSmCX4cb8ZoO'

    assert verify_password('é' * 36, stored_hash)


def test_new_hashes_round_trip_in_the_same_format():
    stored_hash = hash_password('a perfectly ordinary password')

    assert stored_hash.startswith('$2b$12$')
    assert verify_password('a perfectly ordinary password', stored_hash)
    assert not verify_password('a perfectly ordinary passworD', stored_hash)


def test_login_longer_than_72_bytes_is_answered_not_raised():
    # The login schema does not cap length, and bcrypt >= 5 raises on such
    # input: this is a failed attempt, never a server error.
    stored_hash = hash_password('a perfectly ordinary password')

    assert not verify_password('z' * 200, stored_hash)


@pytest.mark.parametrize('stored_hash', ['', 'not-a-bcrypt-hash', '$2b$12$short'])
def test_malformed_stored_hash_is_a_mismatch(stored_hash):
    assert not verify_password('anything', stored_hash)


def test_nul_byte_is_hashed_not_treated_as_a_terminator():
    stored_hash = hash_password('secretpassword\x00suffix')

    assert verify_password('secretpassword\x00suffix', stored_hash)
    assert not verify_password('secretpassword', stored_hash)
