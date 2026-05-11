from collections import Counter
import re
from tools import process_row
from subpage_configs import get_config
from ai_suggestions import enhance_errors_with_ai_suggestions


BATCH_AUTO_FIX_THRESHOLD = 5


def get_hiba_pattern(hiba: dict) -> str | None:
    """Azonosítja a hiba típusát a batch auto-fix deduplikációhoz.
    None = nem releváns (EAN-13, névtúlcsordulás stb.)."""
    oszlop = hiba.get("oszlop", "")

    # Ezeket nem auto-javítjuk batch módban — felhasználói döntés kell
    if oszlop in ("EAN-13", "Első_sor", "Második_sor", "Harmadik_sor"):
        return None

    javitott = str(hiba.get("javitott", ""))
    if not javitott:
        return None  # Nincs konkrét javítás → nem auto-javítható

    eredeti = str(hiba.get("eredeti", ""))

    if oszlop == "Kiszerelés":
        # Csak a mértékegység-változást csoportosítjuk (mennyiség mindegy)
        eredeti_unit = re.sub(r'[\d.,\s]+', '', eredeti).strip().lower()
        javitott_unit = re.sub(r'[\d.,\s]+', '', javitott).strip().lower()
        return f"Kiszerelés:{eredeti_unit}→{javitott_unit}"

    if oszlop == "Ár":
        # Az ár melletti felesleges szöveg (pl. "Ft", "forint") csoportosítása
        eredeti_fmt = re.sub(r'[\d.,\s]+', '', eredeti).strip().lower()
        return f"Ár:{eredeti_fmt}"

    return None


def process_and_validate(raw_rows: list[dict], subpage: str = "standard") -> dict:
    """
    Input: nyers Excel sorok
    Output:
    {
        "processed_rows": [...],   ← renderLabels()-nek kész adatok
        "issues": [...],           ← hibák soronként
        "osszes_hiba": N
    }
    Ha a subpage config batch_autofix=True, osszes_manualis_hiba is visszaadásra kerül.
    """
    cfg = get_config(subpage)
    processed_rows = []
    issues = []

    for i, raw_row in enumerate(raw_rows):
        result = process_row(raw_row, i, cfg=cfg)
        processed_rows.append(result["processed"])

        if result["hibak"]:
            issues.append({
                "row_index": i,
                "excel_sor": result["excel_sor"],
                "termek": result["termek"],
                "hibak": result["hibak"],
            })

    # Batch auto-fix: csak ha a subpage config engedélyezi
    # Ha ugyanaz a hiba-minta ≥5 terméknél ismétlődik → auto_javitott
    if cfg["batch_autofix"]:
        pattern_counts = Counter(
            get_hiba_pattern(hiba)
            for issue in issues
            for hiba in issue["hibak"]
            if not hiba.get("auto_javitott", False) and get_hiba_pattern(hiba) is not None
        )
        for issue in issues:
            for hiba in issue["hibak"]:
                if hiba.get("auto_javitott", False):
                    continue
                pattern = get_hiba_pattern(hiba)
                if pattern and pattern_counts[pattern] >= BATCH_AUTO_FIX_THRESHOLD:
                    hiba["auto_javitott"] = True

    # AI-val intelligens javaslatokat kérünk a hibákra
    if issues:
        print(f"🤖 AI javaslatok kérése {sum(len(i['hibak']) for i in issues)} hibára...")
        issues = enhance_errors_with_ai_suggestions(issues, processed_rows)

    result = {
        "processed_rows": processed_rows,
        "issues": issues,
        "osszes_hiba": sum(len(i["hibak"]) for i in issues),
    }

    if cfg["batch_autofix"]:
        result["osszes_manualis_hiba"] = sum(
            len([h for h in i["hibak"] if not h.get("auto_javitott", False)])
            for i in issues
        )

    return result
