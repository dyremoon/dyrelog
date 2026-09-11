function createWindowGesture(getWindow, getCursor, limits, persist) {
  let active = null;
  function handle(kind, phase, axes) {
    const win = getWindow();
    if (!win || win.isDestroyed()) { active = null; return; }
    if (phase === 'start') {
      if (active || !['drag', 'resize'].includes(kind)) return;
      if (kind === 'resize' && (!axes || (!axes.width && !axes.height))) return;
      active = { kind, cursor: getCursor(), bounds: win.getBounds(),
        width: !!axes?.width, height: !!axes?.height };
      return;
    }
    if (!active || active.kind !== kind) return;
    if (phase === 'end') { active = null; persist(); return; }
    if (phase !== 'move') return;
    const cursor = getCursor();
    const dx = cursor.x - active.cursor.x, dy = cursor.y - active.cursor.y;
    const initial = active.bounds;
    if (kind === 'drag') {
      win.setPosition(initial.x + dx, initial.y + dy);
    } else {
      const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
      win.setSize(active.width ? clamp(initial.width + dx, limits.minWidth, limits.maxWidth) : initial.width,
        active.height ? clamp(initial.height + dy, limits.minHeight, limits.maxHeight) : initial.height);
    }
  }
  return { handle, cancel() { active = null; }, isActive() { return active !== null; } };
}
module.exports = { createWindowGesture };
