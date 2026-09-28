// Turns a GitHub release body (Markdown) into plain items for the What's New tab. Stops before the
// install instructions, turns "**What's new**"-style lines into headings and drops Markdown marks.
(function (root) {
  "use strict";

  function parseReleaseNotes(body) {
    var text = String(body || "")
      .replace(/\r/g, "")
      .replace(/<\/(p|li|div|h\d)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    var cut = text.search(/^\s*(---+|#{1,6}\s+How to install)/im);
    if (cut !== -1) text = text.slice(0, cut);

    var items = [];
    var seenHeading = false;
    text.split("\n").forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var heading = /^\*\*[^*]+\*\*:?$/.test(trimmed) || /^#{1,6}\s+\S/.test(trimmed);
      var listItem = /^[-*•]\s+/.test(trimmed);
      var clean = trimmed
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*•]\s+/, "")
        .replace(/\*\*|__|`/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      if (!clean) return;
      if (heading) seenHeading = true;
      items.push({ text: clean, kind: heading ? "heading" : !seenHeading && !listItem ? "intro" : "item" });
    });
    return items;
  }

  var api = { parseReleaseNotes: parseReleaseNotes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReleaseNotes = api;
})(typeof window !== "undefined" ? window : globalThis);
