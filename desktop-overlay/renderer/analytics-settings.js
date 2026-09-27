(async function () {
  const checkbox = document.getElementById('allow-usage-analytics');
  const status = document.getElementById('usage-analytics-status');
  function display(settings) {
    checkbox.checked = settings.analyticsConsent?.version === 1 && settings.analyticsConsent.enabled === true;
    status.textContent = checkbox.checked ? 'On. Untick to stop sending.' : 'Off. Nothing is sent.';
  }
  try { display(await window.dyrelog.getSettings()); checkbox.disabled = false; }
  catch { status.textContent = 'Couldn\'t load this setting. It stays off unless you turned it on before.'; }
  checkbox.addEventListener('change', async function () {
    checkbox.disabled = true;
    try { display(await window.dyrelog.setAnalyticsConsent(checkbox.checked)); }
    catch {
      try { display(await window.dyrelog.getSettings()); } catch { checkbox.checked = false; }
      status.textContent = 'Couldn\'t save that. Your previous choice still applies. Try again.';
    } finally { checkbox.disabled = false; }
  });
})();
