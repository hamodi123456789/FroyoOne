import { useRef, useState } from 'react';
import { NexusOneShell } from './components/NexusOneShell';
import { WorkbenchPanel } from './components/WorkbenchPanel';
import { useAndroidEmulator } from './hooks/useAndroidEmulator';
import type { IsoVariant, WorkbenchTab } from './types/emulator';

const NAV_TABS: Array<{ id: WorkbenchTab; label: string }> = [
  { id: 'controls', label: 'Emulator' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'console', label: 'Serial Console' },
  { id: 'images', label: 'Image Source' },
];

export default function App() {
  const screenRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('controls');

  const {
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
  } = useAndroidEmulator(screenRef);

  const isActive =
    status === 'preparing_image' ||
    status === 'booting' ||
    status === 'running' ||
    status === 'paused';

  const handlePrecacheIso = async (variant: IsoVariant) => {
    const res = await fetch('/api/iso/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant }),
    });
    let current = await res.json();
    while (!current.available && !current.error) {
      await new Promise((r) => window.setTimeout(r, 500));
      const poll = await fetch(`/api/iso/status?variant=${variant}`);
      current = await poll.json();
      await fetchIsoCatalog();
    }
    await fetchIsoCatalog();
    return current;
  };

  return (
    <div className="min-h-screen bg-[#0D1014] text-[#F1F5F9] flex flex-col">
      {/* Three-Zone Top Bar Contract */}
      <header className="border-b border-white/8 bg-[#0D1014]/95 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1360px] mx-auto px-6 h-15 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="/"
            className="font-display text-lg font-bold tracking-tight text-[#F1F5F9] whitespace-nowrap shrink-0"
          >
            FroyoOne
          </a>

          {/* Zone 2: Clean single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  activeTab === tab.id
                    ? 'text-[#F1F5F9] border-[#A4C639]'
                    : 'text-[#94A3B8] border-transparent hover:text-[#F1F5F9]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: GitHub Repository Button & Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href="https://github.com/hamodi123456789/FroyoOne/tree/main"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open FroyoOne repository on GitHub"
              title="View FroyoOne on GitHub"
              className="w-9 h-9 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/10 flex items-center justify-center text-[#CBD5E1] hover:text-white transition-colors shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </a>
            {isActive ? (
              <button
                type="button"
                onClick={() => void powerOff()}
                className="px-4 py-2 rounded-lg bg-[#1C222B] hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-xs font-semibold text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Power Off
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void launchVm()}
                className="px-4 py-2 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {config.sourceType === 'builtin_android9'
                  ? 'Boot Android 9'
                  : 'Boot Android 2.2'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile / Narrow-Viewport Section Switcher */}
        <div className="md:hidden border-t border-white/8 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#1C222B] text-[#A4C639]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Two-Zone Emulator Studio */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Stage (~5 cols): 2010 Nexus One Hardware Shell + Live Android 2.2 Screen */}
        <div className="lg:col-span-5 flex justify-center">
          <NexusOneShell
            screenRef={screenRef}
            status={status}
            statusDetail={statusDetail}
            errorMessage={errorMessage}
            sourceType={config.sourceType}
            downloadProgress={downloadProgress}
            displayInfo={displayInfo}
            pointerLocked={pointerLocked}
            onBoot={() => void launchVm()}
            onSelectSourceType={(sourceType) =>
              setConfig((prev) => ({
                ...prev,
                sourceType,
                vgaMemoryMb: sourceType === 'builtin_android9' ? 32 : prev.vgaMemoryMb,
              }))
            }
            onHardwareKey={sendHardwareKey}
            onLockPointer={lockPointer}
          />
        </div>

        {/* Right Deck (~7 cols): Workbench Controls, Snapshots, Serial Console, Image Manager */}
        <div className="lg:col-span-7">
          <WorkbenchPanel
            activeTab={activeTab}
            status={status}
            statusDetail={statusDetail}
            config={config}
            setConfig={setConfig}
            isoCatalog={isoCatalog}
            displayInfo={displayInfo}
            ips={ips}
            uptimeSeconds={uptimeSeconds}
            pointerLocked={pointerLocked}
            mouseEnabled={mouseEnabled}
            keyboardEnabled={keyboardEnabled}
            serialLines={serialLines}
            snapshots={snapshots}
            snapshotBusy={snapshotBusy}
            onBoot={(override) => void launchVm(override)}
            onTogglePause={() => void togglePause()}
            onRestart={restartVm}
            onHardwareKey={sendHardwareKey}
            onKeySequence={(keys) => void sendKeySequence(keys)}
            onLockPointer={lockPointer}
            onToggleMouse={toggleMouseInput}
            onToggleKeyboard={toggleKeyboardInput}
            onDownloadScreenshot={() => void downloadScreenshot()}
            onCreateSnapshot={(name) => void createSnapshot(name)}
            onRestoreSnapshot={(id) => void restoreSnapshotById(id)}
            onDeleteSnapshot={(id) => void removeSnapshot(id)}
            onExportSnapshot={(id) => void exportSnapshotFile(id)}
            onImportSnapshot={(file) => void importSnapshotFile(file)}
            onSendSerial={sendSerialCommand}
            onClearSerial={clearSerialLog}
            onPrecacheIso={handlePrecacheIso}
          />
        </div>
      </main>
    </div>
  );
}
