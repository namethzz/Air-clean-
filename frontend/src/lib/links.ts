/** A link typed by someone else, only when it is an http(s) address; anything else (javascript:, data:) is dropped. */
export function webLink(value?: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value.trim()); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; }
  catch { return null; }
}
