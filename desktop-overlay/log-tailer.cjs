// Polls one log file and emits only newly appended text; one read at a time, stale reads dropped after stop().
const fs = require('node:fs');
const { StringDecoder } = require('node:string_decoder');

function createLogTailer({ filePath, onChunk, onStatus, intervalMs = 1000, fsImpl = fs }) {
  let stopped = false;
  let reading = false;
  let offset = null;
  let missing = false;
  let decoder = new StringDecoder('utf8');

  function status(s) { if (!stopped) onStatus(s); }

  function tick() {
    if (stopped || reading) return;
    reading = true;
    fsImpl.stat(filePath, function (err, st) {
      if (stopped) return;
      if (err || !st.isFile()) {
        reading = false;
        if (!missing) { missing = true; status({ ok: false, waiting: true }); }
        return;
      }
      if (offset === null || missing) {
        // A file that appears after we started waiting is read from the top; otherwise skip old history.
        offset = missing ? 0 : st.size;
        missing = false;
        decoder = new StringDecoder('utf8');
        status({ ok: true });
      }
      if (st.size < offset) { offset = 0; decoder = new StringDecoder('utf8'); }
      if (st.size <= offset) { reading = false; return; }
      const end = st.size;
      const chunks = [];
      const stream = fsImpl.createReadStream(filePath, { start: offset, end: end - 1 });
      stream.on('data', function (c) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
      stream.on('end', function () {
        reading = false;
        if (stopped) return;
        offset = end;
        const text = decoder.write(Buffer.concat(chunks));
        if (text) onChunk(text);
      });
      stream.on('error', function () { reading = false; });
    });
  }

  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  tick();

  return {
    filePath,
    tick,
    stop() { stopped = true; clearInterval(timer); },
  };
}

module.exports = { createLogTailer };
