# Overlay movement verification

The packaged 0.1.10 renderer installs resize mousemove/mouseup listeners only after an asynchronous getBounds call resolves. Releasing the mouse while that call is pending leaves the subsequently installed resize listener active. It does not check the mouse buttons or cancel on blur. A deterministic reproduction using that handler grew a 320x180 window to 340x190, 360x200 and 380x210 on later movement with no button pressed.

The stylesheet's final no-drag rule overrides its earlier native drag declarations. The effective drag regions were therefore not simultaneously native and custom. Bounds persistence reads the settled window bounds and never calls a setter. Normal custom dragging calls setPosition; the stale resize handler was the path that called setBounds during unrelated movement.

The renderer now uses one pointer-captured gesture controller for window dragging and resize handles. It ends on pointerup, cancellation, lost capture, blur or a missing left-button state. The main process owns one gesture at a time and uses screen coordinates in DIPs. Dragging supplies full bounds with dimensions captured at gesture start; resizing uses setSize. Generic renderer setBounds requests cannot interrupt an active gesture. Standard mode accepts dragging from the empty top margin. Mini/Circle drag surfaces and non-draggable controls remain supported.

Validation passed:

- 1,000 simulated drag moves preserved width and height.
- Each resize handle changed only its requested dimensions, preserving x/y.
- Competing gestures and post-release movement were ignored.
- Headless browser checks exercised the actual renderer/CSS in Standard, Mini and Circle modes, the empty top margin, controls, all resize handles and lost-button cancellation.
- 21 desktop tests and 68 worker tests passed.
- The separate comment cleanup changed no executable syntax or non-comment tokens; hashes are recorded in comment-cleanup-verification.json.

The existing installer was inspected, not overwritten. Native in-game and mixed-monitor DPI testing has not been performed on a rebuilt installer.

## Follow-up for 0.1.14

The local unpacked 0.1.14 package contains the pointer gesture controller, but still moves with setPosition. Electron has a historical report of repeated setPosition calls growing windows at fractional display scaling: https://github.com/electron/electron/issues/9477. This is a candidate explanation for the continued report, not a confirmed reproduction on the affected machine.

Dragging now passes the original width and height on every move so native size rounding cannot feed into the next move. A regression test models native setters returning dimensions one DIP larger than requested and verifies 1,000 moves stay bounded instead of accumulating growth. All 24 desktop tests pass. The earlier zero-drift mock could not detect this problem.

Before releasing an installer, verify prolonged header dragging in Standard, Mini and Circle modes at 100%, 125% and 150% Windows scaling, including movement between differently scaled displays. Check each resize handle and releasing outside the window. Native DPI verification remains outstanding; no replacement installer has been built or deployed for this follow-up.
