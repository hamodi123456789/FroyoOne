import { useRef, useState } from 'react';
import { NexusOneShell } from './components/NexusOneShell';
import { WorkbenchPanel } from './components/WorkbenchPanel';
import { useAndroidEmulator } from './hooks/useAndroidEmulator';
import type { WorkbenchTab } from './types/emulator';

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

  const handlePrecacheIso = async (variant: 'generic' | 'eeepc') => {
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

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
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
                Boot Android 2.2
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
            downloadProgress={downloadProgress}
            displayInfo={displayInfo}
            pointerLocked={pointerLocked}
            onBoot={() => void launchVm()}
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
