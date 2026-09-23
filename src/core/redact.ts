const secretFields = /authorization|cookie|token|password|secret|api.?key|session|csrf|email|form.?value/i;
export function redactText(value: string) {
  return value
    .replace(/\b(?:sk[-_](?:live_|test_|proj-|ant-)?[\w-]{8,}|AIza[\w-]{20,}|gh[pousr]_[\w]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie|password|api[_-]?key|access[_-]?token|session[_-]?id|csrf[_-]?token)\s*[:=]\s*)[^\s,;<]+/gi, '$1[REDACTED]')
    .replace(/([?&][^=\s&]+)=([^&\s"'<>]*)/g, '$1=[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .slice(0, 12000);
}
export function scrub(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 200).map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretFields.test(key) ? '[REDACTED]' : scrub(item)]));
  return value;
}
export function publicUrl(value: string) {
  try { const url = new URL(value); url.username = ''; url.password = ''; url.hash = ''; url.search = ''; return url.href; } catch { return '[invalid URL]'; }
}
