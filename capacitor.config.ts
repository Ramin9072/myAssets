// پوسته اندروید (APK) که آدرس Vercel شما را در یک WebView باز می‌کند.
// APP_URL را در GitHub (Settings → Variables) تنظیم کنید؛ مثال: https://my-assets.vercel.app
const url = process.env.APP_URL;
if (!url || !/^https:\/\//.test(url)) throw new Error('APP_URL (آدرس https برنامه روی Vercel) تنظیم نشده است.');

export default {
  appId: 'app.myassets.mobile',
  appName: 'دارایی‌های من',
  webDir: 'dist',
  server: { url, cleartext: false },
  android: { allowMixedContent: false },
};
