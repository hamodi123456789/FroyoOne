export type DeviceMode = 'phone' | 'tv';

export type EmulatorStatus =
  | 'idle'
  | 'preparing_image'
  | 'booting'
  | 'running'
  | 'paused'
  | 'error';

export type IsoVariant = 'generic' | 'eeepc' | 'android7' | 'android8' | 'android9';

export type BootSourceType =
  | 'builtin_generic'
  | 'builtin_eeepc'
  | 'builtin_android7'
  | 'builtin_android8'
  | 'builtin_android9'
  | 'custom_file';

export type WorkbenchTab = 'controls' | 'multiuser' | 'snapshots' | 'console' | 'images';

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
  deviceMode?: DeviceMode;
  memoryMb: number;
  sizeBytes: number;
  thumbnailDataUrl: string | null;
}

export interface VmSnapshotRecord extends VmSnapshotMeta {
  stateBuffer: ArrayBuffer;
}

export interface EmulatorConfig {
  deviceMode: DeviceMode;
  sourceType: BootSourceType;
  memoryMb: 256 | 512 | 1024;
  vgaMemoryMb: 16 | 32;
  customFile: File | null;
  customMediaKind: 'cdrom' | 'hda';
}

export type MultiuserRole = 'none' | 'host' | 'guest';

export type MultiuserConnectionState =
  | 'idle'
  | 'creating'
  | 'joining'
  | 'connecting_p2p'
  | 'connected'
  | 'error';

export interface MultiuserRoomSummary {
  roomId: string;
  serverName: string;
  hostName: string;
  hasPassword: boolean;
  deviceMode: DeviceMode;
  osLabel: string;
  peerCount: number;
  createdAt: number;
}

export interface MultiuserParticipant {
  peerId: string;
  username: string;
  role: 'host' | 'guest';
  color: string;
}

export interface RemoteCursorState {
  peerId: string;
  username: string;
  color: string;
  x: number;
  y: number;
  visible: boolean;
  updatedAt: number;
}

export interface MultiuserChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export type MultiuserDataMessage =
  | {
      type: 'room_state';
      participants: MultiuserParticipant[];
      deviceMode: DeviceMode;
      osLabel: string;
      vmStatus: EmulatorStatus;
    }
  | {
      type: 'profile_update';
      username: string;
    }
  | {
      type: 'cursor';
      peerId?: string;
      username?: string;
      color?: string;
      x: number;
      y: number;
      visible: boolean;
    }
  | {
      type: 'input_mouse_move';
      x: number;
      y: number;
    }
  | {
      type: 'input_mouse_button';
      button: 'left' | 'middle' | 'right';
      down: boolean;
      x: number;
      y: number;
    }
  | {
      type: 'input_mouse_wheel';
      deltaY: number;
    }
  | {
      type: 'input_hw_key';
      key: AndroidHardwareKey;
    }
  | {
      type: 'input_scancodes';
      codes: number[];
    }
  | {
      type: 'chat';
      id: string;
      senderId: string;
      senderName: string;
      senderColor: string;
      text: string;
      timestamp: number;
    };

