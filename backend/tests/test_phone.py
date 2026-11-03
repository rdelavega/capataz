import pytest

from app.phone import normalize_phone, phone_variants


@pytest.mark.parametrize("raw", [
    "9991234567", "999 123 4567", "+52 999 123 4567", "529991234567", "5219991234567", "+5219991234567",
])
def test_normalize_mx(raw: str) -> None:
    assert normalize_phone(raw) == "+5219991234567"


def test_variants_match_number_stored_without_1() -> None:
    assert "+529991234567" in phone_variants("5219991234567")
