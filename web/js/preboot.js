(function () {
  var theme = 'dark';
  try {
    var raw = localStorage.getItem('sana.settings.v1');
    if (raw) theme = JSON.parse(raw).theme || 'dark';
  } catch (e) {}
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  try {
    if (localStorage.getItem('sana.onboarded.v1') === '1') {
      document.documentElement.classList.add('onboarded');
    }
  } catch (e) {}
  try {
    if (window.SanaNative) {
      window.SANA_NATIVE = true;
      var base = window.SanaNative.getApiBase && window.SanaNative.getApiBase();
      if (base) window.SANA_API_BASE = base;
    }
  } catch (e) {}
})();
