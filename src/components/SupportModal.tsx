import { useState } from 'react';
import { Coffee } from 'lucide-react';

export const SUPPORT_MODAL_STORAGE_KEY = 'froyoone_hide_support_modal';

interface SupportModalProps {
  isOpen: boolean;
  onClose: (dontAskAgain: boolean) => void;
}

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      aria-describedby="support-modal-subtitle"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0D12]/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl bg-[#14181F] border border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.75)] p-6 space-y-5">
        <div className="space-y-2.5">
          <h2
            id="support-modal-title"
            className="font-display text-xl font-semibold tracking-tight text-[#F1F5F9]"
          >
            FroyoOne is made by a single developer
          </h2>
          <p
            id="support-modal-subtitle"
            className="text-sm leading-relaxed text-[#94A3B8]"
          >
            Modi393 (Lead Dev) needs your help, he is a single developer and needs more
            commission to update the game more. Pay = Money for me = Used to pay for
            subscription to edit website = More updates!
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <a
            href="https://www.patreon.com/16302272/join"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onClose(dontAskAgain)}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#FB923C] text-[#0D1014] text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F97316]"
          >
            <Coffee className="w-4 h-4 stroke-[2.2]" />
            Slide me a coffee
          </a>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onClose(dontAskAgain)}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/10 text-[#E2E8F0] text-sm font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A4C639]"
            >
              Sorry, I don&apos;t have money
            </button>

            <label className="flex items-center justify-center gap-2.5 py-1 text-xs text-[#94A3B8] hover:text-[#CBD5E1] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="w-4 h-4 rounded border border-white/20 bg-[#0D1014] accent-[#A4C639] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A4C639]"
              />
              <span>Don&apos;t ask me again</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
