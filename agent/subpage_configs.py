# =============================================================================
# SUBPAGE_CONFIGS.PY - Aloldal-specifikus beállítások
#
# Új aloldal hozzáadása:
#   1. Adj hozzá egy új bejegyzést SUBPAGE_CONFIGS-ba
#   2. A frontend script.js-ben küldd: subpage: "uj_aloldal"
#   3. Ha egyedi logika is kell, bővítsd a tools.py cfg-alapú ágait
# =============================================================================

SUBPAGE_CONFIGS: dict[str, dict] = {

    # ------------------------------------------------------------------
    # STANDARD - alap konfig, LL / EA / Hudak esetén is ezt használja
    # ------------------------------------------------------------------
    "standard": {
        "max_chars_per_line": 18,
        "max_chars_line3": None,
        "extract_kiszereles": True,
        "extract_szin": False,
        "max_lines": 3,          # 3 soros névtördelés
        "unit_map": "standard",  # ml, l, g, kg, db
        "batch_autofix": False,  # ismétlődő hibák automatikus javítása
        "ft_m2": False,          # Ft/m2 egységár számítás
    },

    # ------------------------------------------------------------------
    # LL
    # ------------------------------------------------------------------
    "ll": {
        "max_chars_per_line": 18,
        "max_chars_line3": None,
        "extract_kiszereles": True,
        "extract_szin": False,
        "max_lines": 3,
        "unit_map": "standard",
        "batch_autofix": False,
        "ft_m2": False,
    },

    # ------------------------------------------------------------------
    # EA
    # ------------------------------------------------------------------
    "ea": {
        "max_chars_per_line": 18,
        "max_chars_line3": None,
        "extract_kiszereles": True,
        "extract_szin": False,
        "max_lines": 3,
        "unit_map": "standard",
        "batch_autofix": False,
        "ft_m2": False,
    },

    # ------------------------------------------------------------------
    # HUDAK
    # ------------------------------------------------------------------
    "hudak": {
        "max_chars_per_line": 18,
        "max_chars_line3": None,
        "extract_kiszereles": True,
        "extract_szin": False,
        "max_lines": 3,
        "unit_map": "standard",
        "batch_autofix": False,
        "ft_m2": False,
    },

    # ------------------------------------------------------------------
    # RITZER - előkészítve, jelenleg standard logika
    # ------------------------------------------------------------------
    "ritzer": {
        "max_chars_per_line": 18,
        "max_chars_line3": None,
        "extract_kiszereles": True,
        "extract_szin": False,
        "max_lines": 3,
        "unit_map": "standard",
        "batch_autofix": False,
        "ft_m2": False,
    },

    # ------------------------------------------------------------------
    # DITALL - egyedi logika: 4 sor, m2 egység, szín, batch auto-fix
    # ------------------------------------------------------------------
    "ditall": {
        "max_chars_per_line": 18,
        "max_chars_line3": 22,
        "extract_kiszereles": True,
        "extract_szin": True,
        "max_lines": 4,
        "unit_map": "ditall",    # ml, l, g, kg, db + m2, m
        "batch_autofix": True,
        "ft_m2": True,
    },

}


def get_config(subpage: str) -> dict:
    """Visszaadja az aloldal konfigját. Ismeretlen subpage esetén 'standard' config."""
    return SUBPAGE_CONFIGS.get(subpage, SUBPAGE_CONFIGS["standard"])
