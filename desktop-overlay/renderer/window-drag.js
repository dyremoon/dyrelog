(function () {
  var drag = null;
  var suppressClick = false;
  document.addEventListener('pointerdown', function (event) {
    if (event.button !== 0 || !event.target.closest('.header, .mini-bar, .watch-badge')) return;
    if (event.target.closest('button, a, input, select, textarea, .mini-actions, .resize-handle')) return;
    suppressClick = false;
    drag = { target: event.target, pointer: event.pointerId, x: event.screenX, y: event.screenY, moved: false };
    event.target.setPointerCapture(event.pointerId);
    window.dyrelog.dragWindow('start');
    event.preventDefault();
  });
  document.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (Math.hypot(event.screenX - drag.x, event.screenY - drag.y) > 3) drag.moved = true;
    if (drag.moved) window.dyrelog.dragWindow('move');
  });
  function stop() {
    if (!drag) return;
    suppressClick = drag.moved;
    if (drag.target.hasPointerCapture(drag.pointer)) drag.target.releasePointerCapture(drag.pointer);
    drag = null;
    window.dyrelog.dragWindow('end');
  }
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  window.addEventListener('blur', stop);
  document.addEventListener('click', function (event) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
