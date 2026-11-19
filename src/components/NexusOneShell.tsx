import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Home,
  LayoutGrid,
  MousePointerClick,
  Power,
  Search,
  Volume1,
  Volume2,
} from 'lucide-react';
import type {
  AndroidHardwareKey,
  BootSourceType,
  EmulatorDisplayInfo,
  EmulatorStatus,
} from '../types/emulator';
import { HARDWARE_KEY_DESCRIPTIONS } from '../utils/scancodes';

interface NexusOneShellProps {
  screenRef: React.RefObject<HTMLDivElement | null>;
  status: EmulatorStatus;
  statusDetail: string;
  errorMessage: string | null;
  sourceType: BootSourceType;
  downloadProgress: { loaded: number; total: number; label: string } | null;
  displayInfo: EmulatorDisplayInfo;
  pointerLocked: boolean;
  onBoot: () => void;
  onSelectSourceType: (source: BootSourceType) => void;
  onHardwareKey: (key: AndroidHardwareKey) => void;
  onLockPointer: () => void;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NexusOneShell({
  screenRef,
  status,
  statusDetail,
  errorMessage,
  sourceType,
  downloadProgress,
  displayInfo,
  pointerLocked,
  onBoot,
  onSelectSourceType,
  onHardwareKey,
  onLockPointer,
}: NexusOneShellProps) {
  const viewportBoxRef = useRef<HTMLDivElement | null>(null);
  const [activeKey, setActiveKey] = useState<AndroidHardwareKey | null>(null);

  // Dynamically scale VGA text-mode <div> inside v86 screen_container so 80-col BIOS/ISOLINUX text fits cleanly
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
      const boxW = viewport.clientWidth - 16;
      const boxH = viewport.clientHeight - 16;
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

  const isVmActive = status === 'booting' || status === 'running' || status === 'paused';
  const progressPct =
    downloadProgress && downloadProgress.total > 0
      ? Math.min(100, Math.round((downloadProgress.loaded / downloadProgress.total) * 100))
      : 0;

  return (
    <div className="flex flex-col items-center justify-center select-none">
      {/* Outer hardware assembly including left volume rocker & top power key */}
      <div className="relative flex items-center">
        {/* Left-edge anodized Volume Up / Down rocker */}
        <div className="hidden sm:flex flex-col gap-1 -mr-[2px] z-0">
          <button
            type="button"
            disabled={!isVmActive}
            onClick={() => triggerKey('volume_up')}
            title={HARDWARE_KEY_DESCRIPTIONS.volume_up}
            aria-label="Volume Up"
            className="w-2.5 h-12 rounded-l-md bg-[#2A303A] hover:bg-[#3A4250] border border-r-0 border-white/15 flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Volume2 className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            disabled={!isVmActive}
            onClick={() => triggerKey('volume_down')}
            title={HARDWARE_KEY_DESCRIPTIONS.volume_down}
            aria-label="Volume Down"
            className="w-2.5 h-12 rounded-l-md bg-[#2A303A] hover:bg-[#3A4250] border border-r-0 border-white/15 flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Volume1 className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* 2010 HTC/Google Nexus One Chassis */}
        <div className="relative w-[372px] sm:w-[404px] rounded-[46px] p-[10px] bg-gradient-to-b from-[#3E4552] via-[#252A33] to-[#1A1E26] shadow-[0_28px_70px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.2)] border border-white/12">
          {/* Top-edge Physical Power / Sleep button */}
          <button
            type="button"
            disabled={!isVmActive}
            onClick={() => triggerKey('power')}
            title={HARDWARE_KEY_DESCRIPTIONS.power}
            aria-label="Hardware Power / Sleep Button"
            className="absolute -top-[5px] right-14 w-12 h-2 rounded-t-md bg-[#333A47] hover:bg-[#465062] border border-b-0 border-white/20 flex items-center justify-center disabled:opacity-40 transition-colors cursor-pointer"
          >
            <span className="sr-only">Power Button</span>
          </button>

          {/* Inner Teflon Dark-Gray Faceplate */}
          <div className="rounded-[37px] bg-[#11141A] border border-white/8 px-3.5 pt-4 pb-5 flex flex-col items-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]">
            {/* Top Bezel: Earpiece Grille + Sensor Window + Active LED */}
            <div className="w-full flex items-center justify-center gap-4 mb-3.5 relative">
              {/* Proximity & ambient light sensors */}
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#07090C] ring-1 ring-white/10" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#07090C] ring-1 ring-white/10" />
              </div>

              {/* Signature Nexus One metallic micro-mesh speaker grille */}
              <div
                className="w-20 h-2 rounded-full bg-[#1C212A] border border-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]"
                style={{
                  backgroundImage:
                    'radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)',
                  backgroundSize: '3px 3px',
                }}
              />

              {/* Hardware power LED (reflects real VM state) */}
              <span
                title={`Device state: ${status}`}
                className={`w-2 h-2 rounded-full transition-colors ${
                  status === 'running'
                    ? 'bg-[#A4C639] shadow-[0_0_8px_#A4C639]'
                    : status === 'booting' || status === 'preparing_image'
                    ? 'bg-amber-400 shadow-[0_0_8px_#FBBF24]'
                    : status === 'error'
                    ? 'bg-red-500 shadow-[0_0_8px_#EF4444]'
                    : 'bg-[#1F2530]'
                }`}
              />
            </div>

            {/* 3.7" OLED Screen Viewport (scaled cleanly for real x86 framebuffer) */}
            <div
              ref={viewportBoxRef}
              className="relative w-full aspect-[3/4] max-h-[470px] rounded-[6px] bg-black border border-white/15 overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.9)]"
            >
              {/* Real v86 VGA/SVGA output container */}
              <div
                ref={screenRef}
                onClick={() => {
                  if (status === 'running') {
                    onLockPointer();
                  }
                }}
                className="v86-screen-host cursor-crosshair"
              />

              {/* Non-running overlays (only shown when VM is idle, preparing image, or faulted) */}
              {!isVmActive && (
                <div className="absolute inset-0 bg-[#0A0D12]/95 flex flex-col items-center justify-center p-6 text-center z-10">
                  {status === 'preparing_image' ? (
                    <div className="w-full max-w-[260px] space-y-4">
                      <div className="w-11 h-11 mx-auto rounded-xl bg-[#A4C639]/12 border border-[#A4C639]/30 flex items-center justify-center text-[#A4C639]">
                        <Power className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#F1F5F9]">
                          {sourceType === 'builtin_android9'
                            ? 'Caching Android 9 Image'
                            : 'Caching Android 2.2 Image'}
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
                    <div className="w-full max-w-[270px] space-y-4">
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-red-400">
                          Boot Fault
                        </p>
                        <p className="text-xs leading-relaxed text-[#CBD5E1]">
                          {errorMessage || 'Unable to start Android virtual machine.'}
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
                    <div className="w-full max-w-[268px] space-y-4">
                      {/* Direct OS selector right on the device screen */}
                      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#14181F] border border-white/10">
                        <button
                          type="button"
                          onClick={() => onSelectSourceType('builtin_generic')}
                          className={`py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            sourceType === 'builtin_generic' || sourceType === 'builtin_eeepc'
                              ? 'bg-[#252D39] text-[#A4C639]'
                              : 'text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          Android 2.2
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectSourceType('builtin_android9')}
                          className={`py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            sourceType === 'builtin_android9'
                              ? 'bg-[#252D39] text-[#A4C639]'
                              : 'text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          Android 9
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <p className="font-display text-lg font-semibold tracking-tight text-[#F1F5F9]">
                          {sourceType === 'builtin_android9'
                            ? 'Android 9 Pie'
                            : 'Android 2.2 Froyo'}
                        </p>
                        <p className="text-xs leading-relaxed text-[#94A3B8]">
                          {sourceType === 'builtin_android9'
                            ? 'Genuine 32-bit Android 9.0-r2 x86 Live CD inside WebAssembly hardware emulation.'
                            : 'Genuine x86 Android 2.2 OS running inside WebAssembly hardware emulation.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onBoot}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                        {sourceType === 'builtin_android9'
                          ? 'Boot Android 9'
                          : 'Boot Android 2.2'}
                      </button>
                      <p className="text-[11px] text-[#64748B]">
                        {sourceType === 'builtin_android9'
                          ? 'First boot caches the 726 MB Android 9 ISO locally'
                          : 'First boot caches the 82.4 MB Android 2.2 ISO locally'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Subtle pause scrim */}
              {status === 'paused' && (
                <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                  <span className="px-3 py-1.5 rounded-md bg-[#161B22]/90 border border-white/15 text-xs font-medium text-[#F1F5F9]">
                    Execution Paused
                  </span>
                </div>
              )}
            </div>

            {/* Nexus One 4 Capacitive Navigation Keys: Back · Menu · Home · Search */}
            <div className="w-full grid grid-cols-4 gap-2 pt-3.5 pb-2 px-2">
              {(
                [
                  { key: 'back', label: 'Back', Icon: ArrowLeft },
                  { key: 'menu', label: 'Menu', Icon: LayoutGrid },
                  { key: 'home', label: 'Home', Icon: Home },
                  { key: 'search', label: 'Search', Icon: Search },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={!isVmActive}
                  onClick={() => triggerKey(key)}
                  title={HARDWARE_KEY_DESCRIPTIONS[key]}
                  aria-label={`Android ${label} Key`}
                  className={`h-10 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                    activeKey === key
                      ? 'bg-white/12 text-[#A4C639] translate-y-[1px]'
                      : 'text-[#CBD5E1] hover:text-white hover:bg-white/6'
                  }`}
                >
                  <Icon className="w-4 h-4 stroke-[1.9]" />
                </button>
              ))}
            </div>

            {/* Signature Nexus One Glowing Pearl Trackball D-Pad */}
            <div className="mt-1 relative flex items-center justify-center">
              <div className="relative w-20 h-14 flex items-center justify-center">
                {/* Directional ring buttons around the pearl */}
                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={() => triggerKey('trackball_up')}
                  title={HARDWARE_KEY_DESCRIPTIONS.trackball_up}
                  aria-label="Trackball Up"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-3.5 rounded-t flex items-center justify-center text-[9px] text-[#64748B] hover:text-[#F1F5F9] disabled:opacity-30 cursor-pointer"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={() => triggerKey('trackball_down')}
                  title={HARDWARE_KEY_DESCRIPTIONS.trackball_down}
                  aria-label="Trackball Down"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-3.5 rounded-b flex items-center justify-center text-[9px] text-[#64748B] hover:text-[#F1F5F9] disabled:opacity-30 cursor-pointer"
                >
                  ▼
                </button>
                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={() => triggerKey('trackball_left')}
                  title={HARDWARE_KEY_DESCRIPTIONS.trackball_left}
                  aria-label="Trackball Left"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-6 rounded-l flex items-center justify-center text-[9px] text-[#64748B] hover:text-[#F1F5F9] disabled:opacity-30 cursor-pointer"
                >
                  ◀
                </button>
                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={() => triggerKey('trackball_right')}
                  title={HARDWARE_KEY_DESCRIPTIONS.trackball_right}
                  aria-label="Trackball Right"
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-6 rounded-r flex items-center justify-center text-[9px] text-[#64748B] hover:text-[#F1F5F9] disabled:opacity-30 cursor-pointer"
                >
                  ▶
                </button>

                {/* Center recessed pearl trackball */}
                <button
                  type="button"
                  disabled={!isVmActive}
                  onClick={() => triggerKey('trackball_press')}
                  title={HARDWARE_KEY_DESCRIPTIONS.trackball_press}
                  aria-label="Trackball Select"
                  className={`w-8 h-8 rounded-full border transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    activeKey === 'trackball_press'
                      ? 'scale-95 border-[#A4C639] shadow-[0_0_14px_rgba(164,198,57,0.55)]'
                      : 'border-white/25 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.45),0_0_10px_rgba(226,232,240,0.18)] hover:border-white/45'
                  }`}
                  style={{
                    background:
                      'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #CBD5E1 48%, #64748B 100%)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Concise unboxed interaction hint below device */}
      <div className="mt-3 flex items-center gap-2 text-xs text-[#94A3B8]">
        <MousePointerClick className="w-3.5 h-3.5 text-[#A4C639]" />
        {pointerLocked ? (
          <span>Pointer captured inside Android · Press Esc to release</span>
        ) : isVmActive ? (
          <span>Click inside display to steer Android cursor · Hardware keys active</span>
        ) : (
          <span>
            Nexus One Chassis · 2010 HTC Passion ·{' '}
            {sourceType === 'builtin_android9' ? 'Android-x86 9.0' : 'Android-x86 2.2'}
          </span>
        )}
      </div>
    </div>
  );
}
