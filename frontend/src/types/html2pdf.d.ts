declare module "html2pdf.js" {
  interface Html2PdfChain {
    set(opt: Record<string, unknown>): Html2PdfChain;
    from(element: HTMLElement): Html2PdfChain;
    toPdf(): Html2PdfChain;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(key: string): Promise<any> & Html2PdfChain;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(cb: (value: any) => void): Html2PdfChain;
    save(): Promise<void>;
  }
  function html2pdf(): Html2PdfChain;
  export default html2pdf;
}
