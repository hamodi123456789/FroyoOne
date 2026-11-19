import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  FileArchive,
  HardDrive,
  Keyboard,
  Monitor,
  Mouse,
  Pause,
  Play,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AndroidHardwareKey,
  DeviceMode,
  EmulatorConfig,
  EmulatorDisplayInfo,
  EmulatorStatus,
  IsoVariant,
  IsoVariantStatus,
  SerialLogEntry,
  VmSnapshotMeta,
  WorkbenchTab,
} from '../types/emulator';

interface WorkbenchPanelProps {
  activeTab: WorkbenchTab;
  status: EmulatorStatus;
  statusDetail: string;
  config: EmulatorConfig;
  setConfig: React.Dispatch<React.SetStateAction<EmulatorConfig>>;
  isoCatalog: Record<IsoVariant, IsoVariantStatus> | null;
  displayInfo: EmulatorDisplayInfo;
  ips: number;
  uptimeSeconds: number;
  pointerLocked: boolean;
  mouseEnabled: boolean;
  keyboardEnabled: boolean;
  serialLines: SerialLogEntry[];
  snapshots: VmSnapshotMeta[];
  snapshotBusy: boolean;
  onBoot: (override?: Partial<EmulatorConfig>) => void;
  onSelectDeviceMode: (mode: DeviceMode) => void;
  onTogglePause: () => void;
  onRestart: () => void;
  onHardwareKey: (key: AndroidHardwareKey) => void;
  onKeySequence: (keys: AndroidHardwareKey[]) => void;
  onLockPointer: () => void;
  onToggleMouse: () => void;
  onToggleKeyboard: () => void;
  onDownloadScreenshot: () => void;
  onCreateSnapshot: (name?: string) => void;
  onRestoreSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onExportSnapshot: (id: string) => void;
  onImportSnapshot: (file: File) => void;
  onSendSerial: (cmd: string) => void;
  onClearSerial: () => void;
  onPrecacheIso: (variant: IsoVariant) => Promise<IsoVariantStatus>;
}

function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatIps(ips: number): string {
  if (ips >= 1_000_000) return `${(ips / 1_000_000).toFixed(1)} MIPS`;
  if (ips >= 1_000) return `${(ips / 1_000).toFixed(0)} KIPS`;
  return `${ips} IPS`;
}

export function WorkbenchPanel({
  activeTab,
  status,
  statusDetail,
  config,
  setConfig,
  isoCatalog,
  displayInfo,
  ips,
  uptimeSeconds,
  mouseEnabled,
  keyboardEnabled,
  serialLines,
  snapshots,
  snapshotBusy,
  onBoot,
  onSelectDeviceMode,
  onTogglePause,
  onRestart,
  onHardwareKey,
  onKeySequence,
  onLockPointer,
  onToggleMouse,
  onToggleKeyboard,
  onDownloadScreenshot,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onExportSnapshot,
  onImportSnapshot,
  onSendSerial,
  onClearSerial,
  onPrecacheIso,
}: WorkbenchPanelProps) {
  const [snapshotName, setSnapshotName] = useState('');
  const [serialFilter, setSerialFilter] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [precachingVariant, setPrecachingVariant] = useState<IsoVariant | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const serialViewportRef = useRef<HTMLDivElement | null>(null);
  const snapshotFileRef = useRef<HTMLInputElement | null>(null);
  const customIsoFileRef = useRef<HTMLInputElement | null>(null);

  const isVmActive = status === 'booting' || status === 'running' || status === 'paused';

  useEffect(() => {
    if (autoScroll && serialViewportRef.current) {
      serialViewportRef.current.scrollTop = serialViewportRef.current.scrollHeight;
    }
  }, [serialLines, autoScroll, activeTab]);

  const filteredSerial = serialFilter.trim()
    ? serialLines.filter((line) =>
        line.text.toLowerCase().includes(serialFilter.trim().toLowerCase())
      )
    : serialLines;

  const handleExportSerialLog = () => {
    const body = serialLines.map((l) => `[${l.timestamp}] ${l.text}`).join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `froyoone-serial-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrecache = async (variant: IsoVariant) => {
    setPrecachingVariant(variant);
    try {
      await onPrecacheIso(variant);
    } catch {
      // Error state is reflected in /api/iso/status
    } finally {
      setPrecachingVariant(null);
    }
  };

  const handleCustomFileSelected = (file: File | null) => {
    if (!file) return;
    const isDiskImg = /\.(img|raw|qcow2|vhd)$/i.test(file.name);
    setConfig((prev) => ({
      ...prev,
      sourceType: 'custom_file',
      customFile: file,
      customMediaKind: isDiskImg ? 'hda' : 'cdrom',
    }));
  };

  return (
    <section className="bg-[#14181F] border border-white/8 rounded-xl flex flex-col min-h-[560px] lg:h-[670px] overflow-hidden">
      {/* Shared VM Telemetry Strip across top of Workbench */}
      <div className="px-5 py-3.5 border-b border-white/8 flex flex-wrap items-center justify-between gap-4 bg-[#181D25]">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <span
              className={`font-medium ${
                status === 'running'
                  ? 'text-[#A4C639]'
                  : status === 'error'
                  ? 'text-red-400'
                  : status === 'booting' || status === 'preparing_image'
                  ? 'text-amber-300'
                  : 'text-[#CBD5E1]'
              }`}
            >
              {status === 'idle'
                ? 'Powered Off'
                : status === 'preparing_image'
                ? 'Caching Image'
                : status === 'booting'
                ? 'Booting Kernel'
                : status === 'running'
                ? 'Running'
                : status === 'paused'
                ? 'Paused'
                : 'Fault'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{statusDetail}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-[#94A3B8] shrink-0">
          <span>{formatIps(ips)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {displayInfo.width}×{displayInfo.height}
            {displayInfo.bpp > 0 ? ` (${displayInfo.bpp}bpp)` : ' Text'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatDuration(uptimeSeconds)}</span>
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'controls' && (
          <div className="space-y-6">
            {/* Execution Controls */}
            <div className="space-y-3">
              <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                Virtual Machine Execution
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={onTogglePause}
                  className="px-3.5 py-2.5 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs font-medium text-[#F1F5F9] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {status === 'paused' ? (
                    <>
                      <Play className="w-3.5 h-3.5 text-[#A4C639]" />
                      Resume VM
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Pause VM
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={onRestart}
                  className="px-3.5 py-2.5 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs font-medium text-[#F1F5F9] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Warm Reboot
                </button>

                <button
                  type="button"
                  disabled={!isVmActive || displayInfo.bpp === 0}
                  onClick={onDownloadScreenshot}
                  className="px-3.5 py-2.5 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs font-medium text-[#F1F5F9] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Save PNG
                </button>

                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={onLockPointer}
                  className="px-3.5 py-2.5 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs font-medium text-[#F1F5F9] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Mouse className="w-3.5 h-3.5 text-[#A4C639]" />
                  Lock Pointer
                </button>

                <button
                  type="button"
                  onClick={onToggleMouse}
                  className={`px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mouseEnabled
                      ? 'bg-[#1C222B] hover:bg-[#242B36] border-white/8 text-[#F1F5F9]'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <Mouse className="w-3.5 h-3.5" />
                  {mouseEnabled ? 'Mouse Active' : 'Mouse Muted'}
                </button>

                <button
                  type="button"
                  onClick={onToggleKeyboard}
                  className={`px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    keyboardEnabled
                      ? 'bg-[#1C222B] hover:bg-[#242B36] border-white/8 text-[#F1F5F9]'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  {keyboardEnabled ? 'Keys Active' : 'Keys Muted'}
                </button>
              </div>
            </div>

            <div className="border-t border-white/8 pt-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Bootloader & Hardware Key Injector
                </h2>
                <span className="text-xs text-[#94A3B8]">PS/2 Scancodes</span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(
                  [
                    { key: 'enter', label: 'Enter' },
                    { key: 'trackball_up', label: 'Up' },
                    { key: 'trackball_down', label: 'Down' },
                    { key: 'tab', label: 'Tab' },
                    { key: 'escape', label: 'Esc / Back' },
                    { key: 'menu', label: 'Menu' },
                    { key: 'home', label: 'Home' },
                    { key: 'search', label: 'Search' },
                    { key: 'power', label: 'Sleep' },
                    { key: 'ctrl_alt_del', label: 'Ctrl+Alt+Del' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!isVmActive}
                    onClick={() => onHardwareKey(key)}
                    className="px-3 py-2 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-xs font-mono text-[#E2E8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {config.sourceType === 'builtin_android7' ||
                config.sourceType === 'builtin_android8' ||
                config.sourceType === 'builtin_android9' ? (
                  <>
                    <button
                      type="button"
                      disabled={!isVmActive}
                      onClick={() =>
                        onKeySequence(
                          config.sourceType === 'builtin_android7'
                            ? [
                                'trackball_down',
                                'trackball_down',
                                'trackball_down',
                                'enter',
                                'trackball_down',
                                'enter',
                              ]
                            : [
                                'trackball_down',
                                'trackball_down',
                                'trackball_down',
                                'enter',
                                'trackball_down',
                                'trackball_down',
                                'enter',
                              ]
                        )
                      }
                      className="px-3.5 py-2 rounded-lg bg-[#A4C639]/15 hover:bg-[#A4C639]/25 border border-[#A4C639]/30 text-xs font-medium text-[#A4C639] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Boot Software Graphics (No HW Accel)
                    </button>
                    <button
                      type="button"
                      disabled={!isVmActive}
                      onClick={() => onHardwareKey('enter')}
                      className="px-3.5 py-2 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-xs font-medium text-[#CBD5E1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Boot Default Live CD
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!isVmActive}
                      onClick={() =>
                        onKeySequence(['trackball_down', 'trackball_down', 'enter'])
                      }
                      className="px-3.5 py-2 rounded-lg bg-[#A4C639]/15 hover:bg-[#A4C639]/25 border border-[#A4C639]/30 text-xs font-medium text-[#A4C639] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Select VESA Mode (ISOLINUX)
                    </button>
                    <button
                      type="button"
                      disabled={!isVmActive}
                      onClick={() =>
                        onKeySequence([
                          'trackball_down',
                          'trackball_down',
                          'trackball_down',
                          'enter',
                        ])
                      }
                      className="px-3.5 py-2 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-xs font-medium text-[#CBD5E1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Select Debug Mode (ISOLINUX)
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-white/8 pt-5 space-y-2.5">
              <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                {config.sourceType === 'builtin_android7'
                  ? 'Android 7.1 (Nougat) Boot & Input Guide'
                  : config.sourceType === 'builtin_android8'
                  ? 'Android 8.1 (Oreo) Boot & Input Guide'
                  : config.sourceType === 'builtin_android9'
                  ? 'Android 9 (Pie) Boot & Input Guide'
                  : 'Android 2.2 (Froyo) Boot & Input Guide'}
              </h2>
              {config.sourceType === 'builtin_android7' ||
              config.sourceType === 'builtin_android8' ||
              config.sourceType === 'builtin_android9' ? (
                <div className="space-y-2 text-xs leading-relaxed text-[#94A3B8]">
                  <p>
                    1. At the Android-x86 GRUB boot menu, click{' '}
                    <span className="text-[#A4C639]">Boot Software Graphics (No HW Accel)</span> to
                    enter <span className="text-[#E2E8F0]">Advanced options → No Hardware Acceleration</span>{' '}
                    (<span className="font-mono text-[#E2E8F0]">nomodeset HWACCEL=0</span>) for
                    reliable SwiftShader rendering in WebAssembly.
                  </p>
                  <p>
                    2. Modern Android-x86 images stream blocks over HTTP byte-ranges and take ~1–2
                    minutes to initialize ART/Zygote on first boot. Capture a{' '}
                    <span className="text-[#E2E8F0]">Snapshot</span> once booted to resume
                    immediately next time.
                  </p>
                  <p>
                    3.{' '}
                    {config.deviceMode === 'tv'
                      ? 'Use the TV D-Pad remote keys below the monitor or click inside the 16:9 display to steer the pointer.'
                      : 'Click inside the Nexus One display to steer the Android pointer, or use Esc (Back) and Home.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-xs leading-relaxed text-[#94A3B8]">
                  <p>
                    1. At the <span className="text-[#E2E8F0]">ISOLINUX</span> menu, click{' '}
                    <span className="text-[#A4C639]">Select VESA Mode (ISOLINUX)</span> (or press
                    Down twice + Enter) to boot{' '}
                    <span className="text-[#E2E8F0]">Live CD - VESA mode</span> at 800×600 graphics.
                  </p>
                  <p>
                    2. Initial x86 Dalvik & Zygote startup takes roughly 30–60 seconds in
                    WebAssembly. Once booted, save a{' '}
                    <span className="text-[#E2E8F0]">Snapshot</span> to resume instantly in future
                    sessions.
                  </p>
                  <p>
                    3. Click inside the Nexus One display to steer the Android cursor and drag the
                    Froyo lockscreen tab right to unlock. Use the capacitive chin keys or your
                    physical <span className="font-mono text-[#E2E8F0]">Esc</span> (Back) and{' '}
                    <span className="font-mono text-[#E2E8F0]">Home</span> keys.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'snapshots' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  VM State Snapshots
                </h2>
                <span className="text-xs text-[#94A3B8]">Stored in browser IndexedDB</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  placeholder="Snapshot label (e.g. Froyo Home Screen)"
                  className="flex-1 px-3.5 py-2 rounded-lg bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
                />
                <button
                  type="button"
                  disabled={!isVmActive || snapshotBusy}
                  onClick={() => {
                    onCreateSnapshot(snapshotName);
                    setSnapshotName('');
                  }}
                  className="px-4 py-2 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {snapshotBusy ? 'Saving...' : 'Capture Snapshot'}
                </button>
                <button
                  type="button"
                  disabled={snapshotBusy}
                  onClick={() => snapshotFileRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs font-medium text-[#F1F5F9] flex items-center justify-center gap-2 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import .v86state
                </button>
                <input
                  ref={snapshotFileRef}
                  type="file"
                  accept=".v86state,.bin,.state"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImportSnapshot(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            <div className="border-t border-white/8 pt-4">
              {snapshots.length === 0 ? (
                <div className="py-14 text-center space-y-2">
                  <FileArchive className="w-7 h-7 mx-auto text-[#64748B]" />
                  <p className="text-sm font-medium text-[#CBD5E1]">No snapshots captured yet</p>
                  <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                    Boot Android 2.2 once, then capture a full memory and CPU state snapshot to
                    restore instantly without waiting for kernel boot.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/8">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-14 rounded-md bg-[#0D1014] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                          {snap.thumbnailDataUrl ? (
                            <img
                              src={snap.thumbnailDataUrl}
                              alt={snap.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <HardDrive className="w-4 h-4 text-[#64748B]" />
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-medium text-[#F1F5F9] truncate">{snap.name}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#94A3B8]">
                            <span>{formatBytes(snap.sizeBytes)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{snap.memoryMb} MB RAM</span>
                            <span aria-hidden="true">·</span>
                            <span>{new Date(snap.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={snapshotBusy}
                          onClick={() => onRestoreSnapshot(snap.id)}
                          className="px-3 py-1.5 rounded-md bg-[#A4C639]/15 hover:bg-[#A4C639]/25 border border-[#A4C639]/30 text-xs font-medium text-[#A4C639] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => onExportSnapshot(snap.id)}
                          title="Export .v86state file"
                          aria-label="Export snapshot"
                          className="p-1.5 rounded-md bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-[#CBD5E1] transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSnapshot(snap.id)}
                          title="Delete snapshot"
                          aria-label="Delete snapshot"
                          className="p-1.5 rounded-md bg-[#1C222B] hover:bg-red-500/20 border border-white/8 text-[#94A3B8] hover:text-red-300 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'console' && (
          <div className="flex flex-col h-full min-h-[450px] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#A4C639]" />
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  COM1 / UART0 Serial Console
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={serialFilter}
                  onChange={(e) => setSerialFilter(e.target.value)}
                  placeholder="Filter logs..."
                  className="w-36 px-2.5 py-1.5 rounded-md bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
                />
                <button
                  type="button"
                  onClick={() => setAutoScroll((v) => !v)}
                  className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    autoScroll
                      ? 'bg-[#A4C639]/15 border-[#A4C639]/30 text-[#A4C639]'
                      : 'bg-[#1C222B] border-white/8 text-[#94A3B8]'
                  }`}
                >
                  Auto-scroll
                </button>
                <button
                  type="button"
                  disabled={serialLines.length === 0}
                  onClick={handleExportSerialLog}
                  className="px-2.5 py-1.5 rounded-md bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs text-[#CBD5E1] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Export
                </button>
                <button
                  type="button"
                  disabled={serialLines.length === 0}
                  onClick={onClearSerial}
                  className="px-2.5 py-1.5 rounded-md bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs text-[#CBD5E1] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div
              ref={serialViewportRef}
              className="flex-1 min-h-[320px] max-h-[410px] overflow-y-auto rounded-lg bg-[#0A0D12] border border-white/8 p-3 font-mono text-xs leading-5"
            >
              {filteredSerial.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[#64748B] text-center px-4">
                  {serialLines.length === 0
                    ? 'Waiting for COM1/UART0 serial output. Boot Android 2.2 (or choose Debug mode in ISOLINUX) to view kernel & shell output.'
                    : 'No serial lines match the current filter.'}
                </div>
              ) : (
                filteredSerial.map((entry) => (
                  <div key={entry.id} className="flex gap-3 hover:bg-white/3 px-1 rounded">
                    <span className="text-[#475569] tabular-nums shrink-0">{entry.timestamp}</span>
                    <span className="text-[#CBD5E1] break-all whitespace-pre-wrap">
                      {entry.text}
                    </span>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!serialInput.trim()) return;
                onSendSerial(serialInput);
                setSerialInput('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                disabled={!isVmActive}
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                placeholder="Send serial input to UART0 (e.g. logcat, ps, dmesg)..."
                className="flex-1 px-3.5 py-2 rounded-lg bg-[#0D1014] border border-white/10 font-mono text-xs text-[#F1F5F9] placeholder:text-[#64748B] disabled:opacity-50 focus:outline-none focus:border-[#A4C639]"
              />
              <button
                type="submit"
                disabled={!isVmActive || !serialInput.trim()}
                className="px-4 py-2 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/8 text-xs font-medium text-[#F1F5F9] flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-6">
            {/* Device Form Factor Switcher */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Device Layout
                </h2>
                <span className="text-xs text-[#94A3B8]">Phone chassis or 16:9 TV monitor</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#0D1014] border border-white/8">
                <button
                  type="button"
                  onClick={() => onSelectDeviceMode('phone')}
                  className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                    config.deviceMode === 'phone'
                      ? 'bg-[#1C222B] text-[#A4C639] font-semibold'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Phone (Nexus One)
                </button>
                <button
                  type="button"
                  onClick={() => onSelectDeviceMode('tv')}
                  className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                    config.deviceMode === 'tv'
                      ? 'bg-[#1C222B] text-[#A4C639] font-semibold'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  Android TV Monitor
                </button>
              </div>
            </div>

            {/* Built-in Android-x86 Releases */}
            <div className="border-t border-white/8 pt-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Official Android-x86 Releases
                </h2>
                <span className="text-xs text-[#94A3B8]">Auto-cached locally</span>
              </div>

              <div className="space-y-2.5">
                {(['generic', 'eeepc', 'android7', 'android8', 'android9'] as const).map((variant) => {
                  const info = isoCatalog?.[variant];
                  const sourceValue =
                    variant === 'android7'
                      ? 'builtin_android7'
                      : variant === 'android8'
                      ? 'builtin_android8'
                      : variant === 'android9'
                      ? 'builtin_android9'
                      : variant === 'eeepc'
                      ? 'builtin_eeepc'
                      : 'builtin_generic';
                  const isSelected = config.sourceType === sourceValue;
                  const requiresTv = variant === 'android7' || variant === 'android8';

                  return (
                    <div
                      key={variant}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          sourceType: sourceValue,
                          ...(requiresTv && !isVmActive
                            ? { deviceMode: 'tv', vgaMemoryMb: 32 }
                            : {}),
                        }))
                      }
                      className={`p-3.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-4 ${
                        isSelected
                          ? 'bg-[#A4C639]/8 border-[#A4C639]/45'
                          : 'bg-[#181D25] border-white/8 hover:border-white/15'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#F1F5F9]">
                            {info?.label ||
                              (variant === 'android7'
                                ? 'Android 7.1 Nougat (Android-x86 7.1-r5)'
                                : variant === 'android8'
                                ? 'Android 8.1 Oreo (Android-x86 8.1-r6)'
                                : variant === 'android9'
                                ? 'Android 9 Pie (Android-x86 9.0-r2)'
                                : `Android 2.2 Froyo (${variant})`)}
                          </span>
                          {info?.available && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#A4C639] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[#94A3B8]">
                          {info?.description ||
                            'Authentic Android-x86 Live CD ISO image.'}
                        </p>
                        <div className="text-[11px] font-mono tabular-nums text-[#64748B]">
                          {info ? formatBytes(info.sizeBytes) : '—'} ·{' '}
                          {info?.available
                            ? 'Cached on server'
                            : info?.downloading
                            ? `Downloading ${formatBytes(info.bytesDownloaded)}`
                            : 'Downloads automatically on boot'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!info?.available && (
                          <button
                            type="button"
                            disabled={precachingVariant === variant || info?.downloading}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handlePrecache(variant);
                            }}
                            className="px-3 py-1.5 rounded-md bg-[#1C222B] hover:bg-[#242B36] border border-white/10 text-xs text-[#CBD5E1] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {precachingVariant === variant || info?.downloading
                              ? 'Caching...'
                              : 'Pre-cache'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBoot(
                              requiresTv
                                ? {
                                    sourceType: sourceValue,
                                    deviceMode: 'tv',
                                    vgaMemoryMb: 32,
                                  }
                                : { sourceType: sourceValue }
                            );
                          }}
                          className="px-3 py-1.5 rounded-md bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Boot
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom User-Provided ISO / Disk Image */}
            <div className="border-t border-white/8 pt-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Custom Android ISO or Disk Image
                </h2>
                <span className="text-xs text-[#94A3B8]">Runs 100% locally in browser</span>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0] ?? null;
                  handleCustomFileSelected(file);
                }}
                className={`p-4 rounded-lg border border-dashed transition-colors text-center space-y-2.5 ${
                  dragOver
                    ? 'border-[#A4C639] bg-[#A4C639]/8'
                    : 'border-white/15 bg-[#0D1014]/60'
                }`}
              >
                <Upload className="w-5 h-5 mx-auto text-[#94A3B8]" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-[#E2E8F0]">
                    {config.customFile
                      ? `${config.customFile.name} (${formatBytes(config.customFile.size)})`
                      : 'Drop an Android-x86 .iso or .img file here'}
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    Read directly into WebAssembly RAM without uploading to any external server
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => customIsoFileRef.current?.click()}
                    className="px-3.5 py-1.5 rounded-md bg-[#1C222B] hover:bg-[#242B36] border border-white/10 text-xs text-[#F1F5F9] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Choose Local File
                  </button>
                  {config.customFile && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            customMediaKind:
                              prev.customMediaKind === 'cdrom' ? 'hda' : 'cdrom',
                          }))
                        }
                        className="px-3 py-1.5 rounded-md bg-[#1C222B] border border-white/10 text-xs font-mono text-[#CBD5E1] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Slot: {config.customMediaKind === 'cdrom' ? 'CD-ROM' : 'Hard Disk'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onBoot({ sourceType: 'custom_file' })}
                        className="px-3.5 py-1.5 rounded-md bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Boot Custom Image
                      </button>
                    </>
                  )}
                </div>
                <input
                  ref={customIsoFileRef}
                  type="file"
                  accept=".iso,.img,.bin"
                  className="hidden"
                  onChange={(e) => handleCustomFileSelected(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            {/* Hardware Configuration */}
            <div className="border-t border-white/8 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#CBD5E1]">
                  System Memory (RAM)
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#0D1014] border border-white/8">
                  {([256, 512, 1024] as const).map((mb) => (
                    <button
                      key={mb}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, memoryMb: mb }))}
                      className={`py-1.5 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                        config.memoryMb === mb
                          ? 'bg-[#1C222B] text-[#A4C639] font-semibold'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {mb} MB
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#CBD5E1]">
                  VESA Framebuffer VRAM
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#0D1014] border border-white/8">
                  {([16, 32] as const).map((mb) => (
                    <button
                      key={mb}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, vgaMemoryMb: mb }))}
                      className={`py-1.5 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                        config.vgaMemoryMb === mb
                          ? 'bg-[#1C222B] text-[#A4C639] font-semibold'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {mb} MB
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
