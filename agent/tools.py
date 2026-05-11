# =============================================================================
# TOOLS.PY - Validáció és normalizálás
# =============================================================================

import re


# =============================================================================
# NÉVFELDARABOLÁS - 3 soros (standard)
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
# NÉVFELDARABOLÁS - 4 soros (csak Ditall)
# =============================================================================

def split_name_ditall(name: str, max_chars: int = 22, max_chars_line3: int | None = None) -> tuple[str, str, str, str, bool]:
    """Szavanként tördeli a nevet max 4 sorra (csak Ditall).
    Visszatér: (sor1, sor2, sor3, sor4, volt_túlcsordulás_4_sor_után)"""
    if not name:
        return "", "", "", "", False

    line3_limit = max_chars_line3 if max_chars_line3 is not None else max_chars
    limits = [max_chars, max_chars, line3_limit, line3_limit]

    words = str(name).strip().split()
    lines = ["", "", "", ""]
    current_line = 0
    overflow = False

    for word in words:
        if current_line >= 4:
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
            if current_line >= 4:
                overflow = True
                continue
            limit = limits[current_line]
            lines[current_line] = word
            if len(word) > limit:
                overflow = True

    if len(lines[2]) > line3_limit:
        overflow = True
    if len(lines[3]) > line3_limit:
        overflow = True

    return lines[0], lines[1], lines[2], lines[3], overflow


# =============================================================================
# CIKKSZÁM VALIDÁLÁS (max 10 karakter)
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

# Elfogadott mértékegységek (standard)
UNIT_MAP = {
    "ml": ["ml", "mL", "ML", "milliliter", "millilitre", "milliliteres", "milliiter", "mili", "milli"],
    "l":  ["l", "L", "liter", "litre", "litres", "literes", "liters", "lit"],
    "g":  ["g", "G", "gr", "gramm", "gram", "grams"],
    "kg": ["kg", "KG", "Kg", "kG", "kilogramm", "kilogram", "kilograms", "kilo"],
    "db": ["db", "DB", "Db", "dB", "darab", "piece", "pieces", "pcs"],
}

# Ditall-specifikus mértékegységek (UNIT_MAP + m2, m)
DITALL_UNIT_MAP = {
    **UNIT_MAP,
    "m2": ["m2", "M2", "m²", "négyzetméter", "negyzetmeter", "sqm"],
    "m":  ["m", "méter", "meter", "meters"],
}

UNIT_MAPS = {
    "standard": UNIT_MAP,
    "ditall": DITALL_UNIT_MAP,
}


def normalize_kiszerelesek(pack: str, unit_map: dict) -> tuple[str, dict | None]:
    """Normalizálja a kiszerelést a megadott unit_map alapján."""
    if not pack or str(pack).strip() == "":
        return "", None

    pack = str(pack).strip()

    # Különleges eset: "db" és szinonimái (szám nélkül is elfogadott)
    db_synonyms = [s.lower() for s in unit_map["db"]]
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

    # Szám kinyerése
    num_match = re.search(r'^[\d.,]+', pack)
    if not num_match:
        num_match = re.search(r'[\d.,]+', pack)

    if not num_match:
        return pack, {
            "oszlop": "Kiszerelés",
            "hiba": f"Nem sikerült számot kinyerni: '{pack}'",
            "eredeti": pack,
            "javitott": ""
        }

    qty_str = num_match.group().replace(",", ".")

    try:
        float(qty_str)
    except ValueError:
        return pack, {
            "oszlop": "Kiszerelés",
            "hiba": f"Érvénytelen mennyiség: '{qty_str}' (helyes formátum pl. '2.5 kg')",
            "eredeti": pack,
            "javitott": ""
        }

    # Ditall: unit_raw a szám utáni szöveg (szóközzel is)
    # Standard: unit_raw csak a nem-szám/szóköz karakterek
    if unit_map is DITALL_UNIT_MAP:
        unit_raw = pack[num_match.end():].strip()
    else:
        unit_raw = re.sub(r'[\d.,\s]', '', pack).strip()

    # Ha db-szinonima + szám → hiba
    if unit_raw.lower() in db_synonyms:
        return "db", {
            "oszlop": "Kiszerelés",
            "hiba": f"db-os termékeknél nincs mennyiség: '{pack}' → helyes formátum: 'db'",
            "eredeti": pack,
            "javitott": "db"
        }

    # Egység keresése a térképben
    normalized_unit = None
    for standard, synonyms in unit_map.items():
        if unit_raw.lower() in [s.lower() for s in synonyms]:
            normalized_unit = standard
            break

    if normalized_unit is None:
        allowed = ", ".join(unit_map.keys())
        return pack, {
            "oszlop": "Kiszerelés",
            "hiba": f"Ismeretlen mértékegység: '{unit_raw}' (engedélyezett: {allowed})",
            "eredeti": pack,
            "javitott": ""
        }

    normalized = f"{qty_str} {normalized_unit}"

    if normalized == pack:
        return normalized, None

    return normalized, {
        "oszlop": "Kiszerelés",
        "hiba": f"Átírva: '{pack}' → '{normalized}'",
        "eredeti": pack,
        "javitott": normalized,
        "auto_javitott": True
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

def calculate_unit_price(pack: str, price, unit_map: dict, ft_m2: bool) -> tuple:
    """
    Ft/l, Ft/kg (és opcionálisan Ft/m2) számítás.
    Visszaad: (ft_per_l, ft_per_kg) vagy (ft_per_l, ft_per_kg, ft_per_m2) ha ft_m2=True.
    """
    if not pack or price == "" or price is None:
        return (None, None, None) if ft_m2 else (None, None)

    try:
        price_val = float(str(price).replace(",", "."))
        if price_val <= 0:
            return (None, None, None) if ft_m2 else (None, None)
    except (ValueError, TypeError):
        return (None, None, None) if ft_m2 else (None, None)

    pack_str = str(pack).strip().lower()
    num_match = re.search(r'[\d.,]+', pack_str)
    if not num_match:
        return (None, None, None) if ft_m2 else (None, None)

    try:
        qty = float(num_match.group().replace(",", "."))
        if qty <= 0:
            return (None, None, None) if ft_m2 else (None, None)
    except ValueError:
        return (None, None, None) if ft_m2 else (None, None)

    # Ditall: unit a szám utáni szöveg; standard: nem-szám/szóköz karakterek
    if unit_map is DITALL_UNIT_MAP:
        unit = pack_str[num_match.end():].strip()
    else:
        unit = re.sub(r'[\d.,\s]', '', pack_str).strip()

    ft_l = ft_kg = ft_m2_val = None

    if unit == "ml":
        ft_l = round(price_val / (qty / 1000))
    elif unit == "l":
        ft_l = round(price_val / qty)
    elif unit == "g":
        ft_kg = round(price_val / (qty / 1000))
    elif unit == "kg":
        ft_kg = round(price_val / qty)
    elif unit == "m2" and ft_m2:
        ft_m2_val = round(price_val / qty)

    return (ft_l, ft_kg, ft_m2_val) if ft_m2 else (ft_l, ft_kg)


# =============================================================================
# KISZERELÉS KINYERÉSE A MEGNEVEZÉSBŐL - standard
# =============================================================================

def extract_kiszereles_from_name(name: str, unit_map: dict) -> tuple[str, str]:
    """
    Ha a megnevezés végén kiszerelés-jellegű szöveg van (pl. "festék 500 ml"),
    kinyeri azt és visszaadja a tisztított nevet + kiszerelést.
    Visszaad: (tisztított_név, kiszerelés) — ha nincs találat: (eredeti_név, "")
    """
    if not name:
        return name, ""

    # 1. Különleges eset: "db" és szinonimái a végén (szám nélkül is elfogadott)
    db_synonyms_pattern = "|".join(re.escape(s) for s in unit_map["db"])
    db_pattern = rf'\s+({db_synonyms_pattern})\s*$'
    db_match = re.search(db_pattern, name, re.IGNORECASE)
    if db_match:
        cleaned_name = name[:db_match.start()].strip()
        return cleaned_name, "db"

    # 2. Szám + mértékegység a végén
    all_units = []
    for synonyms in unit_map.values():
        all_units.extend(synonyms)
    units_pattern = "|".join(re.escape(u) for u in sorted(all_units, key=len, reverse=True))

    pattern = rf'\s+([\d.,]+)\s*({units_pattern})\s*$'
    match = re.search(pattern, name, re.IGNORECASE)
    if match:
        cleaned_name = name[:match.start()].strip()
        qty = match.group(1)
        unit_raw = match.group(2)

        normalized_unit = unit_raw
        for standard, synonyms in unit_map.items():
            if unit_raw.lower() in [s.lower() for s in synonyms]:
                normalized_unit = standard
                break

        kiszereles = f"{qty} {normalized_unit}"
        return cleaned_name, kiszereles

    return name, ""


# =============================================================================
# KISZERELÉS ÉS SZÍN KINYERÉSE A MEGNEVEZÉSBŐL - Ditall
# =============================================================================

def extract_kiszereles_and_szin_from_name(name: str, unit_map: dict) -> tuple[str, str, str]:
    """
    A megnevezés végétől visszafelé keresi a kiszerelést (szám+mértékegység).
    A kiszerelés utáni szöveg a szín.
    Visszaad: (cleaned_name, kiszerelés, szín)
    Ha nincs kiszerelés találat: (eredeti_name, "", "")
    """
    if not name:
        return name or "", "", ""

    # 1. Különleges eset: "db" és szinonimái (szám nélkül is elfogadott)
    db_synonyms_pattern = "|".join(re.escape(s) for s in unit_map["db"])
    db_pattern = rf'(.*)\s({db_synonyms_pattern})(\s+.+?)?\s*$'
    db_match = re.search(db_pattern, name, re.IGNORECASE)
    if db_match:
        cleaned_name = db_match.group(1).strip()
        szin = (db_match.group(3) or "").strip()
        return cleaned_name, "db", szin

    # 2. Szám + mértékegység + opcionális szín a végén
    all_units = []
    for synonyms in unit_map.values():
        all_units.extend(synonyms)
    units_pattern = "|".join(re.escape(u) for u in sorted(all_units, key=len, reverse=True))

    pattern = rf'(.*)\s([\d.,]+)\s*({units_pattern})(\s+.+?)?\s*$'
    match = re.search(pattern, name, re.IGNORECASE)
    if match:
        cleaned_name = match.group(1).strip()
        qty = match.group(2)
        unit_raw = match.group(3)
        szin = (match.group(4) or "").strip()

        normalized_unit = unit_raw
        for standard, synonyms in unit_map.items():
            if unit_raw.lower() in [s.lower() for s in synonyms]:
                normalized_unit = standard
                break

        kiszereles = f"{qty} {normalized_unit}"
        return cleaned_name, kiszereles, szin

    return name, "", ""


# =============================================================================
# FŐ FELDOLGOZÓ - egy sort dolgoz fel
# =============================================================================

def process_row(raw_row: dict, row_index: int, cfg: dict) -> dict:
    """
    Egy Excel sort validál és normalizál a subpage config alapján.
    Visszaad: {processed: {...}, hibak: [...], excel_sor: N}
    """
    max_chars_per_line = cfg["max_chars_per_line"]
    max_chars_line3 = cfg.get("max_chars_line3")
    extract_kiszereles = cfg["extract_kiszereles"]
    extract_szin = cfg["extract_szin"]
    max_lines = cfg["max_lines"]
    unit_map = UNIT_MAPS[cfg["unit_map"]]
    ft_m2 = cfg["ft_m2"]
    use_szin_extract = cfg["unit_map"] == "ditall"  # csak Ditall keres színt a névből

    name = str(raw_row.get("Megnevezés", "")).strip()
    # Fallback: ha az oszlopnév xlsm-ben eltér (pl. trailing space, vagy más elnevezés)
    if not name:
        for k, v in raw_row.items():
            if "megnevez" in str(k).strip().lower() and str(v).strip():
                name = str(v).strip()
                break
    pack = str(raw_row.get("Kiszerelés", "")).strip()
    price = raw_row.get("Ár", "")
    szin = str(raw_row.get("Szín", "")).strip() if extract_szin else ""

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
        empty = {
            "Első_sor": "", "Második_sor": "", "Harmadik_sor": "",
            "Kiszerelés": "", "Ár": "", "Akciós_ár": "", "Ft/l": "", "Ft/kg": "",
            "EAN-13": "", "Cikkszám": "",
        }
        if max_lines == 4:
            empty["Negyedik_sor"] = ""
        if ft_m2:
            empty["Ft/m2"] = ""
        if extract_szin:
            empty["Szín"] = ""
        return {"processed": empty, "hibak": [], "excel_sor": row_index + 2, "termek": ""}

    # Kiszerelés (és szín) kinyerése a névből
    if use_szin_extract and (extract_kiszereles or extract_szin) and name:
        cleaned_name, found_kiszereles, found_szin = extract_kiszereles_and_szin_from_name(name, unit_map)
        if found_kiszereles:
            name = cleaned_name
            if extract_kiszereles and not pack:
                pack = found_kiszereles
            if extract_szin and not szin:
                szin = found_szin
    elif extract_kiszereles and not pack:
        name, extracted_pack = extract_kiszereles_from_name(name, unit_map)
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
    normalized_pack, pack_hiba = normalize_kiszerelesek(pack, unit_map)
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

    if max_lines == 4:
        line1, line2, line3, line4, name_overflow = split_name_ditall(
            name, max_chars=effective_max_chars, max_chars_line3=effective_max_chars_line3
        )
        overflow_msg = "A terméknév nem fér ki 4 sorban, kérjük javítsa."
    else:
        line1, line2, line3, name_overflow = split_name(
            name, max_chars=effective_max_chars, max_chars_line3=effective_max_chars_line3
        )
        line4 = None
        overflow_msg = "A terméknév nem fér ki 3 sorban, kérjük javítsa."

    if name_overflow:
        hibak.extend([
            {"oszlop": "Első_sor", "hiba": overflow_msg, "eredeti": line1, "javitott": line1},
            {"oszlop": "Második_sor", "hiba": overflow_msg, "eredeti": line2, "javitott": line2},
            {"oszlop": "Harmadik_sor", "hiba": overflow_msg, "eredeti": line3, "javitott": line3},
        ])

    # 6. Egységár számítás
    unit_prices = calculate_unit_price(normalized_pack, normalized_price, unit_map, ft_m2)

    processed = {
        "Első_sor": line1,
        "Második_sor": line2,
        "Harmadik_sor": line3,
        "Kiszerelés": normalized_pack,
        "Ár": normalized_price,
        "Akciós_ár": normalized_akcio,
        "Ft/l": unit_prices[0] if unit_prices[0] else "",
        "Ft/kg": unit_prices[1] if unit_prices[1] else "",
        "EAN-13": ean,
        "Cikkszám": cikk,
    }

    if max_lines == 4:
        processed["Negyedik_sor"] = line4
    if ft_m2:
        processed["Ft/m2"] = unit_prices[2] if unit_prices[2] else ""
    if extract_szin:
        processed["Szín"] = szin

    return {
        "processed": processed,
        "hibak": hibak,
        "excel_sor": row_index + 2,  # +2: 1-es indexelés + fejléc sor
        "termek": line1 or name,
    }
