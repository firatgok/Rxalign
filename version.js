// Otomatik üretilir (.githooks/pre-commit ve GitHub Actions). Elle düzenlemeyin.
window.APP_VERSION = 'v2.186';
document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('appVersion');
    if (el) el.textContent = window.APP_VERSION;
});
