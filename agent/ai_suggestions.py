# =============================================================================
# AI_SUGGESTIONS.PY - Claude AI-val intelligens javítási javaslatok
# =============================================================================

import os
import json
from anthropic import Anthropic
from dotenv import load_dotenv

# .env betöltése (szükséges a FastAPI szerverben)
load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def enhance_errors_with_ai_suggestions(issues: list[dict], processed_rows: list[dict]) -> list[dict]:
    """
    Claude AI-val javaslatokat kér minden hibára, ami még nincs javítva.
    Batch processing: egyszerre küldi el az összes hibát.
    """
    if not issues:
        return issues

    # Gyűjtsük össze azokat a hibákat, amikhez még nincs értelmes javaslat
    errors_to_fix = []
    for issue in issues:
        row_data = processed_rows[issue["row_index"]]
        for hiba_idx, hiba in enumerate(issue["hibak"]):
            # Ha már van értelmes javítás és auto-javított, kihagyjuk
            if hiba.get("javitott") and hiba.get("auto_javitott"):
                continue
            # EAN-13 hibát soha nem küldünk az AI-nak – a felhasználó javítja manuálisan
            if hiba.get("oszlop") == "EAN-13":
                continue

            # Kontextus: teljes termékadat
            context = {
                "Megnevezés": f"{row_data.get('Első_sor', '')} {row_data.get('Második_sor', '')} {row_data.get('Harmadik_sor', '')}".strip(),
                "Kiszerelés": row_data.get("Kiszerelés", ""),
                "Ár": row_data.get("Ár", ""),
                "Cikkszám": row_data.get("Cikkszám", ""),
                "EAN-13": row_data.get("EAN-13", "")
            }

            errors_to_fix.append({
                "row_index": issue["row_index"],
                "hiba_index": hiba_idx,
                "oszlop": hiba["oszlop"],
                "hiba_leiras": hiba["hiba"],
                "eredeti": hiba["eredeti"],
                "context": context
            })

    if not errors_to_fix:
        print("⚠ Nincs hiba, amit az AI-nak kellene javítani (minden auto-javítva)")
        return issues

    # Limit: max 50 hibát dolgozunk fel egyszerre (token limit miatt)
    errors_to_fix = errors_to_fix[:50]
    print(f"📊 AI-nak küldött hibák száma: {len(errors_to_fix)}")
    print(f"📋 Első 3 hiba példa:")
    for i, err in enumerate(errors_to_fix[:3]):
        print(f"  {i+1}. {err['oszlop']}: '{err['eredeti']}' - {err['hiba_leiras']}")

    # Claude API hívás
    prompt = f"""Te egy profi adatjavító asszisztens vagy. Termékadatokat javítasz magyar élelmiszerboltok számára.

HIBÁK LISTÁJA ({len(errors_to_fix)} db):
{json.dumps(errors_to_fix, ensure_ascii=False, indent=2)}

FELADATOD: Minden hibához adj egy OKOS 'javitott' értéket.

JAVÍTÁSI SZABÁLYOK:
1. **Szó duplikáció**: Távolítsd el egymás utáni azonos szavakat
   Példa: "Coca Cola Cola 500ml" → "Coca Cola 500ml"

2. **Kiszerelés formázási hiba**: Javítsd OKOSAN a formátumot
   - Szóköz hiányzik: "500ml" → "500 ml"
   - Rossz egység: "500milliliter" → "500 ml"
   - Dupla pont a számban: "1..3 kg" → "1.3 kg", "2..5 l" → "2.5 l"
   - Rossz tizedesjel: "1,5kg" → "1.5 kg"
   - Légy kreatív és logikus a formátum javításában!

3. **Kiszerelés hiányzó egység**: Következtesd ki a termék nevéből!
   - Tej, lé, üdítő, víz, szörp → valószínűleg "ml"
   - Kenyér, sajt, sonka, hús, gyümölcs → valószínűleg "g"
   Példa: "500" + kontextus: "Tej" → "500 ml"

4. **Név túl hosszú**: Ha nem fér ki 3 sorba (66 karakter összesen):
   - Rövidítsd ÉRTELMESEN
   - NE veszíts fontos infót (márka, kiszerelés, típus maradjon)
   - Távolítsd el a felesleges szavakat
   Példa: "Milka Alpesi Tejcsokoládé Mogyorós Krémes Töltéssel Extra Nagy Kiszerelés"
   → "Milka Alpesi Tejcsoki Mogyorós Krémes"

5. **Cikkszám túl hosszú**: Vágd le 10 karakterre (az első 10-et tartsd meg)

6. **EAN-13 hibás**:
   - NE számolj checksumot, NE javítsd!
   - MINDIG hagyd üresen: "javitott": ""
   - A felhasználó fogja manuálisan javítani

7. **Ár hibás/túl hosszú**:
   - Maximum 5 karakter lehet
   - Ha hosszabb, vágd le az első 5 karakterre
   - Példa: "123456" → "12345"

VÁLASZ FORMÁTUM - CSAK JSON array, semmi más szöveg!:
[
  {{"row_index": 0, "hiba_index": 0, "javitott": "javított érték"}},
  {{"row_index": 0, "hiba_index": 1, "javitott": "másik javított érték"}},
  ...
]

FONTOS:
- Ha egy hibát NEM tudsz javítani, akkor "javitott": "" (üres string)
- Légy kreatív és logikus!
- Magyar nyelv, ékezetek használata kötelező!
"""

    try:
        print("🚀 Claude API hívás indítása...")
        response = client.messages.create(
            model="claude-3-haiku-20240307",  # Claude 3 Haiku (Tier 1 access)
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
        )
        print("✓ API válasz megérkezett")

        # Parse válasz
        content = response.content[0].text.strip()
        print(f"📝 AI válasz hossza: {len(content)} karakter")

        # Eltávolítjuk a markdown code block wrapper-t ha van
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1]) if len(lines) > 2 else content
            content = content.replace("```json", "").replace("```", "").strip()

        print(f"📄 Tisztított válasz első 200 karakter: {content[:200]}...")
        suggestions = json.loads(content)
        print(f"✓ JSON parse sikeres, {len(suggestions)} javaslat")

        # Alkalmazzuk a javaslatokat az eredeti issues struktúrára
        applied_count = 0
        for suggestion in suggestions:
            row_idx = suggestion["row_index"]
            hiba_idx = suggestion["hiba_index"]
            javitott = suggestion.get("javitott", "")

            # Megkeressük a megfelelő hibát
            for issue in issues:
                if issue["row_index"] == row_idx:
                    if hiba_idx < len(issue["hibak"]):
                        # EAN-13 mezőt soha nem írjuk felül AI javaslattal
                        if issue["hibak"][hiba_idx].get("oszlop") == "EAN-13":
                            print(f"  ⚠ EAN-13 AI javaslat visszautasítva: sor {row_idx}, hiba {hiba_idx}")
                            break
                        # Frissítjük a javaslatot
                        issue["hibak"][hiba_idx]["javitott"] = javitott
                        applied_count += 1
                        print(f"  ✓ Alkalmazva: sor {row_idx}, hiba {hiba_idx}: '{javitott}'")
                        # NE állítsuk auto_javitott-ra, mert a felhasználónak át kell néznie
                    break

        print(f"✓ AI suggestions: {applied_count}/{len(suggestions)} javítást alkalmaztunk")

    except json.JSONDecodeError as e:
        print(f"❌ JSON parse hiba: {e}")
        print(f"Válasz tartalom: {content}")
    except Exception as e:
        print(f"❌ AI suggestion error: {e}")
        import traceback
        traceback.print_exc()
        # Ha hiba van, simán visszaadjuk az eredeti issues-t (heurisztikus javítások megmaradnak)

    return issues
