const botBase = () => {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return 'https://gorillapunch.run';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};
export const botUserAgent = () => `GorillaPunchBot/1.0 (+${new URL('/bot', botBase()).href})`;
