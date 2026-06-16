from datetime import date

import pytest

from app.repositories.project import ProjectValidationError, validate_project_dates


def test_accepts_missing_project_dates() -> None:
    validate_project_dates(start_date=None, end_date=None)


def test_accepts_only_start_date() -> None:
    validate_project_dates(start_date=date(2026, 6, 16), end_date=None)


def test_accepts_only_end_date() -> None:
    validate_project_dates(start_date=None, end_date=date(2026, 6, 16))


def test_accepts_end_date_equal_to_start_date() -> None:
    project_date = date(2026, 6, 16)

    validate_project_dates(start_date=project_date, end_date=project_date)


def test_accepts_end_date_after_start_date() -> None:
    validate_project_dates(
        start_date=date(2026, 6, 16),
        end_date=date(2026, 6, 30),
    )


def test_rejects_end_date_before_start_date() -> None:
    with pytest.raises(
        ProjectValidationError,
        match='end_date must be greater than or equal to start_date',
    ):
        validate_project_dates(
            start_date=date(2026, 6, 16),
            end_date=date(2026, 6, 15),
        )
