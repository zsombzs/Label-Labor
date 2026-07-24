/** Cloudflare Turnstile minimál típusok (explicit render mód). */
interface TurnstileApi {
  render(container: HTMLElement, params: { sitekey: string; theme?: "light" | "dark" | "auto" }): string;
  getResponse(widgetId: string): string | undefined;
  reset(widgetId: string): void;
}
interface Window {
  turnstile?: TurnstileApi;
}
