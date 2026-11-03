"""
Normalización de teléfonos mexicanos. WhatsApp manda los números de México con
el "1" de celular (521XXXXXXXXXX), pero el dueño captura "55 1234 5678",
"+52 55..." o como sea.
"""
import re


def normalize_phone(raw: str) -> str:
    """Devuelve el número en formato E.164 canónico (+521XXXXXXXXXX para México)."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return f"+521{digits}"
    if len(digits) == 12 and digits.startswith("52"):
        return f"+521{digits[2:]}"
    return f"+{digits}"


def phone_variants(raw: str) -> list[str]:
    """Formas equivalentes de un número, para encontrar workers capturados antes de normalizar."""
    canonical = normalize_phone(raw)
    variants = {canonical, raw if raw.startswith("+") else f"+{raw}"}
    if canonical.startswith("+521") and len(canonical) == 14:
        variants.add(f"+52{canonical[4:]}")
    return sorted(variants)
