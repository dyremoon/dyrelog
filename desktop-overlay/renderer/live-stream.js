// Plans live-submission uploads: tracks lines already sent, and splits new lines into batches that each
// cover only a few seconds of in-game time, which is what a genuinely live capture looks like.
(function (root) {
  var MAX_BATCH_GAME_SPAN_MS = 4000;
  var MAX_BATCH_CHARS = 150000;

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
    var maxSpan = (opts && opts.maxSpanMs) || MAX_BATCH_GAME_SPAN_MS;
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
    newSentLines: newSentLines,
    unsentLines: unsentLines,
    markSent: markSent,
    planBatches: planBatches
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LiveStream = api;
})(typeof window !== "undefined" ? window : globalThis);
