import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Headphones, PiggyBank, Printer, SlidersHorizontal, Zap } from "lucide-react";
import { GB, HU } from "country-flag-icons/react/3x2";
import { api, setToken } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Hero3DLabel } from "../components/Hero3DLabel";
import { QuoteConfiguratorFields, QuoteSummary, useQuoteConfig } from "../components/QuoteConfigurator";
import { subpages } from "../config/subpages";
import { T, useLanguage } from "../i18n/LanguageContext";
import "../styles/landing.css";

/** Belépés után a megfelelő React-route (username vagy a régi redirect_url alapján). */
function resolveTarget(username: string, redirectUrl: string): string {
  const uname = username.trim().toLowerCase();
  const byUser = Object.values(subpages).find((c) => c.companyUsername.toLowerCase() === uname);
  if (byUser) return `/${byUser.subpageId}`;
  const url = redirectUrl.toLowerCase();
  if (url.includes("ritzer")) return "/demo";
  const byUrl = Object.values(subpages).find((c) => url.includes(c.subpageId));
  return byUrl ? `/${byUrl.subpageId}` : "/";
}

interface Notification {
  message: string;
  type: "success" | "error";
}

const SECTION_IDS = ["bemutatkozas", "demo-try", "miert", "cimbi", "pelda-cimkek", "arajanlat"] as const;

const BENEFIT_ICONS = [Zap, PiggyBank, FileText, Printer, SlidersHorizontal, Headphones];

/** A régi index.html + main.js React-portja (Fázis 5). */
export function Landing() {
  const { lang, setLang, t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<string>("bemutatkozas");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stepsCollapsed, setStepsCollapsed] = useState(true);
  const [ctaHidden, setCtaHidden] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [notificationShown, setNotificationShown] = useState(false);
  const [counter, setCounter] = useState(0);

  const previewImgRef = useRef<HTMLImageElement>(null);
  const notifTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Értesítés (a régi showNotification) ──
  const showNotification = useCallback((message: string, type: "success" | "error" = "error") => {
    notifTimers.current.forEach(clearTimeout);
    setNotification({ message, type });
    setNotificationShown(false);
    notifTimers.current = [
      setTimeout(() => setNotificationShown(true), 10),
      setTimeout(() => setNotification(null), 5000),
    ];
  }, []);

  // ── Számláló animáció (4 mp, 60fps) ──
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    void api
      .get<{ total_count: number }>("/api/total-label-count", false)
      .then((data) => {
        const end = data.total_count;
        const increment = end / (4000 / 16);
        let current = 0;
        timer = setInterval(() => {
          current += increment;
          if (current >= end) {
            current = end;
            if (timer) clearInterval(timer);
          }
          setCounter(Math.floor(current));
        }, 16);
      })
      .catch((e) => console.error("Error loading label count:", e));
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  // ── Scroll spy ──
  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-68px 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // ── Belépéskor a URL-horgonyra görgetés (pl. a demóból "Árajánlatot kérek"-kel
  //    visszatérve /#arajanlat-ra, vagy közvetlen mély-linkkel). A szekciók az első
  //    renderben jelen vannak, ezért a rAF utáni scrollIntoView megbízhatóan célba ér. ──
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    // A célszekció (pl. #arajanlat) FÖLÖTT lazy-load képek vannak (pelda-cimkek):
    // ezek utólagos betöltése megnöveli a fenti tartalom magasságát, így egyetlen
    // korai scrollIntoView "rövidre sül" és a fölötte lévő szekciónál (mintacímkék)
    // áll meg. Ezért a betöltés/elrendezés rendeződése után újra a helyére görgetünk.
    let cancelled = false;
    const scrollToTarget = (behavior: ScrollBehavior) => {
      if (!cancelled) el.scrollIntoView({ behavior });
    };
    requestAnimationFrame(() => scrollToTarget("smooth"));
    const timers = [250, 700, 1300].map((delay) =>
      window.setTimeout(() => scrollToTarget("auto"), delay),
    );
    const onLoad = () => scrollToTarget("auto");
    window.addEventListener("load", onLoad);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  // ── Sticky mobil CTA elrejtése az árajánlat szekciónál ──
  useEffect(() => {
    const target = document.getElementById("arajanlat");
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => setCtaHidden(e.isIntersecting)),
      { rootMargin: "0px 0px -20% 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // ── Kurzor-zoom a labels.jpg előnézeten (csak desktop) ──
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const img = previewImgRef.current;
    if (!img) return;
    const onMove = (e: MouseEvent) => {
      const { left, top, width, height } = img.getBoundingClientRect();
      img.style.transformOrigin = `${((e.clientX - left) / width) * 100}% ${((e.clientY - top) / height) * 100}%`;
    };
    const onLeave = () => {
      img.style.transformOrigin = "50% 50%";
    };
    img.addEventListener("mousemove", onMove);
    img.addEventListener("mouseleave", onLeave);
    return () => {
      img.removeEventListener("mousemove", onMove);
      img.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // ── Login modal: Escape bezárja, nyitva testtörlés tiltása ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLoginOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = loginOpen || mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [loginOpen, mobileMenuOpen]);

  // ── Login ──
  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    setLoginBusy(true);
    try {
      const data = await login(username, password);
      sessionStorage.setItem("currentUsername", username);
      showNotification(t("login-success"), "success");
      setLoginOpen(false);
      setTimeout(() => navigate(resolveTarget(username, data.redirect_url)), 1500);
    } catch {
      showNotification(t("login-error"), "error");
    } finally {
      setLoginBusy(false);
    }
  }

  // ── Demo egykattintásos kipróbálása ──
  // Ha van Turnstile site key (VITE_TURNSTILE_SITE_KEY): CAPTCHA-val védett
  // token-belépés a /api/demo-token végponton. Ha nincs: jelszavas fallback.
  const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const [demoBusy, setDemoBusy] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  // Turnstile script + widget betöltése (csak ha van site key)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const renderWidget = () => {
      if (turnstileWidgetId.current !== null || !turnstileRef.current) return;
      turnstileWidgetId.current = window.turnstile?.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
      }) ?? null;
    };
    if (window.turnstile) {
      renderWidget();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = renderWidget;
    document.head.appendChild(script);
  }, [TURNSTILE_SITE_KEY]);

  async function handleTryDemo() {
    // A generátor csak asztali gépen fut - mobilon a gomb inaktív (CSS is tiltja)
    if (window.matchMedia("(max-width: 900px)").matches) return;
    setDemoBusy(true);
    try {
      if (TURNSTILE_SITE_KEY) {
        const captchaToken =
          turnstileWidgetId.current !== null
            ? window.turnstile?.getResponse(turnstileWidgetId.current)
            : undefined;
        if (!captchaToken) {
          showNotification(t("try-demo-captcha-missing"), "error");
          return;
        }
        const data = await api.post<{ token: string; redirect_url: string }>(
          "/api/demo-token",
          { turnstile_token: captchaToken },
          false,
        );
        setToken(data.token);
      } else {
        // Fallback: nyilvános jelszavas belépés (pl. lokális fejlesztésnél)
        await login("DEMO", "labellabor2026");
      }
      sessionStorage.setItem("currentUsername", "DEMO");
      navigate("/demo");
    } catch {
      showNotification(t("login-error"), "error");
      if (TURNSTILE_SITE_KEY && turnstileWidgetId.current !== null) {
        window.turnstile?.reset(turnstileWidgetId.current);
      }
    } finally {
      setDemoBusy(false);
    }
  }

  // ── Kapcsolati űrlap (Formspree) + árajánlat-konfigurátor ──
  const quoteCfg = useQuoteConfig();

  async function handleContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    // SEC: a maxLength csak UX-korlát (DevToolsban kikapcsolható), ezért küldés előtt
    // szerver-független módon is levágjuk a mezőket - egy külső szolgáltatóhoz
    // (Formspree) küldött, felfújt payload így sem lehet visszaélés/DoS vektor.
    const get = (name: string, cap = 200) =>
      (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value.slice(0, cap);
    // Honeypot: bot csendben eldobva
    if (get("_gotcha")) {
      form.reset();
      return;
    }
    setContactBusy(true);
    try {
      const response = await fetch("https://formspree.io/f/mkgppand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: get("name", 100),
          email: get("email", 150),
          telefon: get("phone", 30).trim() || "-",
          company: get("company", 150),
          // A konfigurátorból épített brief (mindig magyarul) + strukturált mezők
          message: quoteCfg.brief,
          ...quoteCfg.fields,
          _replyto: get("email", 150),
        }),
      });
      if (response.ok) {
        showNotification(t("contact-success"), "success");
        form.reset();
        quoteCfg.reset();
      } else {
        showNotification(t("contact-error"), "error");
      }
    } catch {
      showNotification(t("contact-error"), "error");
    } finally {
      setContactBusy(false);
    }
  }

  const navLinks = (
    <>
      <a href="#bemutatkozas" className={`nav-link${activeSection === "bemutatkozas" ? " active" : ""}`}>
        <T k="about" />
      </a>
      <a href="#demo-try" className={`nav-link${activeSection === "demo-try" ? " active" : ""}`}>
        <T k="nav-try" />
      </a>
      <a href="#miert" className={`nav-link${activeSection === "miert" ? " active" : ""}`}>
        <T k="what-is" />
      </a>
      <a href="#cimbi" className={`nav-link${activeSection === "cimbi" ? " active" : ""}`}>
        <T k="nav-cimbi" />
      </a>
      <a href="#pelda-cimkek" className={`nav-link${activeSection === "pelda-cimkek" ? " active" : ""}`}>
        <T k="demo-labels" />
      </a>
      <a href="#arajanlat" className={`nav-link${activeSection === "arajanlat" ? " active" : ""}`}>
        <T k="contact-request" />
      </a>
    </>
  );

  const langSwitcher = (
    <>
      <button className={`lang-btn${lang === "en" ? " active" : ""}`} onClick={() => setLang("en")}>
        <GB className="lang-flag" aria-hidden="true" /> EN
      </button>
      <button className={`lang-btn${lang === "hu" ? " active" : ""}`} onClick={() => setLang("hu")}>
        <HU className="lang-flag" aria-hidden="true" /> HU
      </button>
    </>
  );

  return (
    <div className="landing-root">
      {/* ══════════ HEADER ══════════ */}
      <header className="header-container">
        <div className="header-left">
          <a href="#bemutatkozas" className="logo">
            <img src="/assets/main_icon.png" alt="" className="logo-icon" />
            Label<span>Labor</span>
          </a>
        </div>
        <div className="header-center">
          <nav className="header-nav">{navLinks}</nav>
        </div>
        <div className="header-right">
          <div className="language-switcher">{langSwitcher}</div>
          <button className="btn-login" onClick={() => setLoginOpen(true)}>
            <T k="nav-login" />
          </button>
          <button
            className={`hamburger-menu${mobileMenuOpen ? " active" : ""}`}
            aria-label="Menü"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((o) => !o)}
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>
      </header>

      {/* ══════════ MOBILE MENU ══════════ */}
      <div
        className={`mobile-menu-overlay${mobileMenuOpen ? " active" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMobileMenuOpen(false);
        }}
      >
        <div className="mobile-menu-content">
          <button className="mobile-menu-close" aria-label="Bezárás" onClick={() => setMobileMenuOpen(false)}>
            ×
          </button>
          <ul className="mobile-menu-list">
            {(
              [
                ["#bemutatkozas", "about"],
                ["#demo-try", "nav-try"],
                ["#miert", "what-is"],
                ["#cimbi", "nav-cimbi"],
                ["#pelda-cimkek", "demo-labels"],
                ["#arajanlat", "contact-request"],
              ] as const
            ).map(([href, key]) => (
              <li key={href}>
                <a href={href} className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
                  <T k={key} />
                </a>
              </li>
            ))}
            <li className="mobile-menu-lang">{langSwitcher}</li>
          </ul>
        </div>
      </div>

      <main id="main-content">
        {/* ═══ BEMUTATKOZÁS ═══ */}
        <section id="bemutatkozas" className="page-section">
          {/* 3D címke hook - az első dolog, amit a látogató lát */}
          <Hero3DLabel />
          <div className="page-wrapper about-container">
            <div className="hero-section">
              <div className="hero-text">
                <T k="hero-title" as="h1" className="hero-title" />
                <T k="about-intro" as="p" className="hero-desc" />
                <div className="hero-actions">
                  <a href="#arajanlat" className="btn-cta-primary hero-cta-mobile">
                    <T k="pricing-cta" />
                  </a>
                  <a href="#pelda-cimkek" className="btn-cta-secondary">
                    <T k="cta-examples-btn" />
                  </a>
                  <a href="#demo-try" className="btn-cta-secondary">
                    <T k="hero-demo-btn" />
                  </a>
                </div>
                <T k="mobile-app-notice" as="p" className="hero-mobile-note" />
              </div>
              <div className="hero-badge-stack">
                <div className="hero-badge hero-badge--blue">
                  <span className="hero-badge-num">{counter.toLocaleString("hu-HU")}</span>
                  <T k="hero-total-label" className="hero-badge-label" />
                </div>
                <div className="hero-badge">
                  <span className="hero-badge-num">100+</span>
                  <T k="hero-badge-label" className="hero-badge-label" />
                </div>
              </div>
            </div>

            <div className="about-benefits-section">
              <T k="why-label" as="p" className="section-eyebrow" />
              <T k="kifejezetten" as="p" className="section-lead" />
              <div className="benefit-cards-grid">
                {BENEFIT_ICONS.map((Icon, i) => (
                  <div className="benefit-card" key={i}>
                    <div className="benefit-card-icon">
                      <Icon />
                    </div>
                    <T k={`about-benefit-${i + 1}` as "about-benefit-1"} as="p" />
                  </div>
                ))}
              </div>
            </div>

            <div className="pricing-banner">
              <div className="pricing-banner-text">
                <T k="pricing-title" as="h3" />
                <T k="pricing-desc" as="p" />
              </div>
              <T k="pricing-amount" as="div" className="pricing-banner-price" />
              <button
                className="btn-cta-white"
                onClick={() => document.getElementById("arajanlat")?.scrollIntoView({ behavior: "smooth" })}
              >
                <T k="pricing-cta" />
              </button>
            </div>
          </div>
        </section>

        {/* ═══ DEMO KIPRÓBÁLÁSA ═══ */}
        <section id="demo-try" className="page-section section-alt">
          <div className="page-wrapper">
            <div className="try-demo-banner">
              <div className="try-demo-text">
                <p className="section-eyebrow">
                  <T k="try-demo-eyebrow" /> <T k="new-badge" className="new-text-badge" />
                </p>
                <T k="try-demo-title" as="h2" className="section-heading" />
                <T k="try-demo-desc" as="p" className="section-lead" />
                <T k="try-demo-note" as="p" className="try-demo-note" />
              </div>
              <div className="try-demo-action">
                {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="try-demo-turnstile"></div>}
                <button className="btn-cta-primary try-demo-btn" onClick={() => void handleTryDemo()} disabled={demoBusy}>
                  <T k={demoBusy ? "try-demo-cta-busy" : "try-demo-cta"} />
                </button>
                <T k="try-demo-creds" as="p" className="try-demo-creds" />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ MI AZ A LABEL LABOR ═══ */}
        <section id="miert" className="page-section">
          <div className="page-wrapper info-page-wrapper">
            <div className="content-grid">
              <div className="video-section">
                <T k="demo-video" as="h2" />
                <div className="videos-container">
                  <div className="video-wrapper">
                    <iframe
                      src="https://www.youtube.com/embed/fjq7mKOjTFk"
                      title="Label Labor bemutató"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              </div>

              <div className="steps-section">
                <T k="user-guide" as="h2" />
                <button
                  type="button"
                  className="steps-toggle"
                  aria-expanded={!stepsCollapsed}
                  onClick={() => setStepsCollapsed((c) => !c)}
                >
                  <span className="steps-toggle-label">
                    <T k={stepsCollapsed ? "steps-toggle-show" : "steps-toggle-hide"} />
                  </span>
                  <svg
                    className="steps-toggle-chevron"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className={`steps-list steps-scrollable${stepsCollapsed ? " collapsed" : ""}`}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <div className="step-item" key={i}>
                      <div className="step-number">{i + 1}/8</div>
                      <div className="step-content">
                        <T k={`step${i + 1}-title` as "step1-title"} as="h3" />
                        <T k={`step${i + 1}-desc` as "step1-desc"} as="p" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ CIMBI - AI ASSZISZTENS ═══ */}
        <section id="cimbi" className="page-section section-alt">
          <img src="/assets/cimbi.svg" alt="" className="cimbi-peek" aria-hidden="true" />
          <div className="page-wrapper">
            <div className="cimbi-promo-grid">
              <div className="cimbi-promo-text">
                <p className="section-eyebrow">
                  <T k="cimbi-eyebrow" /> <T k="new-badge" className="new-text-badge" />
                </p>
                <T k="cimbi-title" as="h2" className="section-heading" />
                <T k="cimbi-desc" as="p" className="section-lead" />
                <ul className="cimbi-promo-list">
                  <T k="cimbi-bullet-1" as="li" />
                  <T k="cimbi-bullet-2" as="li" />
                  <T k="cimbi-bullet-3" as="li" />
                </ul>
              </div>
              <div className="cimbi-promo-chat">
                <img src="/assets/cimbi.svg" alt="Cimbi" className="cimbi-promo-avatar" />
                <div className="cimbi-mock-thread">
                  <div className="cimbi-mock-msg cimbi-mock-user">
                    <T k="cimbi-chat-user" />
                  </div>
                  <div className="cimbi-mock-card">
                    <div className="cimbi-mock-card-title">
                      <T k="cimbi-chat-card-title" />
                    </div>
                    <div className="cimbi-mock-card-sub">
                      <T k="cimbi-chat-card-sub" />
                    </div>
                    <div className="cimbi-mock-apply">
                      <T k="cimbi-chat-apply" />
                    </div>
                  </div>
                  <div className="cimbi-mock-msg cimbi-mock-done">
                    ✓ <T k="cimbi-chat-done" />
                    <span className="cimbi-mock-undo">
                      <T k="cimbi-chat-undo" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PÉLDA POLCCIMKÉK ═══ */}
        <section id="pelda-cimkek" className="page-section">
          <div className="page-wrapper">
            <T k="examples-eyebrow" as="p" className="section-eyebrow" />
            <T k="examples-heading" as="h2" className="section-heading" />
            <T k="examples-lead" as="p" className="section-lead" />

            <div className="labels-preview-grid">
              <div className="label-preview-card">
                <a href="/assets/cimkek.pdf" download="cimkek.pdf" className="label-preview-header">
                  <T k="examples-download" />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
                <div className="label-img-container">
                  <img
                    ref={previewImgRef}
                    src="/assets/labels.jpg"
                    alt="Generált polccímkék - teljes nyomtatási oldal"
                    loading="lazy"
                  />
                </div>
                <T k="examples-caption-1" as="div" className="label-preview-caption" />
              </div>
              <div className="label-preview-card">
                <img src="/assets/label.png" alt="Egy darab polccímke közelről" loading="lazy" />
                <T k="examples-caption-2" as="div" className="label-preview-caption" />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ ÁRAJÁNLAT ═══ */}
        <section id="arajanlat" className="page-section section-alt">
          <div className="page-wrapper">
            <div className="contact-container">
              <T k="contact-form-title" as="h2" className="page-title" />
              <div className="contact-grid">
                <div className="contact-left">
                  {/* Telefonon/tableten az összefoglaló a form ELŐTT áll */}
                  <div className="cfg-summary-mobile">
                    <QuoteSummary cfg={quoteCfg} />
                  </div>
                  <form className="contact-form" onSubmit={(e) => void handleContact(e)}>
                    <div className="form-group">
                      <input type="text" name="name" required maxLength={100} placeholder={t("contact-name")} autoComplete="name" />
                    </div>
                    <div className="form-group">
                      <input
                        type="email"
                        name="email"
                        required
                        maxLength={150}
                        placeholder={t("contact-email")}
                        inputMode="email"
                        autoComplete="email"
                      />
                    </div>
                    <div className="form-group">
                      <input
                        type="tel"
                        name="phone"
                        maxLength={30}
                        placeholder={t("contact-phone")}
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="form-group">
                      <input
                        type="text"
                        name="company"
                        required
                        maxLength={150}
                        placeholder={t("contact-company")}
                        autoComplete="organization"
                      />
                    </div>
                    <QuoteConfiguratorFields cfg={quoteCfg} />
                    {/* Honeypot a botok ellen */}
                    <input
                      type="text"
                      name="_gotcha"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      style={{ position: "absolute", left: -9999, height: 0, width: 0, opacity: 0 }}
                    />
                    <button type="submit" className="contact-submit-btn" disabled={contactBusy}>
                      {contactBusy ? "Sending..." : <T k="contact-submit" />}
                    </button>
                    <p className="contact-privacy-note">
                      <T k="contact-privacy-pre" />
                      <a href="/adatkezeles.html" target="_blank" rel="noopener">
                        <T k="contact-privacy-link" />
                      </a>
                      <T k="contact-privacy-mid" />
                      <a href="/aszf.html" target="_blank" rel="noopener">
                        <T k="contact-terms-link" />
                      </a>
                      <T k="contact-privacy-suf" />
                    </p>
                  </form>
                </div>
                <div className="contact-right">
                  {/* Élő összefoglaló - a konfigurátor állításaira frissül */}
                  <QuoteSummary cfg={quoteCfg} />
                  <div className="contact-info-section">
                    <T k="contact-subtitle-1" as="h3" className="contact-subtitle" />
                    <T k="contact-text-1" as="p" className="contact-text" />
                    <T k="contact-text-2" as="p" className="contact-text" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ══════════ STICKY MOBIL CTA ══════════ */}
      <div className={`mobile-cta-bar${ctaHidden ? " is-hidden" : ""}`}>
        <a href="#arajanlat" className="btn-cta-primary mobile-cta-btn">
          <T k="pricing-cta" />
        </a>
      </div>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="footer-static">
        <div className="footer-inner">
          <p className="contacts">
            <T k="contact-footer-pre" />
            <a href="mailto:info@labellabor.com">info@labellabor.com</a>
          </p>
          <span className="footer-legal-sep">·</span>
          <a href="/impresszum.html" className="footer-legal-link">
            <T k="footer-imprint" />
          </a>
          <span className="footer-legal-sep">·</span>
          <a href="/adatkezeles.html" className="footer-legal-link">
            <T k="footer-privacy" />
          </a>
          <span className="footer-legal-sep">·</span>
          <a href="/aszf.html" className="footer-legal-link">
            <T k="footer-terms" />
          </a>
        </div>
        <T k="footer-copyright" className="footer-copyright" />
        <T k="footer-analytics" className="footer-analytics-note" />
      </footer>

      {/* ══════════ LOGIN MODAL ══════════ */}
      <div
        className={`login-modal-overlay${loginOpen ? " active" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setLoginOpen(false);
        }}
      >
        <div className="login-modal-box">
          <button className="login-modal-close" aria-label="Bezárás" onClick={() => setLoginOpen(false)}>
            ×
          </button>
          <form onSubmit={(e) => void handleLogin(e)}>
            <div className="login-container">
              <div className="label-content">
                <img src="/assets/main_icon.png" alt="Logo" className="label-logo" />
                <div className="inputs">
                  <div className="input-line">
                    <input type="text" name="username" placeholder={t("username")} required maxLength={64} autoComplete="username" />
                  </div>
                  <div className="input-line">
                    <input type="password" name="password" placeholder={t("password")} required maxLength={128} autoComplete="current-password" />
                  </div>
                </div>
                <div className="login-mobile-msg">
                  <T k="desktop-warning" as="p" />
                </div>
                <div className="label-bottom-row">
                  <div className="barcode-container">
                    <img src="/assets/barcode.png" alt="Barcode" />
                  </div>
                  <div className="price-box">
                    <span className="amount">9.900,- Ft</span>
                  </div>
                </div>
              </div>
            </div>
            <a href="#arajanlat" className="login-quote-link" onClick={() => setLoginOpen(false)}>
              <T k="pricing-cta" />
            </a>
            <button type="submit" className="login-button" disabled={loginBusy}>
              {loginBusy ? "Login..." : <T k="login" />}
            </button>
          </form>
        </div>
      </div>

      {/* ══════════ ÉRTESÍTÉS ══════════ */}
      {notification && (
        <div className={`custom-notification ${notification.type}${notificationShown ? " show" : ""}`}>
          <div className="notification-content">
            <span className="notification-icon">{notification.type === "success" ? "✓" : "⚠"}</span>
            <span className="notification-message">{notification.message}</span>
            <button className="notification-close" onClick={() => setNotification(null)}>
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
