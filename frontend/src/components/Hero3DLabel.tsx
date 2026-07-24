import { useEffect, useRef } from "react";
import { T } from "../i18n/LanguageContext";

/**
 * 3D-ben forgatható polccímke a #bemutatkozas tetején (hook).
 * - Az előlap a /assets/label3d.png kép (a minta-polccímke).
 * - Magától lassan forog; egérrel/ujjal megfogható, lendülettel pörgethető.
 * - `prefers-reduced-motion` esetén nincs automatikus forgás.
 * - Mobilon `touch-action: pan-y`: függőleges görgetés működik a sáv felett,
 *   vízszintes húzás forgat.
 */
export function Hero3DLabel() {
  const heroRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const card = cardRef.current;
    const glare = glareRef.current;
    const shadow = shadowRef.current;
    if (!hero || !card || !glare || !shadow) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SPIN = 0.12; // lassú automatikus forgás (fok/frame)

    let rx = -6;
    let ry = 18;
    let vx = 0;
    let vy = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;

    const apply = () => {
      card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      const gx = 50 - ((((ry % 360) + 360) % 360) - 180) / 3.6;
      glare.style.backgroundPosition = `${gx}% ${50 - rx}%`;

      // A padló-árnyék minden irányú forgatást követ:
      // élben keskenyebb, döntéskor zsugorodik/tolódik és halványul
      const rxr = (rx * Math.PI) / 180;
      const ryr = (ry * Math.PI) / 180;
      const cosY = Math.abs(Math.cos(ryr));
      const cosX = Math.abs(Math.cos(rxr));
      const sx = 0.45 + 0.55 * cosY;
      const sy = 0.55 + 0.45 * cosX;
      const ty = Math.sin(rxr) * -12;
      const op = 0.45 + 0.55 * (cosX * 0.65 + cosY * 0.35);
      shadow.style.transform = `translateX(-50%) translateY(${ty}px) scale(${sx}, ${sy})`;
      shadow.style.opacity = String(op);
    };

    const frame = () => {
      if (!dragging) {
        ry += vx;
        rx += vy;
        vx *= 0.95;
        vy *= 0.95;
        if (!reduced) ry += SPIN; // magától, lassan forog
        rx = Math.max(-70, Math.min(70, rx)) * 0.995 + -6 * 0.005; // finoman visszaáll
      }
      apply();
      raf = requestAnimationFrame(frame);
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      vx = 0;
      vy = 0;
      hero.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      ry += dx * 0.45;
      rx = Math.max(-70, Math.min(70, rx - dy * 0.3));
      vx = dx * 0.18;
      vy = -dy * 0.1;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };

    hero.addEventListener("pointerdown", onDown);
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerup", onUp);
    hero.addEventListener("pointercancel", onUp);
    hero.addEventListener("pointerleave", onUp);

    apply();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      hero.removeEventListener("pointerdown", onDown);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerup", onUp);
      hero.removeEventListener("pointercancel", onUp);
      hero.removeEventListener("pointerleave", onUp);
    };
  }, []);

  return (
    <div className="hero3d" ref={heroRef}>
      <div className="hero3d-hook">
        <T k="hero3d-hook" as="h2" className="hero3d-title" />
      </div>

      <div className="hero3d-stage">
        <div className="hero3d-card" ref={cardRef}>
          {/* ── Előlap: a minta-polccímke képe ── */}
          <div className="h3d-face h3d-front">
            <img src="/assets/label3d.png" alt="Példa polccímke - Prémium Beltéri Fehér Festék" draggable={false} />
            <div className="h3d-glare" ref={glareRef}></div>
          </div>
          {/* ── Hátlap: papír + halvány szürke logó és felirat ── */}
          <div className="h3d-face h3d-back">
            <img src="/assets/main_icon.png" alt="" draggable={false} />
            <span className="h3d-brand">labellabor.com</span>
          </div>
        </div>
        <div className="hero3d-shadow" ref={shadowRef}></div>
      </div>
    </div>
  );
}
