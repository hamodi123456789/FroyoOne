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
