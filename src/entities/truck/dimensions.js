/**
 * Every dimension the truck is built from, in one place.
 *
 * These used to be scattered as bare literals through a thousand-line build
 * method, which meant changing the cab length by 0.3 m required hand-editing
 * dozens of unrelated positions. Anything that more than one part needs to
 * agree on belongs here.
 *
 * Convention: +Z is forward, +Y is up, +X is the truck's LEFT.
 */

// --- Running gear ---
export const WHEEL_R = 0.62;      // sized to fill the arches under the body
export const TRACK = 1.09;        // half-distance between left/right wheels
export const AXLE_FRONT = 2.46;
export const AXLE_REAR_A = -1.44;
export const AXLE_REAR_B = -2.74;
export const FRAME_Y = 0.82;      // top of the chassis rail

// --- Cab ---
export const CAB_Z = 1.40;        // rear plane of the cab, world Z
export const CAB_Y = 0.82;        // cab floor, world Y
export const CAB_W = 2.42;
export const CAB_LEN = 1.95;
export const CAB_HW = CAB_W / 2;

// --- Compactor body ---
export const BODY_Z = -3.50;      // rear plane, world Z
export const BODY_Y = 0.84;
export const BODY_W = 2.44;
export const BODY_HW = BODY_W / 2;

// --- Wheel arches. Sized from the tyre, not by eye: at the body's lower edge
// a WHEEL_R tyre is 2*sqrt(WHEEL_R^2 - dy^2) wide, so the opening must exceed
// that or the tyre clips through the arch.
export const REAR_ARCH_R = 0.60;
export const FRONT_ARCH_R = 0.62;
export const FRONT_ARCH_U = AXLE_FRONT - CAB_Z;   // arch position in cab-profile space
