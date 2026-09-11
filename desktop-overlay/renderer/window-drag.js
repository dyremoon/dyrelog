(function () {
  var drag = null;
  var suppressClick = false;
  function isDragSurface(event) {
    if (event.target.closest('.header, .mini-bar, .watch-badge')) return true;
    if (document.body.matches('.mini, .watch')) return false;
    var header = document.querySelector('.header');
    return header && (event.target === document.body || event.target.id === 'card') &&
      event.clientY <= header.getBoundingClientRect().bottom;
  }
  function send(phase) {
    if (drag.kind === 'resize') window.dyrelog.resizeWindow(phase, drag.axes);
    else window.dyrelog.dragWindow(phase);
  }
  document.addEventListener('pointerdown', function (event) {
    if (drag || event.button !== 0 || event.isPrimary === false) return;
    var handle = event.target.closest('.resize-handle');
    if (!handle && (!isDragSurface(event) || event.target.closest('button, a, input, select, textarea, [role="button"], [contenteditable], .mini-actions, .update-banner'))) return;
    suppressClick = false;
    drag = { kind: handle ? 'resize' : 'drag', target: event.target,
      pointer: event.pointerId, x: event.screenX, y: event.screenY, moved: false,
      axes: handle ? { width: handle.id !== 'rh-bottom', height: handle.id !== 'rh-right' } : null };
    event.target.setPointerCapture(event.pointerId);
    send('start');
    event.preventDefault();
  });
  document.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!(event.buttons & 1)) { stop(event); return; }
    if (Math.hypot(event.screenX - drag.x, event.screenY - drag.y) > 3) drag.moved = true;
    if (drag.moved) send('move');
  });
  function stop(event) {
    if (!drag) return;
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointer) return;
    suppressClick = !!(drag.moved && event && event.type === 'pointerup');
    send('end');
    var ended = drag;
    drag = null;
    if (ended.target.hasPointerCapture(ended.pointer)) ended.target.releasePointerCapture(ended.pointer);
    setTimeout(function () { suppressClick = false; }, 0);
  }
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  document.addEventListener('lostpointercapture', stop);
  window.addEventListener('blur', stop);
  document.addEventListener('click', function (event) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
