export type EmulatorStatus =
  | 'idle'
  | 'preparing_image'
  | 'booting'
  | 'running'
  | 'paused'
  | 'error';

export type IsoVariant = 'generic' | 'eeepc' | 'android9';

export type BootSourceType =
  | 'builtin_generic'
  | 'builtin_eeepc'
  | 'builtin_android9'
  | 'custom_file';

export type WorkbenchTab = 'controls' | 'snapshots' | 'console' | 'images';

export type AndroidHardwareKey =
  | 'back'
  | 'menu'
  | 'home'
  | 'search'
  | 'power'
  | 'volume_up'
  | 'volume_down'
  | 'trackball_up'
  | 'trackball_down'
  | 'trackball_left'
  | 'trackball_right'
  | 'trackball_press'
  | 'enter'
  | 'tab'
  | 'escape'
  | 'ctrl_alt_del';

export interface IsoVariantStatus {
  variant: IsoVariant;
  label: string;
  filename: string;
  description: string;
  available: boolean;
  sizeBytes: number;
  downloading: boolean;
  bytesDownloaded: number;
  totalBytes: number;
  error: string | null;
}

export interface EmulatorDisplayInfo {
  width: number;
  height: number;
  bpp: number;
}

export interface SerialLogEntry {
  id: number;
  timestamp: string;
  text: string;
}

export interface VmSnapshotMeta {
  id: string;
  name: string;
  createdAt: number;
  isoVariant: string;
  memoryMb: number;
  sizeBytes: number;
  thumbnailDataUrl: string | null;
}

export interface VmSnapshotRecord extends VmSnapshotMeta {
  stateBuffer: ArrayBuffer;
}

export interface EmulatorConfig {
  sourceType: BootSourceType;
  memoryMb: 256 | 512 | 1024;
  vgaMemoryMb: 16 | 32;
  customFile: File | null;
  customMediaKind: 'cdrom' | 'hda';
}
