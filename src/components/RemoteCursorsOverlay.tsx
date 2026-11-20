import type { RemoteCursorState } from '../types/emulator';

interface RemoteCursorsOverlayProps {
  cursors: RemoteCursorState[];
}

export function RemoteCursorsOverlay({ cursors }: RemoteCursorsOverlayProps) {
  if (cursors.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {cursors.map((cursor) => (
        <div
          key={cursor.peerId}
          className="absolute transition-transform duration-75 ease-out"
          style={{
            left: `${Math.max(0, Math.min(1, cursor.x)) * 100}%`,
            top: `${Math.max(0, Math.min(1, cursor.y)) * 100}%`,
            transform: 'translate(-2px, -2px)',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          >
            <path
              d="M2 1.5L13.5 7.5L8 9.2L5.8 14.5L2 1.5Z"
              fill={cursor.color}
              stroke="#0D1014"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="ml-3 -mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-[#0D1014] whitespace-nowrap shadow-sm"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.username}
          </span>
        </div>
      ))}
    </div>
  );
}
