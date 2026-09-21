/**
 * True on a touch-primary device (phone/tablet), where the on-screen driving
 * controls should appear and the keyboard hints should not. `pointer: coarse`
 * reflects the primary pointer's precision rather than merely the presence of
 * a touchscreen, so a laptop with a touch display but a trackpad/mouse as the
 * primary pointer is correctly treated as a keyboard device.
 */
export function isTouchDevice() {
  return !!window.matchMedia?.('(pointer: coarse)').matches;
}
