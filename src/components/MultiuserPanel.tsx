import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LogOut,
  Monitor,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  Users,
} from 'lucide-react';
import type {
  DeviceMode,
  MultiuserChatMessage,
  MultiuserConnectionState,
  MultiuserParticipant,
  MultiuserRole,
  MultiuserRoomSummary,
} from '../types/emulator';

interface MultiuserPanelProps {
  username: string;
  onSaveUsername: (name: string) => boolean;
  signalingConnected: boolean;
  rooms: MultiuserRoomSummary[];
  roomsLoading: boolean;
  onRefreshRooms: () => void;
  role: MultiuserRole;
  connectionState: MultiuserConnectionState;
  activeRoom: MultiuserRoomSummary | null;
  myPeerId: string | null;
  participants: MultiuserParticipant[];
  chatMessages: MultiuserChatMessage[];
  localDeviceMode: DeviceMode;
  localOsLabel: string;
  errorMessage: string | null;
  joinError: { roomId: string; code: string; message: string } | null;
  onClearJoinError: () => void;
  onCreateServer: (serverName: string, password: string) => void;
  onJoinServer: (roomId: string, password?: string) => void;
  onLeaveRoom: () => void;
  onSendChat: (text: string) => void;
}

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MultiuserPanel({
  username,
  onSaveUsername,
  signalingConnected,
  rooms,
  roomsLoading,
  onRefreshRooms,
  role,
  connectionState,
  activeRoom,
  myPeerId,
  participants,
  chatMessages,
  localDeviceMode,
  localOsLabel,
  errorMessage,
  joinError,
  onClearJoinError,
  onCreateServer,
  onJoinServer,
  onLeaveRoom,
  onSendChat,
}: MultiuserPanelProps) {
  const [usernameDraft, setUsernameDraft] = useState(username);
  const [usernameSavedFlash, setUsernameSavedFlash] = useState(false);

  const [lobbyView, setLobbyView] = useState<'join' | 'create'>('join');
  const [serverNameInput, setServerNameInput] = useState('');
  const [serverPasswordInput, setServerPasswordInput] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const [roomSearch, setRoomSearch] = useState('');
  const [promptRoom, setPromptRoom] = useState<MultiuserRoomSummary | null>(null);
  const [promptPassword, setPromptPassword] = useState('');
  const [showJoinPassword, setShowJoinPassword] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const chatViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUsernameDraft(username);
  }, [username]);

  useEffect(() => {
    if (chatViewportRef.current) {
      chatViewportRef.current.scrollTop = chatViewportRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    if (role !== 'none') {
      setPromptRoom(null);
      setPromptPassword('');
    }
  }, [role]);

  const handleSaveUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSaveUsername(usernameDraft)) {
      setUsernameSavedFlash(true);
      window.setTimeout(() => setUsernameSavedFlash(false), 1800);
    }
  };

  const filteredRooms = roomSearch.trim()
    ? rooms.filter(
        (r) =>
          r.serverName.toLowerCase().includes(roomSearch.trim().toLowerCase()) ||
          r.hostName.toLowerCase().includes(roomSearch.trim().toLowerCase())
      )
    : rooms;

  const handleClickRoom = (room: MultiuserRoomSummary) => {
    onClearJoinError();
    if (room.hasPassword) {
      setPromptRoom(room);
      setPromptPassword('');
      setShowJoinPassword(false);
    } else {
      setPromptRoom(null);
      onJoinServer(room.roomId);
    }
  };

  const handleSubmitJoinPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptRoom || !promptPassword) return;
    onJoinServer(promptRoom.roomId, promptPassword);
  };

  return (
    <div className="space-y-5">
      {/* Persistent Browser Username Bar */}
      <form
        onSubmit={handleSaveUsernameSubmit}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-white/8"
      >
        <div className="space-y-0.5">
          <label
            htmlFor="multiuser-username-input"
            className="block text-xs font-medium text-[#F1F5F9]"
          >
            Your Username
          </label>
          <p className="text-[11px] text-[#94A3B8]">
            Saved locally in this browser and visible to peers over WebRTC
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            id="multiuser-username-input"
            type="text"
            maxLength={28}
            value={usernameDraft}
            onChange={(e) => setUsernameDraft(e.target.value)}
            placeholder="Enter username..."
            className="w-44 px-3 py-1.5 rounded-lg bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
          />
          <button
            type="submit"
            disabled={!usernameDraft.trim() || usernameDraft.trim() === username}
            className="px-3 py-1.5 rounded-lg bg-[#1C222B] hover:bg-[#252D39] border border-white/10 text-xs font-medium text-[#F1F5F9] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            {usernameSavedFlash ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#A4C639]" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </form>

      {role === 'none' ? (
        <div className="space-y-5">
          {/* Create Server vs Join Server Entry Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0D1014] border border-white/8">
              <button
                type="button"
                onClick={() => {
                  setLobbyView('join');
                  onClearJoinError();
                }}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  lobbyView === 'join'
                    ? 'bg-[#1C222B] text-[#A4C639] font-semibold'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Join Server
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyView('create');
                  setPromptRoom(null);
                  onClearJoinError();
                }}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  lobbyView === 'create'
                    ? 'bg-[#1C222B] text-[#A4C639] font-semibold'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Create Server
              </button>
            </div>

            <span className="text-xs text-[#94A3B8]">
              {signalingConnected ? 'WebRTC signaling ready' : 'Connecting to signaling...'}
            </span>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {errorMessage}
            </div>
          )}

          {lobbyView === 'create' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreateServer(serverNameInput, serverPasswordInput);
              }}
              className="space-y-4 p-4 rounded-xl bg-[#181D25] border border-white/8"
            >
              <div className="space-y-1">
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Host a Shared WebRTC Session
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Stream your live {localDeviceMode === 'tv' ? 'Android TV' : 'Nexus One'} display (
                  {localOsLabel}) over WebRTC so anyone connected can control it simultaneously.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="create-server-name"
                    className="block text-xs font-medium text-[#CBD5E1]"
                  >
                    Server Name
                  </label>
                  <input
                    id="create-server-name"
                    type="text"
                    required
                    maxLength={48}
                    value={serverNameInput}
                    onChange={(e) => setServerNameInput(e.target.value)}
                    placeholder="e.g. Android 2.2 Playground"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="create-server-password"
                    className="block text-xs font-medium text-[#CBD5E1]"
                  >
                    Password <span className="text-[#64748B] font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="create-server-password"
                      type={showCreatePassword ? 'text' : 'password'}
                      maxLength={64}
                      value={serverPasswordInput}
                      onChange={(e) => setServerPasswordInput(e.target.value)}
                      placeholder="Leave empty for an open server"
                      className="w-full px-3.5 py-2 pr-10 rounded-lg bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword((v) => !v)}
                      aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1] cursor-pointer"
                    >
                      {showCreatePassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-[#94A3B8]">
                  {serverPasswordInput.length > 0
                    ? 'Shows a lock icon in the server directory'
                    : 'Visible as an open server in the directory'}
                </span>
                <button
                  type="submit"
                  disabled={!serverNameInput.trim() || connectionState === 'creating'}
                  className="px-4 py-2 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {connectionState === 'creating' ? 'Starting...' : 'Create Server'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3.5">
              {/* Server Browser Search & Refresh */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Find servers by name or host..."
                  className="flex-1 px-3.5 py-2 rounded-lg bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
                />
                <button
                  type="button"
                  onClick={onRefreshRooms}
                  className="px-3 py-2 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/10 text-xs font-medium text-[#CBD5E1] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${roomsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {/* Password Prompt Overlay / Inline Form for Locked Servers */}
              {promptRoom && (
                <form
                  onSubmit={handleSubmitJoinPassword}
                  className="p-4 rounded-xl bg-[#181D25] border border-[#A4C639]/40 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-3.5 h-3.5 text-[#A4C639] shrink-0" />
                      <span className="text-xs font-semibold text-[#F1F5F9] truncate">
                        Enter password for {promptRoom.serverName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPromptRoom(null);
                        onClearJoinError();
                      }}
                      className="text-xs text-[#94A3B8] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  {joinError && joinError.roomId === promptRoom.roomId && (
                    <p className="text-xs text-red-400">{joinError.message}</p>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showJoinPassword ? 'text' : 'password'}
                        autoFocus
                        value={promptPassword}
                        onChange={(e) => setPromptPassword(e.target.value)}
                        placeholder="Server password..."
                        className="w-full px-3.5 py-2 pr-9 rounded-lg bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowJoinPassword((v) => !v)}
                        aria-label={showJoinPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1] cursor-pointer"
                      >
                        {showJoinPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={!promptPassword || connectionState === 'joining'}
                      className="px-4 py-2 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {connectionState === 'joining' ? 'Verifying...' : 'Unlock & Connect'}
                    </button>
                  </div>
                </form>
              )}

              {joinError && (!promptRoom || joinError.roomId !== promptRoom.roomId) && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {joinError.message}
                </div>
              )}

              {/* Public Server List */}
              {filteredRooms.length === 0 ? (
                <div className="py-12 px-4 rounded-xl border border-white/8 bg-[#0D1014]/50 text-center space-y-2.5">
                  <Globe className="w-6 h-6 mx-auto text-[#64748B]" />
                  <p className="text-sm font-medium text-[#CBD5E1]">
                    {rooms.length === 0 ? 'No active WebRTC servers online' : 'No servers match your search'}
                  </p>
                  <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                    {rooms.length === 0
                      ? 'Create a server to share your phone or Android TV session with peers around the world.'
                      : 'Try another search term or refresh the server list.'}
                  </p>
                  {rooms.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setLobbyView('create')}
                      className="mt-1 px-4 py-2 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Create First Server
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#181D25] overflow-hidden">
                  {filteredRooms.map((room) => (
                    <div
                      key={room.roomId}
                      className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {room.hasPassword && (
                            <Lock
                              className="w-3.5 h-3.5 text-[#A4C639] shrink-0"
                              aria-label="Password protected server"
                            />
                          )}
                          <span className="text-xs font-semibold text-[#F1F5F9] truncate">
                            {room.serverName}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#94A3B8]">
                          <span>Host: {room.hostName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            {room.deviceMode === 'tv' ? (
                              <Monitor className="w-3 h-3" />
                            ) : (
                              <Smartphone className="w-3 h-3" />
                            )}
                            {room.osLabel}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {room.peerCount} {room.peerCount === 1 ? 'user' : 'users'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleClickRoom(room)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#A4C639] hover:bg-[#B2D546] text-[#0D1014] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Active Multiuser WebRTC Room */
        <div className="space-y-4">
          {/* Room Header Strip */}
          <div className="p-3.5 rounded-xl bg-[#181D25] border border-white/8 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {activeRoom?.hasPassword && (
                  <Lock className="w-3.5 h-3.5 text-[#A4C639] shrink-0" />
                )}
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9] truncate">
                  {activeRoom?.serverName || 'Active Server'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#94A3B8]">
                <span className="text-[#A4C639] font-medium">
                  {role === 'host'
                    ? 'Hosting via WebRTC'
                    : connectionState === 'connected'
                    ? 'Connected via WebRTC'
                    : 'Connecting P2P...'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Shared simultaneous control active</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onLeaveRoom}
              className="px-3 py-1.5 rounded-lg bg-[#1C222B] hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-xs font-medium text-[#F1F5F9] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              {role === 'host' ? 'Stop Server' : 'Leave Server'}
            </button>
          </div>

          {/* Connected Participants Roster */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#CBD5E1] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#A4C639]" />
                Participants
              </span>
              <span className="font-mono tabular-nums text-[#94A3B8]">
                {participants.length} online
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <div
                  key={p.peerId}
                  className="px-2.5 py-1 rounded-md bg-[#0D1014] border border-white/8 flex items-center gap-2 text-xs text-[#E2E8F0]"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="font-medium">{p.username}</span>
                  <span className="text-[11px] text-[#64748B]">
                    {p.role === 'host' ? 'Host' : 'Guest'}
                    {p.peerId === myPeerId ? ' · You' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Live WebRTC DataChannel Chat */}
          <div className="border-t border-white/8 pt-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#CBD5E1]">Session Chat</span>
              <span className="text-[11px] text-[#64748B]">WebRTC DataChannel</span>
            </div>

            <div
              ref={chatViewportRef}
              className="h-44 overflow-y-auto rounded-lg bg-[#0A0D12] border border-white/8 p-3 space-y-2 text-xs"
            >
              {chatMessages.map((msg) => (
                <div key={msg.id} className="leading-relaxed">
                  {msg.system ? (
                    <div className="text-[#64748B] flex items-baseline gap-2">
                      <span className="font-mono tabular-nums text-[10px] shrink-0">
                        {formatMessageTime(msg.timestamp)}
                      </span>
                      <span>{msg.text}</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono tabular-nums text-[10px] text-[#475569] shrink-0">
                        {formatMessageTime(msg.timestamp)}
                      </span>
                      <span
                        className="font-semibold shrink-0"
                        style={{ color: msg.senderColor }}
                      >
                        {msg.senderName}:
                      </span>
                      <span className="text-[#E2E8F0] break-words">{msg.text}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                onSendChat(chatInput);
                setChatInput('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                maxLength={400}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message everyone in this session..."
                className="flex-1 px-3.5 py-2 rounded-lg bg-[#0D1014] border border-white/10 text-xs text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#A4C639]"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="px-3.5 py-2 rounded-lg bg-[#1C222B] hover:bg-[#242B36] border border-white/10 text-xs font-medium text-[#F1F5F9] flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
