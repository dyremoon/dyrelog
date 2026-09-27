// Recognizes "server is at its limit" responses and decides whether a kill can still be submitted later.
const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_FIGHT_MS = 20000; // the server requires live streaming for fights this long or longer

function nextUtcMidnight(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

// Spread retries over 10 minutes after the reset so every player doesn't hit the server at once.
function afterReset(now, random = Math.random) {
  return nextUtcMidnight(now) + 60000 + Math.floor(random() * 10 * 60000);
}

// Returns { until, daily } when the response means "stop sending for now", otherwise null.
function parseLimit(status, bodyText, retryAfterHeader, now = Date.now(), random = Math.random) {
  const text = String(bodyText || '');
  let json = null;
  try { json = JSON.parse(text); } catch (_err) { json = null; }
  if (json && json.error === 'daily_limit') {
    const secs = Number(json.retryAfter || retryAfterHeader);
    const until = Number.isFinite(secs) && secs > 0 ? now + secs * 1000 + Math.floor(random() * 10 * 60000) : afterReset(now, random);
    return { until: Math.min(until, now + DAY_MS + 15 * 60000), daily: true };
  }
  // Cloudflare's own pages: 1027 = the Worker's daily request limit, 1015 = short-term rate limiting.
  if (/error code:?\s*1027|\b1027\b.*limit/i.test(text)) return { until: afterReset(now, random), daily: true };
  if (status === 429 || /error code:?\s*1015/i.test(text)) {
    const secs = Number(retryAfterHeader);
    return { until: now + (Number.isFinite(secs) && secs > 0 ? Math.min(secs, 3600) : 60) * 1000, daily: false };
  }
  return null;
}

// Whether a kill that couldn't be sent now can still pass the server's checks when sent later.
// cause is 'limit' (server at its limit) or 'offline' (server unreachable).
function canSubmitLater(payload, cause = 'limit') {
  const duration = Number(payload.endTime) - Number(payload.startTime);
  if (Number.isFinite(duration) && duration < LONG_FIGHT_MS) return { ok: true };
  if (payload.existingSubmissionId && Number(payload.liveBatches) > 0) return { ok: true };
  const why = cause === 'offline'
    ? "Dyrelog couldn't reach its server while this fight was happening."
    : "Dyrelog's server hit its daily limit before this fight could be uploaded live.";
  return {
    ok: false,
    reason: why + " Long fights have to be uploaded while they happen to be verified, so this one can't go on the leaderboard. It's still in your fight history.",
  };
}

function formatResetTime(until) {
  return new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

module.exports = { parseLimit, canSubmitLater, nextUtcMidnight, afterReset, formatResetTime, LONG_FIGHT_MS };
