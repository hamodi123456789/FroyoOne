import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Home,
  LayoutGrid,
  Monitor,
  MousePointerClick,
  Power,
  Search,
  Smartphone,
  Upload,
  Volume1,
  Volume2,
} from 'lucide-react';
import type {
  AndroidHardwareKey,
  BootSourceType,
  DeviceMode,
  EmulatorDisplayInfo,
  EmulatorStatus,
  MultiuserRole,
  RemoteCursorState,
} from '../types/emulator';
import { HARDWARE_KEY_DESCRIPTIONS } from '../utils/scancodes';
import { RemoteCursorsOverlay } from './RemoteCursorsOverlay';

interface TvMonitorShellProps {
  screenRef: React.RefObject<HTMLDivElement | null>;
  status: EmulatorStatus;
  statusDetail: string;
  errorMessage: string | null;
  sourceType: BootSourceType;
  customFile: File | null;
  downloadProgress: { loaded: number; total: number; label: string } | null;
  displayInfo: EmulatorDisplayInfo;
  pointerLocked: boolean;
  multiuserRole: MultiuserRole;
  remoteStream: MediaStream | null;
  remoteCursors: RemoteCursorState[];
  onLocalCursorMove: (x: number, y: number, visible: boolean) => void;
  onRemoteMouseMove: (x: number, y: number) => void;
  onRemoteMouseButton: (button: 'left' | 'middle' | 'right', down: boolean, x: number, y: number) => void;
  onRemoteMouseWheel: (deltaY: number) => void;
  onRemoteKeyCode: (code: string, down: boolean) => void;
  onBoot: () => void;
  onSelectDeviceMode: (mode: DeviceMode) => void;
  onSelectSourceType: (source: BootSourceType) => void;
  onSelectCustomFile: (file: File | null) => void;
  onHardwareKey: (key: AndroidHardwareKey) => void;
  onLockPointer: () => void;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTvVersionMeta(sourceType: BootSourceType, customFile: File | null) {
  switch (sourceType) {
    case 'builtin_android7':
      return {
        title: 'Android TV · 7.1 Nougat',
        desc: 'Genuine 32-bit Android-x86 7.1-r5 Live CD rendered on a 16:9 widescreen monitor.',
        sizeNote: 'First boot caches the 734 MB Android 7.1 ISO locally',
      };
    case 'builtin_android8':
      return {
        title: 'Android TV · 8.1 Oreo',
        desc: 'Genuine 32-bit Android-x86 8.1-r6 Live CD rendered on a 16:9 widescreen monitor.',
        sizeNote: 'First boot caches the 658 MB Android 8.1 ISO locally',
      };
    case 'custom_file':
      return {
        title: 'Android TV · Custom ISO',
        desc: customFile
          ? `Ready to boot ${customFile.name} (${formatMegabytes(customFile.size)}) in widescreen.`
          : 'Load a local 32-bit Android TV or Android-x86 .iso / .img file directly in WebAssembly.',
        sizeNote: 'Runs 100% locally in browser memory',
      };
    default:
      return {
        title: 'Android TV · 9.0 Pie',
        desc: 'Genuine 32-bit Android-x86 9.0-r2 Live CD rendered on a 16:9 widescreen monitor.',
        sizeNote: 'First boot caches the 726 MB Android 9.0 ISO locally',
      };
  }
}

export function TvMonitorShell({
  screenRef,
  status,
  statusDetail,
  errorMessage,
  sourceType,
  customFile,
  downloadProgress,
  displayInfo,
  pointerLocked,
  multiuserRole,
  remoteStream,
  remoteCursors,
  onLocalCursorMove,
  onRemoteMouseMove,
  onRemoteMouseButton,
  onRemoteMouseWheel,
  onRemoteKeyCode,
  onBoot,
  onSelectDeviceMode,
  onSelectSourceType,
  onSelectCustomFile,
  onHardwareKey,
  onLockPointer,
}: TvMonitorShellProps) {
  const viewportBoxRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const customFileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeKey, setActiveKey] = useState<AndroidHardwareKey | null>(null);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;
    if (multiuserRole === 'guest' && remoteStream) {
      video.srcObject = remoteStream;
      void video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [multiuserRole, remoteStream]);

  useEffect(() => {
    const viewport = viewportBoxRef.current;
    const host = screenRef.current;
    if (!viewport || !host) return;

    const updateTextScale = () => {
      const textEl = host.firstElementChild as HTMLElement | null;
      if (!textEl || displayInfo.bpp > 0) {
        if (textEl) textEl.style.transform = '';
        return;
      }
      const boxW = viewport.clientWidth - 20;
      const boxH = viewport.clientHeight - 20;
      const rawW = textEl.scrollWidth || 640;
      const rawH = textEl.scrollHeight || 360;
      const scale = Math.min(1, boxW / rawW, boxH / rawH);
      textEl.style.transform = scale < 1 ? `scale(${scale.toFixed(3)})` : '';
    };

    updateTextScale();
    const observer = new ResizeObserver(updateTextScale);
    observer.observe(viewport);
    const id = window.setInterval(updateTextScale, 400);
    return () => {
      observer.disconnect();
      window.clearInterval(id);
    };
  }, [displayInfo, screenRef, status]);

  const triggerKey = (key: AndroidHardwareKey) => {
    setActiveKey(key);
    onHardwareKey(key);
    window.setTimeout(() => setActiveKey((curr) => (curr === key ? null : curr)), 140);
  };

  const isGuest = multiuserRole === 'guest';
  const isVmActive = status === 'booting' || status === 'running' || status === 'paused';
  const controlsEnabled = isGuest || isVmActive;
  const progressPct =
    downloadProgress && downloadProgress.total > 0
      ? Math.min(100, Math.round((downloadProgress.loaded / downloadProgress.total) * 100))
      : 0;

  const getNormalizedCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (remoteVideoRef.current || viewportBoxRef.current)?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const mapMouseButton = (btn: number): 'left' | 'middle' | 'right' =>
    btn === 1 ? 'middle' : btn === 2 ? 'right' : 'left';

  const meta = getTvVersionMeta(sourceType, customFile);

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* 16:9 Widescreen Monitor Bezel */}
      <div className="w-full max-w-[740px] rounded-[20px] p-3 sm:p-3.5 bg-gradient-to-b from-[#2A303C] via-[#1C212A] to-[#13171E] border border-white/12 shadow-[0_28px_70px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.16)]">
        {/* 16:9 Display Panel */}
        <div
          ref={viewportBoxRef}
          tabIndex={isGuest ? 0 : undefined}
          onMouseMove={(e) => {
            if (multiuserRole === 'none') return;
            const { x, y } = getNormalizedCoords(e);
            onLocalCursorMove(x, y, true);
            if (isGuest) onRemoteMouseMove(x, y);
          }}
          onMouseLeave={() => {
            if (multiuserRole !== 'none') onLocalCursorMove(0, 0, false);
          }}
          onMouseDown={(e) => {
            if (!isGuest) return;
            e.currentTarget.focus();
            const { x, y } = getNormalizedCoords(e);
            onRemoteMouseButton(mapMouseButton(e.button), true, x, y);
          }}
          onMouseUp={(e) => {
            if (!isGuest) return;
            const { x, y } = getNormalizedCoords(e);
            onRemoteMouseButton(mapMouseButton(e.button), false, x, y);
          }}
          onWheel={(e) => {
            if (isGuest) onRemoteMouseWheel(e.deltaY);
          }}
          onKeyDown={(e) => {
            if (!isGuest) return;
            e.preventDefault();
            onRemoteKeyCode(e.code, true);
          }}
          onKeyUp={(e) => {
            if (!isGuest) return;
            e.preventDefault();
            onRemoteKeyCode(e.code, false);
          }}
          onContextMenu={(e) => {
            if (isGuest) e.preventDefault();
          }}
          className="relative w-full aspect-video rounded-[10px] bg-black border border-white/12 overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.9)] focus:outline-none focus:ring-1 focus:ring-[#A4C639]"
        >
          {/* Real v86 VGA/SVGA output container */}
          <div
            ref={screenRef}
            onClick={() => {
              if (!isGuest && status === 'running') {
                onLockPointer();
              }
            }}
            className={`v86-screen-host cursor-crosshair ${isGuest ? 'hidden' : ''}`}
          />

          {/* WebRTC Guest Remote Video Stream */}
          {isGuest && (
            <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain cursor-crosshair select-none"
              />
              {!remoteStream && (
                <div className="absolute inset-0 bg-[#0A0D12]/90 flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <p className="text-sm font-medium text-[#F1F5F9]">
                    Connecting WebRTC Stream
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    Waiting for host video frames over peer-to-peer connection...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Live multiuser remote cursor markers */}
          {multiuserRole !== 'none' && <RemoteCursorsOverlay cursors={remoteCursors} />}

          {/* Idle / Preparing / Error overlay inside the TV screen */}
          {!isGuest && !isVmActive && (
            <div className="absolute inset-0 bg-[#0A0D12]/95 flex flex-col items-center justify-center p-5 sm:p-7 text-center z-10 overflow-y-auto">
              {status === 'preparing_image' ? (
                <div className="w-full max-w-[340px] space-y-4">
                  <div className="w-11 h-11 mx-auto rounded-xl bg-[#A4C639]/12 border border-[#A4C639]/30 flex items-center justify-center text-[#A4C639]">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      Caching Android TV Image
                    </p>
                    <p className="text-xs text-[#94A3B8] truncate">
                      {downloadProgress?.label || statusDetail}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[#A4C639] transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#94A3B8]">
                      <span>{progressPct}%</span>
                      <span>
                        {downloadProgress
                          ? `${formatMegabytes(downloadProgress.loaded)} / ${formatMegabytes(downloadProgress.total)}`
                          : 'Connecting...'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : status === 'error' ? (
                <div className="w-full max-w-[360px] space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-red-400">Boot Fault</p>
                    <p className="text-xs leading-relaxed text-[#CBD5E1]">
                      {errorMessage || 'Unable to start Android TV virtual machine.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onBoot}
                    className="px-4 py-2 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Retry Boot
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-[440px] space-y-4">
                  {/* Top Switcher Row: Form Factor (Phone | Android TV) */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#14181F] border border-white/10">
                      <button
                        type="button"
                        onClick={() => onSelectDeviceMode('phone')}
                        className="px-3 py-1.5 rounded-md text-xs font-medium text-[#94A3B8] hover:text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        Phone
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectDeviceMode('tv')}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#252D39] text-[#A4C639] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        Android TV
                      </button>
                    </div>
                  </div>

                  {/* Select Android Version within the TV */}
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#14181F] border border-white/10">
                    {(
                      [
                        { id: 'builtin_android7', label: 'Android 7.1' },
                        { id: 'builtin_android8', label: 'Android 8.1' },
                        { id: 'builtin_android9', label: 'Android 9.0' },
                        { id: 'custom_file', label: 'Custom ISO' },
                      ] as const
                    ).map((ver) => (
                      <button
                        key={ver.id}
                        type="button"
                        onClick={() => onSelectSourceType(ver.id)}
                        className={`py-1.5 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          sourceType === ver.id
                            ? 'bg-[#252D39] text-[#A4C639]'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {ver.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <p className="font-display text-lg font-semibold tracking-tight text-[#F1F5F9]">
                      {meta.title}
                    </p>
                    <p className="text-xs leading-relaxed text-[#94A3B8]">{meta.desc}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {sourceType === 'custom_file' && (
                      <>
                        <button
                          type="button"
                          onClick={() => customFileInputRef.current?.click()}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/10 text-xs font-medium text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {customFile ? 'Change ISO' : 'Select ISO / IMG'}
                        </button>
                        <input
                          ref={customFileInputRef}
                          type="file"
                          accept=".iso,.img,.bin"
                          className="hidden"
                          onChange={(e) => onSelectCustomFile(e.target.files?.[0] ?? null)}
                        />
                      </>
                    )}

                    <button
                      type="button"
                      disabled={sourceType === 'custom_file' && !customFile}
                      onClick={onBoot}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Boot Android TV
                    </button>
                  </div>

                  <p className="text-[11px] text-[#64748B]">{meta.sizeNote}</p>
                </div>
              )}
            </div>
          )}

          {/* Subtle pause overlay */}
          {!isGuest && status === 'paused' && (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
              <span className="px-3 py-1.5 rounded-md bg-[#161B22]/90 border border-white/15 text-xs font-medium text-[#F1F5F9]">
                Execution Paused
              </span>
            </div>
          )}
        </div>

        {/* Bottom Monitor Chin with Brand Mark & Live Power LED */}
        <div className="pt-2.5 px-2 flex items-center justify-between text-[11px] text-[#64748B]">
          <span className="font-display font-semibold tracking-wide text-[#94A3B8]">
            FROYOONE TV DISPLAY
          </span>
          <div className="flex items-center gap-2">
            <span>16:9 SVGA</span>
            <span
              title={`Monitor state: ${status}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                status === 'running'
                  ? 'bg-[#A4C639] shadow-[0_0_8px_#A4C639]'
                  : status === 'booting' || status === 'preparing_image'
                  ? 'bg-amber-400 shadow-[0_0_8px_#FBBF24]'
                  : status === 'error'
                  ? 'bg-red-500 shadow-[0_0_8px_#EF4444]'
                  : 'bg-[#2A313D]'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Brushed Metallic Monitor Stand Neck & Pedestal Base */}
      <div className="flex flex-col items-center">
        <div className="w-16 h-7 bg-gradient-to-b from-[#202631] to-[#2F3644] border-x border-white/10" />
        <div className="w-52 h-2.5 rounded-full bg-gradient-to-b from-[#333B4A] to-[#1D222B] border border-white/12 shadow-[0_8px_20px_rgba(0,0,0,0.6)]" />
      </div>

      {/* Integrated TV D-Pad Remote Control Deck */}
      <div className="mt-4 w-full max-w-[600px] rounded-xl bg-[#14181F] border border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Navigation & Power Keys */}
        <div className="flex items-center gap-1.5">
          {(
            [
              { key: 'power', label: 'Power', Icon: Power },
              { key: 'back', label: 'Back', Icon: ArrowLeft },
              { key: 'home', label: 'Home', Icon: Home },
              { key: 'menu', label: 'Menu', Icon: LayoutGrid },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              disabled={!controlsEnabled}
              onClick={() => triggerKey(key)}
              title={HARDWARE_KEY_DESCRIPTIONS[key]}
              aria-label={`TV ${label}`}
              className={`h-10 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${
                activeKey === key
                  ? 'bg-white/12 border-[#A4C639]/50 text-[#A4C639] translate-y-[1px]'
                  : 'bg-[#1C222B] hover:bg-[#252D39] border-white/8 text-[#CBD5E1] hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Center 5-Way TV D-Pad */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!controlsEnabled}
            onClick={() => triggerKey('trackball_left')}
            title={HARDWARE_KEY_DESCRIPTIONS.trackball_left}
            aria-label="D-Pad Left"
            className="w-9 h-9 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-xs text-[#CBD5E1] hover:text-white disabled:opacity-35 cursor-pointer"
          >
            ◀
          </button>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={!controlsEnabled}
              onClick={() => triggerKey('trackball_up')}
              title={HARDWARE_KEY_DESCRIPTIONS.trackball_up}
              aria-label="D-Pad Up"
              className="w-11 h-6 rounded-md bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-[10px] text-[#CBD5E1] hover:text-white disabled:opacity-35 cursor-pointer"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={!controlsEnabled}
              onClick={() => triggerKey('trackball_press')}
              title={HARDWARE_KEY_DESCRIPTIONS.trackball_press}
              aria-label="D-Pad OK"
              className={`w-11 h-7 rounded-md border text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-35 ${
                activeKey === 'trackball_press'
                  ? 'bg-[#A4C639] border-[#A4C639] text-[#0D1014]'
                  : 'bg-[#252D39] hover:bg-[#313B4A] border-white/15 text-[#F1F5F9]'
              }`}
            >
              OK
            </button>
            <button
              type="button"
              disabled={!controlsEnabled}
              onClick={() => triggerKey('trackball_down')}
              title={HARDWARE_KEY_DESCRIPTIONS.trackball_down}
              aria-label="D-Pad Down"
              className="w-11 h-6 rounded-md bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-[10px] text-[#CBD5E1] hover:text-white disabled:opacity-35 cursor-pointer"
            >
              ▼
            </button>
          </div>
          <button
            type="button"
            disabled={!controlsEnabled}
            onClick={() => triggerKey('trackball_right')}
            title={HARDWARE_KEY_DESCRIPTIONS.trackball_right}
            aria-label="D-Pad Right"
            className="w-9 h-9 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-xs text-[#CBD5E1] hover:text-white disabled:opacity-35 cursor-pointer"
          >
            ▶
          </button>
        </div>

        {/* Volume & Search Keys */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!controlsEnabled}
            onClick={() => triggerKey('volume_down')}
            title={HARDWARE_KEY_DESCRIPTIONS.volume_down}
            aria-label="TV Volume Down"
            className="h-10 px-2.5 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-[#CBD5E1] hover:text-white disabled:opacity-35 cursor-pointer"
          >
            <Volume1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!controlsEnabled}
            onClick={() => triggerKey('volume_up')}
            title={HARDWARE_KEY_DESCRIPTIONS.volume_up}
            aria-label="TV Volume Up"
            className="h-10 px-2.5 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-[#CBD5E1] hover:text-white disabled:opacity-35 cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!controlsEnabled}
            onClick={() => triggerKey('search')}
            title={HARDWARE_KEY_DESCRIPTIONS.search}
            aria-label="TV Search"
            className="h-10 px-2.5 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/8 text-[#CBD5E1] hover:text-white disabled:opacity-35 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interaction Hint */}
      <div className="mt-3 flex items-center gap-2 text-xs text-[#94A3B8]">
        <MousePointerClick className="w-3.5 h-3.5 text-[#A4C639]" />
        {isGuest ? (
          <span>WebRTC Shared Control · Click monitor & type or use D-Pad remote keys</span>
        ) : pointerLocked ? (
          <span>Pointer captured inside Android TV · Press Esc to release</span>
        ) : isVmActive ? (
          <span>Click inside monitor to steer pointer · D-Pad remote keys active</span>
        ) : (
          <span>16:9 Widescreen Monitor · Select Android 7.1, 8.1, 9.0, or Custom ISO</span>
        )}
      </div>
    </div>
  );
}
