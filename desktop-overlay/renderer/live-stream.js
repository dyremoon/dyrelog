// Plans live-submission uploads: tracks lines already sent, and splits new lines into batches that each
// cover only a few seconds of in-game time, which is what a genuinely live capture looks like.
(function (root) {
  var MAX_BATCH_GAME_SPAN_MS = 4000;
  var MAX_BATCH_CHARS = 150000;
  // Live uploads go out every 5 s. The server allows a batch to span its real gap since the previous batch
  // plus 5 s, so the first batch of each push may span 8 s; batches sent right behind it stay at 4 s.
  var LIVE_PUSH_INTERVAL_MS = 5000;
  var LIVE_FIRST_BATCH_GAME_SPAN_MS = 8000;

  // Only lines the server's parser uses leave the PC; chat, tells and other log lines never do.
  // Arrow-style tells ("Bob -> You: ...") are chat even when the message reads like combat.
  var ARROW_TELL = /^\[[^\]]*\]\s+\S+ -> \S+:/;
  function combatLines(lines, parseLine) {
    return lines.filter(function (line) {
      if (ARROW_TELL.test(line)) return false;
      var ev = parseLine(line);
      return !!ev && ev.type !== "unmatched";
    });
  }

  function newSentLines() {
    return new Map();
  }

  // Content-based (line + count) so a line inserted earlier in the text is still picked up later.
  function unsentLines(fullText, sent) {
    var remaining = new Map(sent);
    var out = [];
    String(fullText || "").split("\n").forEach(function (line) {
      if (!line) return;
      var n = remaining.get(line) || 0;
      if (n > 0) remaining.set(line, n - 1);
      else out.push(line);
    });
    return out;
  }

  function markSent(chunk, sent) {
    String(chunk || "").split("\n").forEach(function (line) {
      if (line) sent.set(line, (sent.get(line) || 0) + 1);
    });
  }

  // timeOf(line) returns the line's in-game time in ms, or null for lines without one.
  function planBatches(fullText, sent, timeOf, opts) {
    var restSpan = (opts && opts.maxSpanMs) || MAX_BATCH_GAME_SPAN_MS;
    var firstSpan = (opts && opts.firstSpanMs) || restSpan;
    var maxChars = (opts && opts.maxChars) || MAX_BATCH_CHARS;
    var batches = [];
    var lines = [], size = 0, lo = null, hi = null;
    function flush() {
      if (lines.length) batches.push(lines.join("\n"));
      lines = []; size = 0; lo = null; hi = null;
    }
    unsentLines(fullText, sent).forEach(function (line) {
      if (line.length > maxChars) line = line.slice(0, maxChars);
      var t = timeOf(line);
      var nextLo = t == null ? lo : (lo == null ? t : Math.min(lo, t));
      var nextHi = t == null ? hi : (hi == null ? t : Math.max(hi, t));
      var maxSpan = batches.length ? restSpan : firstSpan;
      var tooWide = nextLo != null && nextHi - nextLo > maxSpan;
      if (lines.length && (tooWide || size + 1 + line.length > maxChars)) {
        flush();
        nextLo = t; nextHi = t;
      }
      lines.push(line);
      size += line.length + 1;
      lo = nextLo; hi = nextHi;
    });
    flush();
    return batches;
  }

  var api = {
    MAX_BATCH_GAME_SPAN_MS: MAX_BATCH_GAME_SPAN_MS,
    LIVE_PUSH_INTERVAL_MS: LIVE_PUSH_INTERVAL_MS,
    LIVE_FIRST_BATCH_GAME_SPAN_MS: LIVE_FIRST_BATCH_GAME_SPAN_MS,
    combatLines: combatLines,
    newSentLines: newSentLines,
    unsentLines: unsentLines,
    markSent: markSent,
    planBatches: planBatches
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LiveStream = api;
})(typeof window !== "undefined" ? window : globalThis);
