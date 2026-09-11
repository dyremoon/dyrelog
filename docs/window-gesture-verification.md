# Overlay movement verification

The packaged 0.1.10 renderer installs resize mousemove/mouseup listeners only after an asynchronous getBounds call resolves. Releasing the mouse while that call is pending leaves the subsequently installed resize listener active. It does not check the mouse buttons or cancel on blur. A deterministic reproduction using that handler grew a 320x180 window to 340x190, 360x200 and 380x210 on later movement with no button pressed.

The stylesheet's final no-drag rule overrides its earlier native drag declarations. The effective drag regions were therefore not simultaneously native and custom. Bounds persistence reads the settled window bounds and never calls a setter. Normal custom dragging calls setPosition; the stale resize handler was the path that called setBounds during unrelated movement.

The renderer now uses one pointer-captured gesture controller for window dragging and resize handles. It ends on pointerup, cancellation, lost capture, blur or a missing left-button state. The main process owns one gesture at a time, uses screen coordinates in DIPs, moves with setPosition and resizes with setSize. Generic setBounds requests cannot interrupt an active gesture. Standard mode accepts dragging from the empty top margin. Mini/Circle drag surfaces and non-draggable controls remain supported.

Validation passed:

- 1,000 simulated drag moves preserved width and height.
- Each resize handle changed only its requested dimensions, preserving x/y.
- Competing gestures and post-release movement were ignored.
- Headless browser checks exercised the actual renderer/CSS in Standard, Mini and Circle modes, the empty top margin, controls, all resize handles and lost-button cancellation.
- 21 desktop tests and 68 worker tests passed.
- The separate comment cleanup changed no executable syntax or non-comment tokens; hashes are recorded in comment-cleanup-verification.json.

The existing installer was inspected, not overwritten. Native in-game and mixed-monitor DPI testing has not been performed on a rebuilt installer.
