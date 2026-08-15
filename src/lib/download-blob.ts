/**
 * Hand a generated file to the browser's downloader.
 *
 * Lives on its own rather than inside `pdf-export` (its first caller) because
 * the kiosk QR poster needs the same six lines, and importing them from there
 * would drag the whole PDF builder into the retailer portal's bundle for the
 * sake of one anchor click.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
