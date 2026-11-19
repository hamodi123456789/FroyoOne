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

  const [status, setStatus] = useState<EmulatorStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('Ready to boot Android 2.2 (Froyo)');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<EmulatorConfig>({
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
      const map: Record<IsoVariant, IsoVariantStatus> = {
        generic: data.variants.find((v) => v.variant === 'generic')!,
        eeepc: data.variants.find((v) => v.variant === 'eeepc')!,
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
          throw new Error('Lost connection while polling Android 2.2 image cache.');
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
      if (overrideConfig) {
        setConfig(effectiveConfig);
      }

      if (!screenRef.current) {
        setStatus('error');
        setErrorMessage('Emulator display mount is unavailable.');
        return;
      }

      setErrorMessage(null);
      await destroyVm();

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
            effectiveConfig.sourceType === 'builtin_eeepc' ? 'eeepc' : 'generic';
          setStatus('preparing_image');
          setStatusDetail(`Caching genuine Android-x86 2.2 (${variant}) ISO...`);
          const cached = await prepareBuiltinIso(variant);
          cdromConfig = {
            url: `/api/iso/file/${variant}`,
            size: cached.sizeBytes,
            async: true,
          };
          bootOrder = 0x213;
        }

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
              ? 'Snapshot restored — Android 2.2 active'
              : 'Booting Android 2.2 (Froyo) Live CD'
          );
          appendSerialLine('[FroyoOne] x86 WebAssembly VM initialized');
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
            setStatusDetail(`Android 2.2 graphics active (${width}×${height} · ${bpp}-bit)`);
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
        const record: VmSnapshotRecord = {
          id: `snap_${Date.now()}`,
          name:
            customName?.trim() ||
            `Android 2.2 · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          createdAt: Date.now(),
          isoVariant: config.sourceType,
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
    [captureScreenshot, config.memoryMb, config.sourceType, refreshSnapshots]
  );

  const restoreSnapshotById = useCallback(
    async (id: string) => {
      setSnapshotBusy(true);
      try {
        const record = await getSnapshot(id);
        if (!record) return;
        const vm = emulatorRef.current;
        if (vm && record.isoVariant === config.sourceType && record.memoryMb === config.memoryMb) {
          const wasRunning = vm.is_running();
          if (wasRunning) await vm.stop();
          await vm.restore_state(record.stateBuffer);
          await vm.run();
          setStatus('running');
          setStatusDetail(`Restored "${record.name}"`);
        } else {
          const targetSource =
            record.isoVariant === 'builtin_eeepc'
              ? 'builtin_eeepc'
              : record.isoVariant === 'custom_file'
              ? 'custom_file'
              : 'builtin_generic';
          await launchVm(
            {
              sourceType: targetSource,
              memoryMb: record.memoryMb === 256 ? 256 : 512,
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
    [config.memoryMb, config.sourceType, launchVm]
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
    togglePause,
    restartVm,
    sendHardwareKey,
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
