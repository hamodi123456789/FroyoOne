import type { AndroidHardwareKey } from '../types/emulator';

/**
 * PS/2 Set 1 make/break scancodes mapped to Android-x86 2.2 (Froyo) kernel keycodes.
 * Android-x86 keylayout maps:
 *  - Esc (0x01)           -> KEY_BACK
 *  - Menu (0xE0 0x5D)     -> KEY_MENU (also F1 0x3B)
 *  - Home (0xE0 0x47)     -> KEY_HOME
 *  - Search (0xE0 0x65)   -> KEY_SEARCH (Browser Search)
 *  - Arrows / Enter       -> Trackball / D-Pad navigation
 *  - Vol+/- (0xE0 0x30/2E)-> KEY_VOLUMEUP / KEY_VOLUMEDOWN
 *  - End (0xE0 0x4F)      -> KEY_POWER / Sleep-Wake in Android-x86
 */
const SCANCODE_MAP: Record<AndroidHardwareKey, number[]> = {
  back: [0x01, 0x81],
  menu: [0xe0, 0x5d, 0xe0, 0xdd],
  home: [0xe0, 0x47, 0xe0, 0xc7],
  search: [0xe0, 0x65, 0xe0, 0xe5],
  power: [0xe0, 0x4f, 0xe0, 0xcf],
  volume_up: [0xe0, 0x30, 0xe0, 0xb0],
  volume_down: [0xe0, 0x2e, 0xe0, 0xae],
  trackball_up: [0xe0, 0x48, 0xe0, 0xc8],
  trackball_down: [0xe0, 0x50, 0xe0, 0xd0],
  trackball_left: [0xe0, 0x4b, 0xe0, 0xcb],
  trackball_right: [0xe0, 0x4d, 0xe0, 0xcd],
  trackball_press: [0x1c, 0x9c],
  enter: [0x1c, 0x9c],
  tab: [0x0f, 0x8f],
  escape: [0x01, 0x81],
  ctrl_alt_del: [0x1d, 0x38, 0xe0, 0x53, 0xe0, 0xd3, 0xb8, 0x9d],
};

export function getHardwareKeyScancodes(key: AndroidHardwareKey): number[] {
  return SCANCODE_MAP[key];
}

export const HARDWARE_KEY_DESCRIPTIONS: Record<AndroidHardwareKey, string> = {
  back: 'Back (PS/2 Esc · 0x01)',
  menu: 'Menu (PS/2 AppMenu · E0 5D)',
  home: 'Home (PS/2 Home · E0 47)',
  search: 'Search (PS/2 Search · E0 65)',
  power: 'Sleep / Power (PS/2 End · E0 4F)',
  volume_up: 'Volume Up (PS/2 Vol+ · E0 30)',
  volume_down: 'Volume Down (PS/2 Vol- · E0 2E)',
  trackball_up: 'Trackball Up (PS/2 Up · E0 48)',
  trackball_down: 'Trackball Down (PS/2 Down · E0 50)',
  trackball_left: 'Trackball Left (PS/2 Left · E0 4B)',
  trackball_right: 'Trackball Right (PS/2 Right · E0 4D)',
  trackball_press: 'Trackball Select (PS/2 Enter · 0x1C)',
  enter: 'Enter (0x1C)',
  tab: 'Tab (0x0F)',
  escape: 'Escape (0x01)',
  ctrl_alt_del: 'Ctrl + Alt + Del',
};

// PS/2 Set 1 make codes indexed by KeyboardEvent.code (matching v86's internal keymap)
const KEYBOARD_CODE_TO_PS2: Record<string, number> = {
  Escape: 0x01,
  Digit1: 0x02,
  Digit2: 0x03,
  Digit3: 0x04,
  Digit4: 0x05,
  Digit5: 0x06,
  Digit6: 0x07,
  Digit7: 0x08,
  Digit8: 0x09,
  Digit9: 0x0a,
  Digit0: 0x0b,
  Minus: 0x0c,
  Equal: 0x0d,
  Backspace: 0x0e,
  Tab: 0x0f,
  KeyQ: 0x10,
  KeyW: 0x11,
  KeyE: 0x12,
  KeyR: 0x13,
  KeyT: 0x14,
  KeyY: 0x15,
  KeyU: 0x16,
  KeyI: 0x17,
  KeyO: 0x18,
  KeyP: 0x19,
  BracketLeft: 0x1a,
  BracketRight: 0x1b,
  Enter: 0x1c,
  ControlLeft: 0x1d,
  KeyA: 0x1e,
  KeyS: 0x1f,
  KeyD: 0x20,
  KeyF: 0x21,
  KeyG: 0x22,
  KeyH: 0x23,
  KeyJ: 0x24,
  KeyK: 0x25,
  KeyL: 0x26,
  Semicolon: 0x27,
  Quote: 0x28,
  Backquote: 0x29,
  ShiftLeft: 0x2a,
  Backslash: 0x2b,
  KeyZ: 0x2c,
  KeyX: 0x2d,
  KeyC: 0x2e,
  KeyV: 0x2f,
  KeyB: 0x30,
  KeyN: 0x31,
  KeyM: 0x32,
  Comma: 0x33,
  Period: 0x34,
  Slash: 0x35,
  ShiftRight: 0x36,
  AltLeft: 0x38,
  Space: 0x39,
  CapsLock: 0x3a,
  F1: 0x3b,
  F2: 0x3c,
  F3: 0x3d,
  F4: 0x3e,
  F5: 0x3f,
  F6: 0x40,
  F7: 0x41,
  F8: 0x42,
  F9: 0x43,
  F10: 0x44,
  Home: 0xe047,
  ArrowUp: 0xe048,
  PageUp: 0xe049,
  ArrowLeft: 0xe04b,
  ArrowRight: 0xe04d,
  End: 0xe04f,
  ArrowDown: 0xe050,
  PageDown: 0xe051,
  Insert: 0xe052,
  Delete: 0xe053,
};

export function keyEventCodeToScancodes(code: string, down: boolean): number[] {
  const entry = KEYBOARD_CODE_TO_PS2[code];
  if (!entry) return [];
  if (entry > 0xff) {
    const prefix = entry >> 8;
    const sc = entry & 0xff;
    return [prefix, down ? sc : sc | 0x80];
  }
  return [down ? entry : entry | 0x80];
}

