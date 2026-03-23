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
        f"{company_name}",
        f"{company_name} termékek webshop",
        f"{company_name} termékek árak festék",
        f"{company_name} festékbolt katalógus",
        f"{company_name} site:hu",
    ]

    all_results = []
    seen_domains = set()

    for query in queries:
        try:
            ddgs = DDGS(timeout=20)
            results = list(ddgs.text(query, region="hu-hu", max_results=8))
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
            # Fallback: httpx-alapú DuckDuckGo lite keresés
            try:
                fallback = _ddg_lite_search(query, max_results=8)
                for r in fallback:
                    url = r.get("href", "")
                    domain = urlparse(url).netloc
                    if domain and domain not in seen_domains:
                        seen_domains.add(domain)
                        all_results.append({
                            "url": url,
                            "title": r.get("title", ""),
                            "snippet": r.get("body", "")
                        })
            except Exception as fe:
                print(f"⚠ Fallback keresési hiba ({query}): {fe}")
            continue

    print(f"🔍 Keresés: {len(all_results)} egyedi találat ({company_name})")
    for r in all_results[:3]:
        print(f"  - {r['title']}: {r['url']}")
    return all_results[:14]


def _ddg_lite_search(query: str, max_results: int = 8) -> list[dict]:
    """
    Közvetlen httpx-alapú DuckDuckGo HTML keresés fallbackként,
    ha a ddgs/curl_cffi library nem működik.
    """
    try:
        import httpx
        from bs4 import BeautifulSoup

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.8",
        }
        resp = httpx.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query, "kl": "hu-hu"},
            headers=headers,
            timeout=15,
            follow_redirects=True,
        )
        soup = BeautifulSoup(resp.text, "html.parser")
        results = []
        for result in soup.select(".result"):
            link = result.select_one(".result__a")
            snippet = result.select_one(".result__snippet")
            if not link:
                continue
            href = link.get("href", "")
            # DuckDuckGo redirect URL kicsomagolása
            if "uddg=" in href:
                from urllib.parse import unquote, parse_qs, urlparse as up
                qs = parse_qs(up(href).query)
                href = unquote(qs.get("uddg", [""])[0])
            if href and href.startswith("http"):
                results.append({
                    "href": href,
                    "title": link.get_text(strip=True),
                    "body": snippet.get_text(strip=True) if snippet else "",
                })
                if len(results) >= max_results:
                    break
        print(f"  ↩ Fallback: {len(results)} találat")
        return results
    except Exception as e:
        print(f"  ✗ DDG lite hiba: {e}")
        return []


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

def _is_logo_like(content: bytes, content_type: str, url: str) -> bool:
    """
    Megvizsgálja, hogy a letöltött kép valóban logó-szerű-e.
    Logó jellemzők: PNG/SVG/WEBP formátum (átlátszó háttér), kis-közepes méret.
    JPG ritkán logó (tömörítés elvágja az átlátszóságot).
    """
    size = len(content)
    # Túl kicsi: ikon/pixel, túl nagy: termékfotó/hero image
    if size < 500 or size > 300 * 1024:
        print(f"  ✗ Logó méret nem megfelelő: {size} byte")
        return False
    # JPG szinte soha nem logó (nincs átlátszóság), hacsak nincs "logo" a URL-ben
    if "jpeg" in content_type or "jpg" in content_type:
        if "logo" not in url.lower():
            print(f"  ✗ JPG formátum és nincs 'logo' az URL-ben – valószínűleg nem logó")
            return False
    return True


def _try_download_logo(logo_url: str, base_url, headers: dict, label: str):
    """
    Megpróbál letölteni egy lehetséges logó URL-t és validálja.
    Visszaad: (data_url, logo_url) vagy (None, None)
    """
    try:
        import httpx
        resolved = urljoin(str(base_url), logo_url)
        img_resp = httpx.get(resolved, timeout=8, follow_redirects=True, headers=headers)
        img_resp.raise_for_status()
        content = img_resp.content
        ct = img_resp.headers.get("content-type", "")
        if ";" in ct:
            ct = ct.split(";")[0].strip()
        if not ct.startswith("image/"):
            ext = resolved.split(".")[-1].lower().split("?")[0]
            mime_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                        "gif": "image/gif", "svg": "image/svg+xml", "webp": "image/webp", "ico": "image/x-icon"}
            ct = mime_map.get(ext, "image/png")
        if not _is_logo_like(content, ct, resolved):
            return None, None
        b64 = base64.b64encode(content).decode("utf-8")
        print(f"  ✓ [{label}] Logó letöltve: {resolved} ({len(content)} byte, {ct})")
        return f"data:{ct};base64,{b64}", resolved
    except Exception as e:
        print(f"  ✗ [{label}] Letöltési hiba: {e}")
        return None, None


def find_logo(url: str) -> tuple:
    """
    Cég logojának keresése a weboldalon.
    Logó-specifikus prioritással: HTML 'logo' jelzések → SVG/PNG közvetlen URL-ek → icon → og:image.
    Visszaad: (base64_data_url, filename, logo_url) vagy (None, None, None)
    """
    try:
        import httpx
        from bs4 import BeautifulSoup
    except ImportError:
        return None, None, None

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        response = httpx.get(url, timeout=10, follow_redirects=True, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        base_url = response.url if hasattr(response, 'url') else url
        parsed_base = urlparse(str(base_url))
        domain_root = f"{parsed_base.scheme}://{parsed_base.netloc}"

        candidates = []  # (prioritás, url, label)

        # --- 1. <img> amiben "logo" szerepel src/alt/class/id-ben ---
        for img in soup.find_all("img"):
            src = img.get("src", "")
            attrs_text = " ".join([
                src,
                img.get("alt", ""),
                " ".join(img.get("class", [])),
                img.get("id", ""),
                img.get("data-src", ""),
            ]).lower()
            if "logo" in attrs_text and src:
                candidates.append((1, src, "img[logo]"))
                break  # Első logo img elegendő

        # --- 2. SVG elem inline vagy külső forrásból (header/navbar) ---
        for container_tag in ["header", "nav", "div"]:
            container = soup.find(container_tag)
            if container:
                svg_img = container.find("img", src=re.compile(r'\.svg', re.I))
                if svg_img and svg_img.get("src"):
                    candidates.append((2, svg_img["src"], f"svg in <{container_tag}>"))
                    break

        # --- 3. Közvetlen logó URL-minták a domain gyökerén ---
        logo_paths = [
            "/logo.svg", "/logo.png", "/logo.webp",
            "/images/logo.svg", "/images/logo.png",
            "/img/logo.svg", "/img/logo.png",
            "/assets/logo.svg", "/assets/logo.png",
            "/static/logo.svg", "/static/logo.png",
            "/media/logo.svg", "/media/logo.png",
        ]
        for path in logo_paths:
            candidates.append((3, domain_root + path, f"direct path {path}"))

        # --- 4. apple-touch-icon (minőségi ikon, általában logó-szerű) ---
        for apple in soup.find_all("link", rel="apple-touch-icon"):
            href = apple.get("href", "")
            if href:
                candidates.append((4, href, "apple-touch-icon"))
                break

        # --- 5. Favicon (shortcut icon) ---
        favicon_tag = soup.find("link", rel=lambda x: x and (
            "icon" in x.lower() if isinstance(x, str) else any("icon" in v.lower() for v in x)
        ))
        if favicon_tag and favicon_tag.get("href"):
            candidates.append((5, favicon_tag["href"], "favicon"))

        # --- 6. og:image (utolsó esély – általában nem logó) ---
        og = soup.find("meta", property="og:image")
        if og and og.get("content"):
            candidates.append((6, og["content"], "og:image"))

        # Próbáljuk sorban, visszaadjuk az első sikereset
        for _, candidate_url, label in candidates:
            if not candidate_url:
                continue
            data_url, resolved_url = _try_download_logo(candidate_url, base_url, headers, label)
            if data_url:
                return data_url, "company_logo.png", resolved_url

        print(f"⚠ Nem található megfelelő logó: {url}")
        return None, None, None

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
