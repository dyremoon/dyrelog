(function () {
  const status = document.getElementById('setup-status');
  const discord = document.getElementById('setup-discord');
  let authenticated = false;
  let busy = false;
  function applyAuth(auth) {
    authenticated = !!auth;
    discord.textContent = authenticated ? 'Finish setup' : 'Log in with Discord';
  }
  window.dyrelog.getAuthState().then(applyAuth).catch(() => {});
  window.dyrelog.onAuthUpdate(applyAuth);
  document.getElementById('setup-yes').addEventListener('click', () => {
    document.getElementById('setup-public').hidden = false;
    discord.focus();
  });
  async function finish(mode) {
    const result = await window.dyrelog.completeFirstRun(mode);
    if (!result.ok) throw new Error(result.error || 'Could not finish setup.');
  }
  document.getElementById('setup-no').addEventListener('click', async () => {
    if (busy) return;
    try { await finish('off'); } catch (err) { status.textContent = err.message; }
  });
  discord.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    discord.disabled = true;
    status.textContent = '';
    try {
      if (!authenticated) {
        const result = await window.dyrelog.loginWithDiscord();
        if (!result.ok) {
          status.textContent = result.cancelled ? 'Login cancelled. Try again, or keep your fights local.' : 'Finish logging in with Discord, then try again.';
          return;
        }
      }
      await finish(document.getElementById('setup-submit-mode').value);
    } catch (err) { status.textContent = err.message; }
    finally { busy = false; discord.disabled = false; }
  });
})();
