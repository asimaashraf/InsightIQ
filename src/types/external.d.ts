declare module 'mammoth/mammoth.browser' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export function getDocument(input: { data: Uint8Array }): { promise: Promise<{
    numPages: number;
    getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }>;
  }> };
}
