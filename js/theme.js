// Rxalign v3 - tema: <head> içinde en başta çalışır (ilk boyamadan önce), titreşimi önler.
// Tercih cihaza özeldir: localStorage rx_v3_theme = 'system' | 'light' | 'dark'
(function () {
    var pref = 'system';
    try { pref = localStorage.getItem('rx_v3_theme') || 'system'; } catch (e) { /* yoksay */ }
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
