// Exact-host allowlists for links the app opens in the browser and for the Discord login window.
const EXTERNAL_HOSTS = {
  'dyrelog.pages.dev': null,
  'dyrelog-api.dyremoon.workers.dev': null,
  'github.com': /^\/dyremoon\/dyrelog(\/|$)/,
  'eqlwiki.com': null,
  'www.eqlwiki.com': null,
  'eqlegends.com': null,
  'www.eqlegends.com': null,
  'loadoutlegends.com': null,
  'www.loadoutlegends.com': null,
};

const AUTH_HOSTS = new Set([
  'discord.com',
  'www.discord.com',
  'canary.discord.com',
  'ptb.discord.com',
  'dyrelog-api.dyremoon.workers.dev',
  'dyrelog.pages.dev',
]);

function parseHttps(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  let u;
  try { u = new URL(url); } catch (_err) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  return u;
}

function isAllowedExternalUrl(url) {
  const u = parseHttps(url);
  if (!u || !Object.prototype.hasOwnProperty.call(EXTERNAL_HOSTS, u.hostname)) return false;
  const pathRule = EXTERNAL_HOSTS[u.hostname];
  return pathRule ? pathRule.test(u.pathname) : true;
}

function isAllowedAuthNavigation(url) {
  const u = parseHttps(url);
  return !!u && AUTH_HOSTS.has(u.hostname);
}

module.exports = { isAllowedExternalUrl, isAllowedAuthNavigation };
