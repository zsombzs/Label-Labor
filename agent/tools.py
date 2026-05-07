# =============================================================================
# TOOLS.PY - Validáció és normalizálás
# =============================================================================

import re


# =============================================================================
# NÉVFELDARABOLÁS (max 22 karakter soronként)
# =============================================================================

def split_name(name: str, max_chars: int = 22, max_chars_line3: int | None = None) -> tuple[str, str, str, bool]:
    """Szavanként tördeli a nevet 3 sorra, max 22 karakter/sor.
    max_chars_line3: ha meg van adva, a 3. sorra külön limit vonatkozik.
    Visszatér: (sor1, sor2, sor3, volt_túlcsordulás)"""
    if not name:
        return "", "", "", False

    line3_limit = max_chars_line3 if max_chars_line3 is not None else max_chars
    limits = [max_chars, max_chars, line3_limit]

    words = str(name).strip().split()
    lines = ["", "", ""]
    current_line = 0
    overflow = False

    for word in words:
        if current_line >= 3:
            overflow = True
            continue

        limit = limits[current_line]
        if lines[current_line] == "":
            lines[current_line] = word
            if len(word) > limit:
                overflow = True
        elif len(lines[current_line] + " " + word) <= limit:
            lines[current_line] = lines[current_line] + " " + word
        else:
            current_line += 1
            if current_line >= 3:
                overflow = True
                continue
            limit = limits[current_line]
            lines[current_line] = word
            if len(word) > limit:
                overflow = True

    # 3. sor utólagos ellenőrzése a saját limitjével
    if len(lines[2]) > line3_limit:
        overflow = True

    return lines[0], lines[1], lines[2], overflow


# =============================================================================
# CIKKSZÁM VALIDÁLÁS (max 12 karakter)
# =============================================================================

def validate_cikkszam(cikk: str) -> dict | None:
    """Ellenőrzi hogy a cikkszám kevesebb mint 11 karakter (max 10). None = rendben."""
    cikk = str(cikk).strip()
    if len(cikk) >= 11:
        return {
            "oszlop": "Cikkszám",
            "hiba": f"Túl hosszú: {len(cikk)} karakter (max 10)",
            "eredeti": cikk,
            "javitott": cikk[:10],
            "auto_javitott": True
        }
    return None


# =============================================================================
# KISZERELÉS NORMALIZÁLÁS
# =============================================================================

# Elfogadott mértékegységek és szinonimáik
UNIT_MAP = {
    "ml": ["ml", "mL", "ML", "milliliter", "millilitre", "milliliteres", "milliiter", "mili", "milli"],
    "l":  ["l", "L", "liter", "litre", "litres", "literes", "liters", "lit"],
    "g":  ["g", "G", "gr", "gramm", "gram", "grams"],
    "kg": ["kg", "KG", "Kg", "kG", "kilogramm", "kilogram", "kilograms", "kilo"],
    "db": ["db", "DB", "Db", "dB", "darab", "piece", "pieces", "pcs"],
}

def normalize_kiszerelesek(pack: str) -> tuple[str, dict | None]:
    """
    Normalizálja a kiszerelést.
    Visszaad: (normalizált_érték, hiba_dict vagy None)

    Pl: "500ml" → ("500 ml", None)
        "1kilogramm" → ("1 kg", figyelmeztetés)
        "db" → ("db", None)
        "darab" → ("db", auto-javítva)
        "valami" → ("valami", hiba: ismeretlen)
    """
    if not pack or str(pack).strip() == "":
        return "", None

    pack = str(pack).strip()

    # Különleges eset: "db" és szinonimái (szám nélkül is elfogadott)
    db_synonyms = [s.lower() for s in UNIT_MAP["db"]]
    if pack.lower() in db_synonyms:
        if pack == "db":
            return "db", None
        return "db", {
            "oszlop": "Kiszerelés",
            "hiba": f"Átírva: '{pack}' → 'db'",
            "eredeti": pack,
            "javitott": "db",
            "auto_javitott": True
        }

    # Szám kinyerése (ml, l, g, kg esetén kötelező)
    num_match = re.search(r'^[\d.,]+', pack)
    if not num_match:
        # Próbálkozás: szám bárhol
        num_match = re.search(r'[\d.,]+', pack)

    if not num_match:
        return pack, {
            "oszlop": "Kiszerelés",
            "hiba": f"Nem sikerült számot kinyerni: '{pack}'",
            "eredeti": pack,
            "javitott": ""
        }

    qty_str = num_match.group().replace(",", ".")

    # Érvényes szám ellenőrzés (pl. "2..5" nem érvényes)
    try:
        float(qty_str)
    except ValueError:
        return pack, {
            "oszlop": "Kiszerelés",
            "hiba": f"Érvénytelen mennyiség: '{qty_str}' (helyes formátum pl. '2.5 kg')",
            "eredeti": pack,
            "javitott": ""
        }

    # Egység kinyerése (ami marad a szám után)
    unit_raw = re.sub(r'[\d.,\s]', '', pack).strip()

    # Ha db-szinonima + szám → hiba (db-nél nincs szám, mindig csak "db")
    db_synonyms = [s.lower() for s in UNIT_MAP["db"]]
    if unit_raw.lower() in db_synonyms:
        return "db", {
            "oszlop": "Kiszerelés",
            "hiba": f"db-os termékeknél nincs mennyiség: '{pack}' → helyes formátum: 'db'",
            "eredeti": pack,
            "javitott": "db"
        }

    # Egység keresése a térképben
    normalized_unit = None
    for standard, synonyms in UNIT_MAP.items():
        if unit_raw.lower() in [s.lower() for s in synonyms]:
            normalized_unit = standard
            break

    if normalized_unit is None:
        return pack, {
            "oszlop": "Kiszerelés",
            "hiba": f"Ismeretlen mértékegység: '{unit_raw}' (engedélyezett: ml, l, g, kg, db)",
            "eredeti": pack,
            "javitott": ""
        }

    normalized = f"{qty_str} {normalized_unit}"

    # Ha már normalizált volt (semmi sem változott)
    if normalized == pack:
        return normalized, None

    # Megváltozott → figyelmeztetés
    return normalized, {
        "oszlop": "Kiszerelés",
        "hiba": f"Átírva: '{pack}' → '{normalized}'",
        "eredeti": pack,
        "javitott": normalized,
        "auto_javitott": True  # jelzi hogy már alkalmazva van
    }


# =============================================================================
# ÁR NORMALIZÁLÁS
# =============================================================================

def normalize_ar(price) -> tuple[str, dict | None]:
    """
    Csak a számot tartja meg az árból.
    "1499 Ft" → "1499"
    "1499forint" → "1499"
    """
    if price == "" or price is None:
        return "", None

    price_str = str(price).strip()

    if not price_str:
        return "", None

    # Ha már szám, nem kell csinálni semmit
    try:
        float(price_str.replace(",", "."))
        return price_str, None
    except ValueError:
        pass

    # Szám kinyerése (csak az első számot vesszük)
    num_match = re.search(r'[\d.,]+', price_str)
    if not num_match:
        return price_str, {
            "oszlop": "Ár",
            "hiba": f"Nem szám: '{price_str}'",
            "eredeti": price_str,
            "javitott": ""
        }

    cleaned = num_match.group().replace(",", "")
    return cleaned, {
        "oszlop": "Ár",
        "hiba": f"Átírva: '{price_str}' → '{cleaned}'",
        "eredeti": price_str,
        "javitott": cleaned,
        "auto_javitott": True
    }


# =============================================================================
# EAN-13 VALIDÁLÁS
# =============================================================================

def validate_ean13(ean: str) -> dict | None:
    """EAN-13 ellenőrzés - csak hibajelzés, nincs javítás. None = rendben."""
    ean = str(ean).strip()

    if not ean:
        return None

    if not ean.isdigit():
        return {
            "oszlop": "EAN-13",
            "hiba": f"Érvénytelen formátum: '{ean}' - vonalkód nem generálható",
            "eredeti": ean,
            "javitott": ""
        }

    if len(ean) != 13:
        return {
            "oszlop": "EAN-13",
            "hiba": f"Hibás hossz: {len(ean)} számjegy - vonalkód nem generálható",
            "eredeti": ean,
            "javitott": ""
        }

    # Checksum ellenőrzés
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(ean[:12]))
    check_digit = (10 - (total % 10)) % 10

    if check_digit != int(ean[12]):
        return {
            "oszlop": "EAN-13",
            "hiba": f"Hibás ellenőrző szám - vonalkód nem generálható",
            "eredeti": ean,
            "javitott": ""
        }

    return None


# =============================================================================
# EGYSÉGÁR SZÁMÍTÁS
# =============================================================================

def calculate_unit_price(pack: str, price) -> tuple:
    """Ft/l és Ft/kg számítás. Visszaad: (ft_per_l, ft_per_kg)"""
    if not pack or price == "" or price is None:
        return None, None

    try:
        price_val = float(str(price).replace(",", "."))
        if price_val <= 0:
            return None, None
    except (ValueError, TypeError):
        return None, None

    pack_str = str(pack).strip().lower()
    num_match = re.search(r'[\d.,]+', pack_str)
    if not num_match:
        return None, None

    try:
        qty = float(num_match.group().replace(",", "."))
        if qty <= 0:
            return None, None
    except ValueError:
        return None, None

    unit = re.sub(r'[\d.,\s]', '', pack_str).strip()

    if unit == "ml":
        return round(price_val / (qty / 1000)), None
    elif unit == "l":
        return round(price_val / qty), None
    elif unit == "g":
        return None, round(price_val / (qty / 1000))
    elif unit == "kg":
        return None, round(price_val / qty)

    return None, None


# =============================================================================
# FŐ FELDOLGOZÓ - egy sort dolgoz fel
# =============================================================================

def extract_kiszereles_from_name(name: str) -> tuple[str, str]:
    """
    Ha a megnevezés végén kiszerelés-jellegű szöveg van (pl. "festék 500 ml"),
    kinyeri azt és visszaadja a tisztított nevet + kiszerelést.
    Visszaad: (tisztított_név, kiszerelés) — ha nincs találat: (eredeti_név, "")
    """
    if not name:
        return name, ""

    # 1. Különleges eset: "db" és szinonimái a végén (szám nélkül is elfogadott)
    db_synonyms_pattern = "|".join(re.escape(s) for s in UNIT_MAP["db"])
    db_pattern = rf'\s+({db_synonyms_pattern})\s*$'
    db_match = re.search(db_pattern, name, re.IGNORECASE)
    if db_match:
        cleaned_name = name[:db_match.start()].strip()
        return cleaned_name, "db"

    # 2. Szám + mértékegység a végén (pl. "500 ml", "1 kg", "400g", "2.5 l", "1,5l", "500mili")
    all_units = []
    for synonyms in UNIT_MAP.values():
        all_units.extend(synonyms)
    units_pattern = "|".join(re.escape(u) for u in sorted(all_units, key=len, reverse=True))

    pattern = rf'\s+([\d.,]+)\s*({units_pattern})\s*$'
    match = re.search(pattern, name, re.IGNORECASE)
    if match:
        cleaned_name = name[:match.start()].strip()
        qty = match.group(1)
        unit_raw = match.group(2)

        # Normalizáljuk az egységet
        normalized_unit = unit_raw
        for standard, synonyms in UNIT_MAP.items():
            if unit_raw.lower() in [s.lower() for s in synonyms]:
                normalized_unit = standard
                break

        kiszereles = f"{qty} {normalized_unit}"
        return cleaned_name, kiszereles

    return name, ""


def process_row(raw_row: dict, row_index: int, max_chars_per_line: int = 22, max_chars_line3: int | None = None, extract_kiszereles: bool = False) -> dict:
    """
    Egy Excel sort validál és normalizál.
    Visszaad: {processed: {...}, hibak: [...], excel_sor: N}
    """
    name = str(raw_row.get("Megnevezés", "")).strip()
    # Fallback: ha az oszlopnév xlsm-ben eltér (pl. trailing space, vagy más elnevezés)
    if not name:
        for k, v in raw_row.items():
            if "megnevez" in str(k).strip().lower() and str(v).strip():
                name = str(v).strip()
                break
    pack = str(raw_row.get("Kiszerelés", "")).strip()
    price = raw_row.get("Ár", "")

    akcio_price = raw_row.get("Akciós_ár", "")

    # Ha csak Akciós_ár van kitöltve → kezelése mint sima Ár
    price_str_check = str(price).strip() if price not in ("", None) else ""
    akcio_str_check = str(akcio_price).strip() if akcio_price not in ("", None) else ""
    if not price_str_check and akcio_str_check:
        price = akcio_price
        akcio_price = ""

    # Teljesen üres sor → üres címke, nincs hiba
    price_str = str(price).strip() if price not in ("", None) else ""
    ean_check = str(raw_row.get("EAN-13", "")).strip()
    cikk_check = str(raw_row.get("Cikkszám", "")).strip()
    if not name and not pack and not price_str and not ean_check and not cikk_check:
        return {
            "processed": {
                "Első_sor": "", "Második_sor": "", "Harmadik_sor": "",
                "Kiszerelés": "", "Ár": "", "Akciós_ár": "", "Ft/l": "", "Ft/kg": "",
                "EAN-13": "", "Cikkszám": "",
            },
            "hibak": [],
            "excel_sor": row_index + 2,
            "termek": "",
        }

    # Ha extract_kiszereles aktív és a Kiszerelés üres, próbáljuk kinyerni a névből
    if extract_kiszereles and not pack:
        name, extracted_pack = extract_kiszereles_from_name(name)
        if extracted_pack:
            pack = extracted_pack
    ean = str(raw_row.get("EAN-13", "")).strip()
    cikk = str(raw_row.get("Cikkszám", "")).strip()

    hibak = []

    # 1. Cikkszám validálás
    cikk_hiba = validate_cikkszam(cikk)
    if cikk_hiba:
        hibak.append(cikk_hiba)

    # 2. Kiszerelés normalizálás
    normalized_pack, pack_hiba = normalize_kiszerelesek(pack)
    if pack_hiba:
        hibak.append(pack_hiba)

    # 3. Ár normalizálás
    normalized_price, ar_hiba = normalize_ar(price)
    if ar_hiba:
        hibak.append(ar_hiba)

    # Ár hossz ellenőrzés (max 5 karakter = max 99.999)
    if normalized_price and len(str(normalized_price)) > 5:
        hibak.append({
            "oszlop": "Ár",
            "hiba": f"Túl hosszú ár: '{normalized_price}' (maximum 5 karakter)",
            "eredeti": normalized_price,
            "javitott": str(normalized_price)[:5],
            "auto_javitott": True
        })
        normalized_price = str(normalized_price)[:5]

    # 3b. Akciós_ár normalizálás (ugyanazok a szabályok mint az Ár-nál)
    normalized_akcio, akcio_hiba = normalize_ar(akcio_price)
    if akcio_hiba:
        akcio_hiba["oszlop"] = "Akciós_ár"
        hibak.append(akcio_hiba)

    if normalized_akcio and len(str(normalized_akcio)) > 5:
        hibak.append({
            "oszlop": "Akciós_ár",
            "hiba": f"Túl hosszú akciós ár: '{normalized_akcio}' (maximum 5 karakter)",
            "eredeti": normalized_akcio,
            "javitott": str(normalized_akcio)[:5],
            "auto_javitott": True
        })
        normalized_akcio = str(normalized_akcio)[:5]

    # 4. EAN-13 validálás
    ean_hiba = validate_ean13(ean)
    if ean_hiba:
        hibak.append(ean_hiba)

    # 5. Névfeldarabolás - nagybetűs nevek szélesebbek, kevesebb karakter fér ki
    effective_max_chars = max_chars_per_line if name.isupper() else max_chars_per_line + 2
    effective_max_chars_line3 = None
    if max_chars_line3 is not None:
        effective_max_chars_line3 = max_chars_line3 if name.isupper() else max_chars_line3 + 2
    line1, line2, line3, name_overflow = split_name(name, max_chars=effective_max_chars, max_chars_line3=effective_max_chars_line3)

    if name_overflow:
        hibak.extend([
            {
                "oszlop": "Első_sor",
                "hiba": "A terméknév nem fér ki 3 sorban, kérjük javítsa.",
                "eredeti": line1,
                "javitott": line1
            },
            {
                "oszlop": "Második_sor",
                "hiba": "A terméknév nem fér ki 3 sorban, kérjük javítsa.",
                "eredeti": line2,
                "javitott": line2
            },
            {
                "oszlop": "Harmadik_sor",
                "hiba": "A terméknév nem fér ki 3 sorban, kérjük javítsa.",
                "eredeti": line3,
                "javitott": line3
            }
        ])

    # 6. Egységár számítás (normalizált kiszerelés és ár alapján)
    ft_per_l, ft_per_kg = calculate_unit_price(normalized_pack, normalized_price)

    processed = {
        "Első_sor": line1,
        "Második_sor": line2,
        "Harmadik_sor": line3,
        "Kiszerelés": normalized_pack,
        "Ár": normalized_price,
        "Akciós_ár": normalized_akcio,
        "Ft/l": ft_per_l if ft_per_l else "",
        "Ft/kg": ft_per_kg if ft_per_kg else "",
        "EAN-13": ean,
        "Cikkszám": cikk,
    }

    return {
        "processed": processed,
        "hibak": hibak,
        "excel_sor": row_index + 2,  # +2: 1-es indexelés + fejléc sor
        "termek": line1 or name,
    }
