import { useCallback, useEffect, useRef, useState } from 'react';
import type { V86 as V86Instance, V86Options } from 'v86';
import {
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  saveSnapshot,
} from '../services/snapshotDb';
import type {
  AndroidHardwareKey,
  BootSourceType,
  DeviceMode,
  EmulatorConfig,
  EmulatorDisplayInfo,
  EmulatorStatus,
  IsoVariant,
  IsoVariantStatus,
  SerialLogEntry,
  VmSnapshotMeta,
  VmSnapshotRecord,
} from '../types/emulator';
import { getHardwareKeyScancodes } from '../utils/scancodes';

const MAX_SERIAL_LINES = 800;

type V86Constructor = new (opts: V86Options) => V86Instance;

let v86LoadPromise: Promise<V86Constructor> | null = null;

function loadV86Runtime(): Promise<V86Constructor> {
  const win = window as unknown as { V86?: V86Constructor };
  if (win.V86) {
    return Promise.resolve(win.V86);
  }
  if (v86LoadPromise) {
    return v86LoadPromise;
  }

  v86LoadPromise = new Promise<V86Constructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-v86-runtime="true"]');
    if (existing) {
      existing.addEventListener('load', () => {
        if (win.V86) resolve(win.V86);
        else reject(new Error('v86 runtime loaded without exposing window.V86.'));
      });
      existing.addEventListener('error', () => {
        v86LoadPromise = null;
        reject(new Error('Failed to load /v86/libv86.js runtime script.'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = '/v86/libv86.js';
    script.async = true;
    script.dataset.v86Runtime = 'true';
    script.onload = () => {
      if (win.V86) {
        resolve(win.V86);
      } else {
        v86LoadPromise = null;
        reject(new Error('v86 runtime loaded without exposing window.V86.'));
      }
    };
    script.onerror = () => {
      v86LoadPromise = null;
      reject(new Error('Failed to load /v86/libv86.js runtime script.'));
    };
    document.head.appendChild(script);
  });

  return v86LoadPromise;
}

function formatTimeNow(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

export function useAndroidEmulator(screenRef: React.RefObject<HTMLDivElement | null>) {
  const emulatorRef = useRef<V86Instance | null>(null);
  const serialBufferRef = useRef<string>('');
  const serialIdRef = useRef<number>(1);
  const lastCounterRef = useRef<number>(0);
  const remoteMouseButtonsRef = useRef<[boolean, boolean, boolean]>([false, false, false]);

  const [status, setStatus] = useState<EmulatorStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('Ready to boot Android 2.2 (Froyo)');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<EmulatorConfig>({
    deviceMode: 'phone',
    sourceType: 'builtin_generic',
    memoryMb: 512,
    vgaMemoryMb: 16,
    customFile: null,
    customMediaKind: 'cdrom',
  });

  const [isoCatalog, setIsoCatalog] = useState<Record<IsoVariant, IsoVariantStatus> | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    loaded: number;
    total: number;
    label: string;
  } | null>(null);

  const [displayInfo, setDisplayInfo] = useState<EmulatorDisplayInfo>({
    width: 720,
    height: 400,
    bpp: 0,
  });
  const [ips, setIps] = useState<number>(0);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [pointerLocked, setPointerLocked] = useState<boolean>(false);
  const [mouseEnabled, setMouseEnabled] = useState<boolean>(true);
  const [keyboardEnabled, setKeyboardEnabled] = useState<boolean>(true);
  const [serialLines, setSerialLines] = useState<SerialLogEntry[]>([]);
  const [snapshots, setSnapshots] = useState<VmSnapshotMeta[]>([]);
  const [snapshotBusy, setSnapshotBusy] = useState<boolean>(false);

  const fetchIsoCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/iso/status');
      if (!res.ok) return null;
      const data = (await res.json()) as { variants: IsoVariantStatus[] };
      const byVariant = new Map(data.variants.map((v) => [v.variant, v]));
      const generic = byVariant.get('generic');
      const eeepc = byVariant.get('eeepc');
      const android7 = byVariant.get('android7');
      const android8 = byVariant.get('android8');
      const android9 = byVariant.get('android9');
      if (!generic || !eeepc || !android7 || !android8 || !android9) {
        return null;
      }
      const map: Record<IsoVariant, IsoVariantStatus> = {
        generic,
        eeepc,
        android7,
        android8,
        android9,
      };
      setIsoCatalog(map);
      return map;
    } catch {
      return null;
    }
  }, []);

  const refreshSnapshots = useCallback(async () => {
    try {
      const items = await listSnapshots();
      setSnapshots(items);
    } catch {
      // IndexedDB unavailable in private sandbox
    }
  }, []);

  useEffect(() => {
    void fetchIsoCatalog();
    void refreshSnapshots();
  }, [fetchIsoCatalog, refreshSnapshots]);

  // Pointer lock tracking
  useEffect(() => {
    const onLockChange = () => {
      setPointerLocked(Boolean(document.pointerLockElement));
    };
    document.addEventListener('pointerlockchange', onLockChange);
    return () => document.removeEventListener('pointerlockchange', onLockChange);
  }, []);

  // IPS & uptime telemetry loop while VM is running
  useEffect(() => {
    if (status !== 'running' && status !== 'booting') {
      setIps(0);
      return;
    }
    const timer = window.setInterval(() => {
      const vm = emulatorRef.current;
      if (!vm || !vm.is_running()) return;
      const current = vm.get_instruction_counter();
      const delta = Math.max(0, current - lastCounterRef.current);
      lastCounterRef.current = current;
      setIps(delta);
      setUptimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const appendSerialLine = useCallback((rawLine: string) => {
    const cleaned = rawLine.replace(/\r/g, '');
    if (!cleaned.trim()) return;
    setSerialLines((prev) => {
      const next = [
        ...prev,
        {
          id: serialIdRef.current++,
          timestamp: formatTimeNow(),
          text: cleaned,
        },
      ];
      return next.length > MAX_SERIAL_LINES ? next.slice(-MAX_SERIAL_LINES) : next;
    });
  }, []);

  const destroyVm = useCallback(async () => {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
    const vm = emulatorRef.current;
    emulatorRef.current = null;
    if (vm) {
      try {
        await vm.destroy();
      } catch {
        // ignore destroy errors
      }
    }
    lastCounterRef.current = 0;
    setIps(0);
    setUptimeSeconds(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void destroyVm();
    };
  }, [destroyVm]);

  const prepareBuiltinIso = useCallback(
    async (variant: IsoVariant): Promise<IsoVariantStatus> => {
      const res = await fetch('/api/iso/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant }),
      });
      if (!res.ok) {
        throw new Error(`Failed to initiate ISO download (HTTP ${res.status})`);
      }

      let current = (await res.json()) as IsoVariantStatus;
      setDownloadProgress({
        loaded: current.bytesDownloaded,
        total: current.totalBytes || current.sizeBytes,
        label: current.filename,
      });

      while (!current.available) {
        if (current.error) {
          throw new Error(current.error);
        }
        await new Promise((r) => window.setTimeout(r, 450));
        const poll = await fetch(`/api/iso/status?variant=${variant}`);
        if (!poll.ok) {
          throw new Error('Lost connection while polling Android image cache.');
        }
        current = (await poll.json()) as IsoVariantStatus;
        setDownloadProgress({
          loaded: current.bytesDownloaded,
          total: current.totalBytes || current.sizeBytes,
          label: current.filename,
        });
      }

      await fetchIsoCatalog();
      return current;
    },
    [fetchIsoCatalog]
  );

  const launchVm = useCallback(
    async (overrideConfig?: Partial<EmulatorConfig>, initialStateBuffer?: ArrayBuffer) => {
      const effectiveConfig: EmulatorConfig = {
        ...config,
        ...overrideConfig,
      };
      const modeChanged = effectiveConfig.deviceMode !== config.deviceMode;
      if (overrideConfig) {
        setConfig(effectiveConfig);
      }

      setErrorMessage(null);
      await destroyVm();

      if (modeChanged) {
        // Wait for React to swap NexusOneShell <-> TvMonitorShell so screenRef.current points to the active shell container
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
        });
      }

      if (!screenRef.current) {
        setStatus('error');
        setErrorMessage('Emulator display mount is unavailable.');
        return;
      }

      // Ensure clean screen_container DOM structure for v86
      const host = screenRef.current;
      host.innerHTML = '';
      const textLayer = document.createElement('div');
      textLayer.style.whiteSpace = 'pre';
      textLayer.style.font = '14px monospace';
      textLayer.style.lineHeight = '14px';
      const canvasLayer = document.createElement('canvas');
      canvasLayer.style.display = 'none';
      host.appendChild(textLayer);
      host.appendChild(canvasLayer);

      serialBufferRef.current = '';
      setSerialLines([]);

      try {
        let cdromConfig: V86Options['cdrom'];
        let hdaConfig: V86Options['hda'];
        let bootOrder = 0x213; // CD-ROM -> Floppy -> Hard disk

        const getOsLabel = (src: BootSourceType): string => {
          switch (src) {
            case 'builtin_android7':
              return 'Android 7.1 (Nougat)';
            case 'builtin_android8':
              return 'Android 8.1 (Oreo)';
            case 'builtin_android9':
              return 'Android 9 (Pie)';
            case 'custom_file':
              return effectiveConfig.customFile?.name || 'Custom Image';
            default:
              return 'Android 2.2 (Froyo)';
          }
        };

        if (effectiveConfig.sourceType === 'custom_file') {
          if (!effectiveConfig.customFile) {
            throw new Error('Select a local .iso or .img file before booting.');
          }
          setStatus('preparing_image');
          setStatusDetail(`Reading ${effectiveConfig.customFile.name}...`);
          const buffer = await effectiveConfig.customFile.arrayBuffer();
          if (effectiveConfig.customMediaKind === 'hda') {
            hdaConfig = { buffer };
            bootOrder = 0x132;
          } else {
            cdromConfig = { buffer };
            bootOrder = 0x213;
          }
        } else {
          const variant: IsoVariant =
            effectiveConfig.sourceType === 'builtin_android7'
              ? 'android7'
              : effectiveConfig.sourceType === 'builtin_android8'
              ? 'android8'
              : effectiveConfig.sourceType === 'builtin_android9'
              ? 'android9'
              : effectiveConfig.sourceType === 'builtin_eeepc'
              ? 'eeepc'
              : 'generic';
          const osDisplayName = getOsLabel(effectiveConfig.sourceType);
          setStatus('preparing_image');
          setStatusDetail(`Caching genuine ${osDisplayName} ISO...`);
          const cached = await prepareBuiltinIso(variant);
          cdromConfig = {
            url: `/api/iso/file/${variant}`,
            size: cached.sizeBytes,
            async: true,
          };
          bootOrder = 0x213;
        }

        const activeOsLabel = getOsLabel(effectiveConfig.sourceType);

        setDownloadProgress(null);
        setStatus('booting');
        setStatusDetail('Initializing x86 WebAssembly VM & SeaBIOS...');

        const options: V86Options = {
          wasm_path: '/v86/v86.wasm',
          bios: { url: '/v86/seabios.bin' },
          vga_bios: { url: '/v86/vgabios.bin' },
          screen_container: host,
          memory_size: effectiveConfig.memoryMb * 1024 * 1024,
          vga_memory_size: effectiveConfig.vgaMemoryMb * 1024 * 1024,
          boot_order: bootOrder,
          acpi: true,
          autostart: true,
          disable_keyboard: false,
          disable_mouse: false,
          disable_speaker: true,
          uart1: false,
          ...(cdromConfig ? { cdrom: cdromConfig } : {}),
          ...(hdaConfig ? { hda: hdaConfig } : {}),
          ...(initialStateBuffer ? { initial_state: { buffer: initialStateBuffer } } : {}),
        };

        const V86Ctor = await loadV86Runtime();
        const vm = new V86Ctor(options);
        emulatorRef.current = vm;

        vm.add_listener('emulator-ready', () => {
          setStatus('running');
          setStatusDetail(
            initialStateBuffer
              ? `Snapshot restored — ${activeOsLabel} active`
              : `Booting ${activeOsLabel} Live CD`
          );
          appendSerialLine(`[FroyoOne] x86 WebAssembly VM initialized (${activeOsLabel})`);
        });

        vm.add_listener('emulator-started', () => {
          setStatus('running');
        });

        vm.add_listener('emulator-stopped', () => {
          setStatus((prev) => (prev === 'idle' || prev === 'error' ? prev : 'paused'));
        });

        vm.add_listener('screen-set-size', ([width, height, bpp]) => {
          setDisplayInfo({ width, height, bpp });
          if (bpp > 0) {
            setStatusDetail(`${activeOsLabel} graphics active (${width}×${height} · ${bpp}-bit)`);
          }
        });

        vm.add_listener('download-progress', (ev) => {
          if (ev.total > 0) {
            setDownloadProgress({
              loaded: ev.loaded,
              total: ev.total,
              label: ev.file_name || 'BIOS / Image',
            });
          }
        });

        vm.add_listener('download-error', (ev) => {
          setStatus('error');
          setErrorMessage(`Failed to load ${ev.file_name || 'emulator asset'}.`);
        });

        vm.add_listener('serial0-output-byte', (byte) => {
          const ch = String.fromCharCode(byte);
          if (ch === '\n') {
            const line = serialBufferRef.current;
            serialBufferRef.current = '';
            appendSerialLine(line);
          } else {
            serialBufferRef.current += ch;
            if (serialBufferRef.current.length > 240) {
              const line = serialBufferRef.current;
              serialBufferRef.current = '';
              appendSerialLine(line);
            }
          }
        });
      } catch (err) {
        setDownloadProgress(null);
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to initialize Android 2.2 VM.'
        );
      }
    },
    [appendSerialLine, config, destroyVm, prepareBuiltinIso, screenRef]
  );

  const powerOff = useCallback(async () => {
    await destroyVm();
    if (screenRef.current) {
      screenRef.current.innerHTML = '';
    }
    setDownloadProgress(null);
    setErrorMessage(null);
    setDisplayInfo({ width: 720, height: 400, bpp: 0 });
    setStatus('idle');
    setStatusDetail('Emulator powered off');
  }, [destroyVm, screenRef]);

  const switchDeviceMode = useCallback(
    async (mode: DeviceMode) => {
      if (mode === config.deviceMode) return;
      if (
        status === 'preparing_image' ||
        status === 'booting' ||
        status === 'running' ||
        status === 'paused'
      ) {
        await powerOff();
      }
      setErrorMessage(null);
      setConfig((prev) => {
        if (mode === 'tv') {
          const nextSource: BootSourceType =
            prev.sourceType === 'builtin_generic' || prev.sourceType === 'builtin_eeepc'
              ? 'builtin_android9'
              : prev.sourceType;
          return {
            ...prev,
            deviceMode: 'tv',
            sourceType: nextSource,
            vgaMemoryMb: 32,
          };
        }
        const nextSource: BootSourceType =
          prev.sourceType === 'builtin_android7' || prev.sourceType === 'builtin_android8'
            ? 'builtin_generic'
            : prev.sourceType;
        return {
          ...prev,
          deviceMode: 'phone',
          sourceType: nextSource,
        };
      });
      setStatusDetail(
        mode === 'tv'
          ? 'Ready to boot Android TV on 16:9 monitor'
          : 'Ready to boot Android on Nexus One'
      );
    },
    [config.deviceMode, powerOff, status]
  );

  const togglePause = useCallback(async () => {
    const vm = emulatorRef.current;
    if (!vm) return;
    if (vm.is_running()) {
      await vm.stop();
      setStatus('paused');
      setStatusDetail('VM execution paused');
    } else {
      await vm.run();
      setStatus('running');
      setStatusDetail('Android 2.2 running');
    }
  }, []);

  const restartVm = useCallback(() => {
    const vm = emulatorRef.current;
    if (!vm) return;
    vm.restart();
    setUptimeSeconds(0);
    setStatus('running');
    setStatusDetail('Warm reboot triggered');
    appendSerialLine('[FroyoOne] Hardware reset issued');
  }, [appendSerialLine]);

  const sendHardwareKey = useCallback(
    (key: AndroidHardwareKey) => {
      const vm = emulatorRef.current;
      if (!vm) return;
      const codes = getHardwareKeyScancodes(key);
      vm.keyboard_send_scancodes(codes);
    },
    []
  );

  const injectRemoteMouseMove = useCallback((normX: number, normY: number) => {
    const vm = emulatorRef.current as (V86Instance & { bus?: { send: (ev: string, data: unknown) => void } }) | null;
    if (!vm?.bus) return;
    const x = Math.max(0, Math.min(1, normX));
    const y = Math.max(0, Math.min(1, normY));
    vm.bus.send('mouse-absolute', [Math.round(x * 1000), Math.round(y * 1000), 1000, 1000]);
  }, []);

  const injectRemoteMouseButton = useCallback(
    (button: 'left' | 'middle' | 'right', down: boolean, normX: number, normY: number) => {
      const vm = emulatorRef.current as (V86Instance & { bus?: { send: (ev: string, data: unknown) => void } }) | null;
      if (!vm?.bus) return;
      const x = Math.max(0, Math.min(1, normX));
      const y = Math.max(0, Math.min(1, normY));
      vm.bus.send('mouse-absolute', [Math.round(x * 1000), Math.round(y * 1000), 1000, 1000]);
      const idx = button === 'left' ? 0 : button === 'middle' ? 1 : 2;
      const next: [boolean, boolean, boolean] = [...remoteMouseButtonsRef.current];
      next[idx] = down;
      remoteMouseButtonsRef.current = next;
      vm.bus.send('mouse-click', next);
    },
    []
  );

  const injectRemoteMouseWheel = useCallback((deltaY: number) => {
    const vm = emulatorRef.current as (V86Instance & { bus?: { send: (ev: string, data: unknown) => void } }) | null;
    if (!vm?.bus) return;
    const step = deltaY > 0 ? -1 : deltaY < 0 ? 1 : 0;
    if (step !== 0) {
      vm.bus.send('mouse-wheel', [step, 0]);
    }
  }, []);

  const injectRemoteScancodes = useCallback((codes: number[]) => {
    const vm = emulatorRef.current;
    if (!vm || codes.length === 0) return;
    vm.keyboard_send_scancodes(codes);
  }, []);

  const sendKeySequence = useCallback(async (keys: AndroidHardwareKey[]) => {
    const vm = emulatorRef.current;
    if (!vm) return;
    for (const key of keys) {
      vm.keyboard_send_scancodes(getHardwareKeyScancodes(key));
      await new Promise((r) => window.setTimeout(r, 85));
    }
  }, []);

  const sendSerialCommand = useCallback(
    (text: string) => {
      const vm = emulatorRef.current;
      if (!vm || !text) return;
      vm.serial0_send(`${text}\n`);
      appendSerialLine(`> ${text}`);
    },
    [appendSerialLine]
  );

  const clearSerialLog = useCallback(() => {
    serialBufferRef.current = '';
    setSerialLines([]);
  }, []);

  const lockPointer = useCallback(() => {
    const vm = emulatorRef.current;
    if (!vm) return;
    try {
      vm.lock_mouse();
    } catch {
      // Browser may block pointer lock in sandboxed contexts; relative/absolute clicks still work
    }
  }, []);

  const toggleMouseInput = useCallback(() => {
    const vm = emulatorRef.current;
    setMouseEnabled((prev) => {
      const next = !prev;
      vm?.mouse_set_enabled(next);
      return next;
    });
  }, []);

  const toggleKeyboardInput = useCallback(() => {
    const vm = emulatorRef.current;
    setKeyboardEnabled((prev) => {
      const next = !prev;
      vm?.keyboard_set_enabled(next);
      return next;
    });
  }, []);

  const captureScreenshot = useCallback((): string | null => {
    const canvas = screenRef.current?.querySelector('canvas');
    if (canvas && canvas.style.display !== 'none' && canvas.width > 0) {
      try {
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    }
    return null;
  }, [screenRef]);

  const downloadScreenshot = useCallback(() => {
    const dataUrl = captureScreenshot();
    if (!dataUrl) return false;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `froyoone-android-2.2-${Date.now()}.png`;
    link.click();
    return true;
  }, [captureScreenshot]);

  const createSnapshot = useCallback(
    async (customName?: string) => {
      const vm = emulatorRef.current;
      if (!vm) return;
      setSnapshotBusy(true);
      try {
        const wasRunning = vm.is_running();
        if (wasRunning) await vm.stop();
        const stateBuffer = await vm.save_state();
        if (wasRunning) await vm.run();

        const thumbnailDataUrl = captureScreenshot();
        const labelPrefix =
          config.sourceType === 'builtin_android7'
            ? 'Android 7.1'
            : config.sourceType === 'builtin_android8'
            ? 'Android 8.1'
            : config.sourceType === 'builtin_android9'
            ? 'Android 9'
            : 'Android 2.2';
        const record: VmSnapshotRecord = {
          id: `snap_${Date.now()}`,
          name:
            customName?.trim() ||
            `${labelPrefix} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          createdAt: Date.now(),
          isoVariant: config.sourceType,
          deviceMode: config.deviceMode,
          memoryMb: config.memoryMb,
          sizeBytes: stateBuffer.byteLength,
          thumbnailDataUrl,
          stateBuffer,
        };
        await saveSnapshot(record);
        await refreshSnapshots();
      } finally {
        setSnapshotBusy(false);
      }
    },
    [captureScreenshot, config.deviceMode, config.memoryMb, config.sourceType, refreshSnapshots]
  );

  const restoreSnapshotById = useCallback(
    async (id: string) => {
      setSnapshotBusy(true);
      try {
        const record = await getSnapshot(id);
        if (!record) return;
        const vm = emulatorRef.current;
        const sameMode = !record.deviceMode || record.deviceMode === config.deviceMode;
        if (
          vm &&
          record.isoVariant === config.sourceType &&
          record.memoryMb === config.memoryMb &&
          sameMode
        ) {
          const wasRunning = vm.is_running();
          if (wasRunning) await vm.stop();
          await vm.restore_state(record.stateBuffer);
          await vm.run();
          setStatus('running');
          setStatusDetail(`Restored "${record.name}"`);
        } else {
          const targetSource: BootSourceType =
            record.isoVariant === 'builtin_android7'
              ? 'builtin_android7'
              : record.isoVariant === 'builtin_android8'
              ? 'builtin_android8'
              : record.isoVariant === 'builtin_android9'
              ? 'builtin_android9'
              : record.isoVariant === 'builtin_eeepc'
              ? 'builtin_eeepc'
              : record.isoVariant === 'custom_file'
              ? 'custom_file'
              : 'builtin_generic';
          const targetMode: DeviceMode =
            record.deviceMode ??
            (targetSource === 'builtin_android7' || targetSource === 'builtin_android8'
              ? 'tv'
              : config.deviceMode);
          const restoredMem: 256 | 512 | 1024 =
            record.memoryMb === 256 ? 256 : record.memoryMb === 1024 ? 1024 : 512;
          await launchVm(
            {
              deviceMode: targetMode,
              sourceType: targetSource,
              memoryMb: restoredMem,
            },
            record.stateBuffer
          );
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? `Snapshot restore failed: ${err.message}`
            : 'Snapshot restore failed. Ensure matching ISO & memory settings.'
        );
      } finally {
        setSnapshotBusy(false);
      }
    },
    [config.deviceMode, config.memoryMb, config.sourceType, launchVm]
  );

  const removeSnapshot = useCallback(
    async (id: string) => {
      await deleteSnapshot(id);
      await refreshSnapshots();
    },
    [refreshSnapshots]
  );

  const exportSnapshotFile = useCallback(async (id: string) => {
    const record = await getSnapshot(id);
    if (!record) return;
    const blob = new Blob([record.stateBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.v86state`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importSnapshotFile = useCallback(
    async (file: File) => {
      setSnapshotBusy(true);
      try {
        const stateBuffer = await file.arrayBuffer();
        const vm = emulatorRef.current;
        if (vm) {
          const wasRunning = vm.is_running();
          if (wasRunning) await vm.stop();
          await vm.restore_state(stateBuffer);
          await vm.run();
          setStatus('running');
          setStatusDetail(`Imported "${file.name}"`);
        } else {
          await launchVm(undefined, stateBuffer);
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? `Failed to import snapshot: ${err.message}`
            : 'Invalid or incompatible .v86state file.'
        );
      } finally {
        setSnapshotBusy(false);
      }
    },
    [launchVm]
  );

  return {
    status,
    statusDetail,
    errorMessage,
    config,
    setConfig,
    isoCatalog,
    downloadProgress,
    displayInfo,
    ips,
    uptimeSeconds,
    pointerLocked,
    mouseEnabled,
    keyboardEnabled,
    serialLines,
    snapshots,
    snapshotBusy,
    launchVm,
    powerOff,
    switchDeviceMode,
    togglePause,
    restartVm,
    sendHardwareKey,
    injectRemoteMouseMove,
    injectRemoteMouseButton,
    injectRemoteMouseWheel,
    injectRemoteScancodes,
    sendKeySequence,
    sendSerialCommand,
    clearSerialLog,
    lockPointer,
    toggleMouseInput,
    toggleKeyboardInput,
    downloadScreenshot,
    createSnapshot,
    restoreSnapshotById,
    removeSnapshot,
    exportSnapshotFile,
    importSnapshotFile,
    fetchIsoCatalog,
  };
}
