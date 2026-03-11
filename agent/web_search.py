# =============================================================================
# WEB_SEARCH.PY - Webes keresés és termékadatok kinyerése cég alapján
# =============================================================================

import os
import json
import base64
import re
from urllib.parse import urljoin, urlparse
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


# =============================================================================
# 1. KERESÉS - DuckDuckGo-val megtaláljuk a cég weboldalát
# =============================================================================

def search_company(company_name: str) -> list[dict]:
    """
    Cég weboldalának és termékoldalainak keresése DuckDuckGo-val.
    Visszaad: [{"url": ..., "title": ..., "snippet": ...}, ...]
    """
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            print("❌ ddgs/duckduckgo-search csomag nincs telepítve")
            return []

    queries = [
        f"{company_name} termékek árak festék",
        f"{company_name} webshop festékbolt",
        f"{company_name}",
    ]

    all_results = []
    seen_domains = set()

    for query in queries:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, region="hu-hu", max_results=5))
                for r in results:
                    url = r.get("href", "")
                    domain = urlparse(url).netloc
                    if domain and domain not in seen_domains:
                        seen_domains.add(domain)
                        all_results.append({
                            "url": url,
                            "title": r.get("title", ""),
                            "snippet": r.get("body", "")
                        })
        except Exception as e:
            print(f"⚠ Keresési hiba ({query}): {e}")
            continue

    print(f"🔍 Keresés: {len(all_results)} egyedi találat ({company_name})")
    for r in all_results[:3]:
        print(f"  - {r['title']}: {r['url']}")
    return all_results[:8]


# =============================================================================
# 2. SCRAPING - Weboldal tartalmának letöltése
# =============================================================================

def scrape_page(url: str, timeout: float = 10.0) -> str:
    """
    Weboldal tartalmának letöltése és szöveg kinyerése.
    Visszaad: tisztított szöveges tartalom (max 15000 karakter)
    """
    try:
        import httpx
        from bs4 import BeautifulSoup
    except ImportError:
        print("❌ httpx vagy beautifulsoup4 nincs telepítve")
        return ""

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.8",
        }
        response = httpx.get(url, timeout=timeout, follow_redirects=True, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Felesleges elemek eltávolítása
        for tag in soup.find_all(["script", "style", "nav", "footer", "noscript", "iframe"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)

        # Üres sorok összevonása
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        text = "\n".join(lines)

        return text[:15000]

    except Exception as e:
        print(f"⚠ Scraping hiba ({url}): {e}")
        return ""


# =============================================================================
# 3. LOGO KERESÉS - Cég logojának megtalálása a weboldalon
# =============================================================================

def find_logo(url: str) -> tuple:
    """
    Cég logojának keresése a weboldalon.
    Visszaad: (base64_data_url, filename) vagy (None, None)
    """
    try:
        import httpx
        from bs4 import BeautifulSoup
    except ImportError:
        return None, None

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        response = httpx.get(url, timeout=10, follow_redirects=True, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        base_url = response.url if hasattr(response, 'url') else url

        # Logo URL keresési sorrend
        logo_url = None

        # 1. og:image
        og = soup.find("meta", property="og:image")
        if og and og.get("content"):
            logo_url = og["content"]

        # 2. apple-touch-icon (általában nagy méretű ikon)
        if not logo_url:
            apple = soup.find("link", rel="apple-touch-icon")
            if apple and apple.get("href"):
                logo_url = apple["href"]

        # 3. img tag amiben "logo" szerepel (src, alt, class, id)
        if not logo_url:
            for img in soup.find_all("img"):
                attrs_text = " ".join([
                    img.get("src", ""),
                    img.get("alt", ""),
                    " ".join(img.get("class", [])),
                    img.get("id", ""),
                ]).lower()
                if "logo" in attrs_text:
                    logo_url = img.get("src")
                    if logo_url:
                        break

        # 4. Header-ben lévő első kép
        if not logo_url:
            header = soup.find("header")
            if header:
                first_img = header.find("img")
                if first_img and first_img.get("src"):
                    logo_url = first_img["src"]

        # 5. Favicon (utolsó esély)
        if not logo_url:
            favicon = soup.find("link", rel=lambda x: x and "icon" in x.lower() if isinstance(x, str) else (x and any("icon" in v.lower() for v in x)))
            if favicon and favicon.get("href"):
                logo_url = favicon["href"]

        if not logo_url:
            print(f"⚠ Nem található logó: {url}")
            return None, None

        # Relatív URL feloldása
        logo_url = urljoin(str(base_url), logo_url)
        print(f"🖼 Logó URL: {logo_url}")

        # Logo letöltése
        img_response = httpx.get(logo_url, timeout=10, follow_redirects=True, headers=headers)
        img_response.raise_for_status()

        # Méret ellenőrzés
        content_length = len(img_response.content)
        if content_length < 500:
            print(f"⚠ Logó túl kicsi ({content_length} byte), kihagyva")
            return None, None
        if content_length > 5 * 1024 * 1024:
            print(f"⚠ Logó túl nagy ({content_length} byte), kihagyva")
            return None, None

        # MIME típus meghatározása
        content_type = img_response.headers.get("content-type", "image/png")
        if ";" in content_type:
            content_type = content_type.split(";")[0].strip()

        if not content_type.startswith("image/"):
            # Megpróbáljuk a kiterjesztésből
            ext = urlparse(logo_url).path.split(".")[-1].lower()
            mime_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                        "gif": "image/gif", "svg": "image/svg+xml", "webp": "image/webp", "ico": "image/x-icon"}
            content_type = mime_map.get(ext, "image/png")

        b64_data = base64.b64encode(img_response.content).decode("utf-8")
        data_url = f"data:{content_type};base64,{b64_data}"

        print(f"✓ Logó letöltve ({content_length} byte, {content_type})")
        return data_url, "company_logo.png", logo_url

    except Exception as e:
        print(f"⚠ Logo keresési hiba ({url}): {e}")
        return None, None, None


# =============================================================================
# 4. AI TERMÉK KINYERÉS - Claude-dal strukturált adatok
# =============================================================================

def extract_products_with_ai(scraped_texts: list[str], company_name: str) -> list[dict]:
    """
    Claude AI-val termékadatok kinyerése a weboldalak szövegéből.
    Visszaad: [{"Megnevezés": ..., "Kiszerelés": ..., "Ár": ...}, ...]
    """
    if not scraped_texts or all(not t for t in scraped_texts):
        print("⚠ Nincs feldolgozható szöveg a termék kinyeréshez")
        return []

    combined_text = "\n\n---\n\n".join(t for t in scraped_texts if t)

    # Max 20000 karakter a promptban (Claude token limit)
    if len(combined_text) > 20000:
        combined_text = combined_text[:20000]

    prompt = f"""Te egy termékadatokat kinyerő asszisztens vagy. Festék- és barkácsáru-boltról van szó.

CÉG NEVE: {company_name}

WEBOLDALAK TARTALMA:
{combined_text}

FELADATOD: Keress 5-6 terméket amelyeket ez a cég árul (festékek, vakolatok, alapozók, ragasztók, szigetelők, barkácseszközök stb.).

Minden termékről add meg:
1. Megnevezés - a termék neve (pl. "Trilak Héra falfesték fehér", "Baumit klíma festék belső")
2. Kiszerelés - mennyiség és egység szóközzel (pl. "5 l", "500 ml", "25 kg", "db")
3. Ár - csak szám, Ft nélkül (pl. "4990", "12990"). Ha nem találsz árat, használj ""

VÁLASZ FORMÁTUM - CSAK JSON array, semmi más szöveg:
[
  {{"Megnevezés": "...", "Kiszerelés": "...", "Ár": "..."}},
  {{"Megnevezés": "...", "Kiszerelés": "...", "Ár": "..."}}
]

FONTOS:
- Ha nem találsz elég terméket az oldalon, használd a tudásodat hasonló festékbolti termékekről
- Magyar nyelvű termékneveket használj
- A kiszerelés formátuma: szám + szóköz + egység (pl. "5 l", NEM "5l")
- Ha nem találsz árat, használj "" (üres string)
- Próbálj változatos termékeket adni (különböző típusok, méretek)
- CSAK olyan termékeket adj meg, amelyek kiszerelése g, kg, ml, l vagy db egységű
- Ha egy termék kiszerelése más egységű (pl. m, cm, pár, csomag stb.), azt NE add meg
- Ha egy terméknek nincs ismert egységű kiszerelése, azt NE add meg
"""

    try:
        print(f"🚀 Claude API hívás - termék kinyerés ({company_name})...")
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )

        content = response.content[0].text.strip()
        print(f"📝 AI válasz hossza: {len(content)} karakter")

        # Markdown code block eltávolítása (ai_suggestions.py mintájára)
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1]) if len(lines) > 2 else content
            content = content.replace("```json", "").replace("```", "").strip()

        products = json.loads(content)

        # Elfogadott mértékegységek (regex)
        import re
        valid_unit_pattern = re.compile(
            r'\b(\d[\d.,]*\s*(g|kg|ml|l|db))\b', re.IGNORECASE
        )

        # Validálás + mértékegység szűrés
        valid_products = []
        for p in products:
            if not isinstance(p, dict) or "Megnevezés" not in p:
                continue
            kiszereles = str(p.get("Kiszerelés", "")).strip()
            if not valid_unit_pattern.search(kiszereles):
                print(f"  ⚠ Kihagyva (ismeretlen egység): {p.get('Megnevezés', '')} | '{kiszereles}'")
                continue
            valid_products.append({
                "Megnevezés": str(p.get("Megnevezés", "")),
                "Kiszerelés": kiszereles,
                "Ár": str(p.get("Ár", "")),
            })

        print(f"✓ {len(valid_products)} termék kinyerve (szűrés után)")
        return valid_products

    except json.JSONDecodeError as e:
        print(f"❌ JSON parse hiba: {e}")
        return []
    except Exception as e:
        print(f"❌ AI termék kinyerési hiba: {e}")
        return []


# =============================================================================
# 5. FŐ ORCHESTRATOR
# =============================================================================

def search_company_products(company_name: str) -> dict:
    """
    Fő belépési pont: cég termékeinek keresése az interneten.
    Visszaad: {
        "products": [{"Megnevezés": ..., "Kiszerelés": ..., "Ár": ...}, ...],
        "logo_base64": "data:image/png;base64,..." or None,
        "source_urls": ["https://...", ...]
    }
    """
    print(f"\n{'='*60}")
    print(f"🔍 Cég keresés indítása: {company_name}")
    print(f"{'='*60}")

    # 1. Keresés: URL-ek gyűjtése
    search_results = search_company(company_name)
    if not search_results:
        print("❌ Nem található a cég az interneten")
        return {"products": [], "logo_base64": None, "source_urls": []}

    source_urls = [r["url"] for r in search_results]

    # 2. Logo keresés: az első (legvalószínűbb) találatról
    logo_base64 = None
    logo_url = None
    for result in search_results[:3]:
        logo_base64, _, logo_url = find_logo(result["url"])
        if logo_base64:
            break

    # 3. Scraping: az első 3-4 oldal tartalmának letöltése
    scraped_texts = []
    for result in search_results[:4]:
        text = scrape_page(result["url"])
        if text:
            scraped_texts.append(f"[Forrás: {result['url']}]\n{text}")

    # Snippet-ek hozzáadása (ha a scraping kevés tartalmat adott)
    snippets = "\n".join(f"- {r['title']}: {r['snippet']}" for r in search_results if r.get("snippet"))
    if snippets:
        scraped_texts.append(f"[Keresési találatok összefoglalója]\n{snippets}")

    # 4. AI termék kinyerés
    products = extract_products_with_ai(scraped_texts, company_name)

    print(f"\n{'='*60}")
    print(f"✓ Eredmény: {len(products)} termék, logó: {'van' if logo_base64 else 'nincs'}")
    print(f"{'='*60}\n")

    return {
        "products": products,
        "logo_base64": logo_base64,
        "logo_url": logo_url,
        "source_urls": source_urls,
    }
