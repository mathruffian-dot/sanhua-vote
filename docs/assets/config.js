// 上線時改這裡：API＝Cloudflare Worker 網址；TURNSTILE_SITEKEY＝Turnstile 的 site key（公開值）
window.SANHUA_CONFIG = {
  API: 'https://sanhua-vote.mathruffian-teaching.workers.dev',
  TURNSTILE_SITEKEY: '',
  VIDEO_URL: 'https://youtu.be/sRW9XTxGd1k',
};
// 本機測試：localhost 開的頁面一律連本機 Worker
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.SANHUA_CONFIG.API = 'http://127.0.0.1:8787';
  window.SANHUA_CONFIG.TURNSTILE_SITEKEY = '';
}
