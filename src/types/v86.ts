export type V86Image =
  | {
      url: string;
      async: true;
      size: number;
      use_parts?: boolean;
      fixed_chunk_size?: number;
    }
  | {
      url: string;
      async?: false;
    }
  | {
      buffer: ArrayBuffer;
    };

export interface V86EventMap {
  '9p-attach': void;
  'download-error': {
    file_index: number;
    file_count: number;
    file_name: string;
    request: unknown;
  };
  'download-progress': {
    file_index: number;
    file_count: number;
    file_name: string;
    lengthComputable: boolean;
    total: number;
    loaded: number;
  };
  'emulator-loaded': void;
  'emulator-ready': void;
  'emulator-started': void;
  'emulator-stopped': void;
  'mouse-enable': boolean;
  'screen-set-size': [width: number, height: number, bpp: number];
  'serial0-output-byte': number;
}

export interface V86Options {
  wasm_path?: string;
  memory_size?: number;
  vga_memory_size?: number;
  autostart?: boolean;
  disable_keyboard?: boolean;
  disable_mouse?: boolean;
  disable_speaker?: boolean;
  bios?: V86Image;
  vga_bios?: V86Image;
  hda?: V86Image;
  hdb?: V86Image;
  fda?: V86Image;
  fdb?: V86Image;
  cdrom?: V86Image;
  screen_container?: HTMLElement | null;
  acpi?: boolean;
  boot_order?: number;
  fastboot?: boolean;
  disable_jit?: boolean;
  uart1?: boolean;
  net_device?: {
    type?: 'ne2k' | 'virtio';
    relay_url?: string;
    id?: number;
    masquerade?: boolean;
  };
}

export interface V86 {
  run(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  restart(): void;
  add_listener<T extends keyof V86EventMap>(
    event: T,
    listener: (argument: V86EventMap[T]) => void
  ): void;
  remove_listener<T extends keyof V86EventMap>(
    event: T,
    listener: (argument: V86EventMap[T]) => void
  ): void;
  restore_state(state: ArrayBuffer): Promise<void>;
  save_state(): Promise<ArrayBuffer>;
  get_instruction_counter(): number;
  is_running(): boolean;
  keyboard_send_scancodes(codes: number[]): void;
  keyboard_send_keys(codes: number[]): void;
  keyboard_send_text(str: string): void;
  lock_mouse(): void;
  mouse_set_enabled(enabled: boolean): void;
  keyboard_set_enabled(enabled: boolean): void;
  serial0_send(data: string): void;
}
