(async function () {
  const checkbox = document.getElementById('allow-usage-analytics');
  const status = document.getElementById('usage-analytics-status');
  function display(settings) {
    checkbox.checked = settings.analyticsConsent?.version === 1 && settings.analyticsConsent.enabled === true;
    status.textContent = checkbox.checked ? 'Allowed. Future reports can be stopped here at any time.' : 'Off. No usage analytics are sent.';
  }
  try { display(await window.dyrelog.getSettings()); checkbox.disabled = false; }
  catch { status.textContent = 'Could not load your preference. Usage analytics remains off unless previously allowed.'; }
  checkbox.addEventListener('change', async function () {
    checkbox.disabled = true;
    try { display(await window.dyrelog.setAnalyticsConsent(checkbox.checked)); }
    catch {
      try { display(await window.dyrelog.getSettings()); } catch { checkbox.checked = false; }
      status.textContent = 'Could not save this change. Your previous preference still applies. Please try again.';
    } finally { checkbox.disabled = false; }
  });
})();
