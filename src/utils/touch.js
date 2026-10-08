/**
 * True on a touch-primary device: no fine pointer, no hover — a phone or
 * tablet with no keyboard or mouse attached. A laptop's touchscreen still
 * has a keyboard, so touch support alone (`'ontouchstart' in window`) is not
 * enough to decide this; `pointer`/`hover` describe the primary input
 * mechanism instead of merely what the hardware can do.
 */
export function isTouchPrimary() {
  return typeof matchMedia === 'function'
    && matchMedia('(pointer: coarse) and (hover: none)').matches;
}
