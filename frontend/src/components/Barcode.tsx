import { useLayoutEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

/**
 * EAN-13 vonalkód SVG-be renderelve. Hibás vagy hiányzó kód esetén nem renderel
 * semmit (a régi kód is eltávolította az üres SVG-t, mert letakarná a mezőket).
 */
export function Barcode({ value }: { value: string | number | undefined }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    setFailed(false);
    if (!value || !ref.current) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: "EAN13",
        lineColor: "#000",
        width: 1,
        height: 20,
        displayValue: true,
        fontSize: 14,
      });
    } catch {
      console.warn(`Hibás vonalkód (${value}), kihagyva`);
      setFailed(true);
    }
  }, [value]);

  if (!value || failed) return null;
  return (
    <div className="barcode-container">
      <svg className="barcode" ref={ref} />
    </div>
  );
}
