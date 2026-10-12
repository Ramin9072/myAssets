// Service worker حداقلی برای قابل‌نصب‌بودن (PWA). هیچ پاسخ /api یا داده مالی‌ای کش نمی‌شود.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api')) return; // مستقیم به شبکه
  // فقط ناوبری صفحه: اگر آفلاین بود پیام ساده بده؛ بقیه عادی از شبکه
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:2rem">اتصال اینترنت برقرار نیست. برنامه برای دریافت قیمت‌ها و داده‌ها آنلاین لازم است.</body>', { headers: { 'content-type': 'text/html; charset=utf-8' } })));
  }
});
