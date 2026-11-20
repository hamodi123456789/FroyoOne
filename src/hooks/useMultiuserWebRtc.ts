import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AndroidHardwareKey,
  DeviceMode,
  EmulatorStatus,
  MultiuserChatMessage,
  MultiuserConnectionState,
  MultiuserDataMessage,
  MultiuserParticipant,
  MultiuserRole,
  MultiuserRoomSummary,
  RemoteCursorState,
} from '../types/emulator';

export const MULTIUSER_USERNAME_KEY = 'froyoone_multiuser_username';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const PEER_COLORS = [
  '#A4C639',
  '#38BDF8',
  '#F97316',
  '#E879F9',
  '#FACC15',
  '#34D399',
  '#FB7185',
  '#818CF8',
];

function getDefaultUsername(): string {
  try {
    const saved = window.localStorage.getItem(MULTIUSER_USERNAME_KEY);
    if (saved && saved.trim()) return saved.trim().slice(0, 28);
  } catch {
    // ignore storage errors
  }
  const generated = `Player-${Math.floor(1000 + Math.random() * 9000)}`;
  try {
    window.localStorage.setItem(MULTIUSER_USERNAME_KEY, generated);
  } catch {
    // ignore
  }
  return generated;
}

interface HostPeerSlot {
  peerId: string;
  username: string;
  color: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
}

interface UseMultiuserWebRtcOptions {
  screenRef: React.RefObject<HTMLDivElement | null>;
  localDeviceMode: DeviceMode;
  localOsLabel: string;
  localVmStatus: EmulatorStatus;
  onRemoteMouseMove: (x: number, y: number) => void;
  onRemoteMouseButton: (button: 'left' | 'middle' | 'right', down: boolean, x: number, y: number) => void;
  onRemoteMouseWheel: (deltaY: number) => void;
  onRemoteHardwareKey: (key: AndroidHardwareKey) => void;
  onRemoteScancodes: (codes: number[]) => void;
}

export function useMultiuserWebRtc({
  screenRef,
  localDeviceMode,
  localOsLabel,
  localVmStatus,
  onRemoteMouseMove,
  onRemoteMouseButton,
  onRemoteMouseWheel,
  onRemoteHardwareKey,
  onRemoteScancodes,
}: UseMultiuserWebRtcOptions) {
  const [username, setUsername] = useState<string>(getDefaultUsername);
  const [signalingConnected, setSignalingConnected] = useState<boolean>(false);
  const [rooms, setRooms] = useState<MultiuserRoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState<boolean>(true);
  const [role, setRole] = useState<MultiuserRole>('none');
  const [connectionState, setConnectionState] = useState<MultiuserConnectionState>('idle');
  const [activeRoom, setActiveRoom] = useState<MultiuserRoomSummary | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MultiuserParticipant[]>([]);
  const [chatMessages, setChatMessages] = useState<MultiuserChatMessage[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursorState[]>([]);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [hostDeviceMode, setHostDeviceMode] = useState<DeviceMode>('phone');
  const [hostOsLabel, setHostOsLabel] = useState<string>('Android 2.2 (Froyo)');
  const [hostVmStatus, setHostVmStatus] = useState<EmulatorStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ roomId: string; code: string; message: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const roleRef = useRef<MultiuserRole>('none');
  const activeRoomRef = useRef<MultiuserRoomSummary | null>(null);
  const myPeerIdRef = useRef<string | null>(null);
  const usernameRef = useRef<string>(username);
  const hostPeersRef = useRef<Map<string, HostPeerSlot>>(new Map());
  const guestPcRef = useRef<RTCPeerConnection | null>(null);
  const guestDcRef = useRef<RTCDataChannel | null>(null);
  const guestHostIdRef = useRef<string | null>(null);
  const guestPendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const guestTimeoutRef = useRef<number | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorCursorIndexRef = useRef<number>(1);
  const lastCursorSentAtRef = useRef<number>(0);
  const lastMoveSentAtRef = useRef<number>(0);

  const localMetaRef = useRef({
    deviceMode: localDeviceMode,
    osLabel: localOsLabel,
    vmStatus: localVmStatus,
  });
  localMetaRef.current = {
    deviceMode: localDeviceMode,
    osLabel: localOsLabel,
    vmStatus: localVmStatus,
  };

  const remoteCallbacksRef = useRef({
    onRemoteMouseMove,
    onRemoteMouseButton,
    onRemoteMouseWheel,
    onRemoteHardwareKey,
    onRemoteScancodes,
  });
  remoteCallbacksRef.current = {
    onRemoteMouseMove,
    onRemoteMouseButton,
    onRemoteMouseWheel,
    onRemoteHardwareKey,
    onRemoteScancodes,
  };

  usernameRef.current = username;
  roleRef.current = role;
  activeRoomRef.current = activeRoom;
  myPeerIdRef.current = myPeerId;

  const sendWs = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const appendChat = useCallback((entry: MultiuserChatMessage) => {
    setChatMessages((prev) => {
      const next = [...prev, entry];
      return next.length > 150 ? next.slice(-150) : next;
    });
  }, []);

  const buildHostParticipants = useCallback((): MultiuserParticipant[] => {
    const hostEntry: MultiuserParticipant = {
      peerId: myPeerIdRef.current || 'host',
      username: usernameRef.current,
      role: 'host',
      color: PEER_COLORS[0],
    };
    const guests: MultiuserParticipant[] = Array.from(hostPeersRef.current.values()).map((slot) => ({
      peerId: slot.peerId,
      username: slot.username,
      role: 'guest',
      color: slot.color,
    }));
    return [hostEntry, ...guests];
  }, []);

  const broadcastFromHost = useCallback((msg: MultiuserDataMessage, excludePeerId?: string) => {
    const raw = JSON.stringify(msg);
    for (const slot of hostPeersRef.current.values()) {
      if (excludePeerId && slot.peerId === excludePeerId) continue;
      if (slot.dc && slot.dc.readyState === 'open') {
        try {
          slot.dc.send(raw);
        } catch {
          // ignore transient send failures
        }
      }
    }
  }, []);

  const syncHostRoster = useCallback(() => {
    if (roleRef.current !== 'host') return;
    const roster = buildHostParticipants();
    setParticipants(roster);
    setActiveRoom((prev) => (prev ? { ...prev, peerCount: roster.length } : prev));
    broadcastFromHost({
      type: 'room_state',
      participants: roster,
      deviceMode: localMetaRef.current.deviceMode,
      osLabel: localMetaRef.current.osLabel,
      vmStatus: localMetaRef.current.vmStatus,
    });
  }, [broadcastFromHost, buildHostParticipants]);

  const stopCaptureStream = useCallback(() => {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (captureStreamRef.current) {
      for (const track of captureStreamRef.current.getTracks()) {
        track.stop();
      }
      captureStreamRef.current = null;
    }
    captureCanvasRef.current = null;
  }, []);

  const startCaptureStream = useCallback((): MediaStream => {
    if (captureStreamRef.current) return captureStreamRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 540;
    captureCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d');

    const drawFrame = () => {
      if (!ctx) return;
      const hostEl = screenRef.current;
      const v86Canvas = hostEl?.querySelector('canvas') as HTMLCanvasElement | null;
      const textEl = hostEl?.firstElementChild as HTMLElement | null;

      if (v86Canvas && v86Canvas.style.display !== 'none' && v86Canvas.width > 0 && v86Canvas.height > 0) {
        if (canvas.width !== v86Canvas.width || canvas.height !== v86Canvas.height) {
          canvas.width = v86Canvas.width;
          canvas.height = v86Canvas.height;
        }
        ctx.drawImage(v86Canvas, 0, 0);
        return;
      }

      if (canvas.width !== 720 || canvas.height !== 540) {
        canvas.width = 720;
        canvas.height = 540;
      }
      ctx.fillStyle = '#0A0D12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const textContent = textEl?.textContent || '';
      if (textContent.trim().length > 0) {
        const lines = textContent.split('\n').slice(0, 30);
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '13px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let y = 18;
        for (const line of lines) {
          ctx.fillText(line.slice(0, 86), 16, y);
          y += 17;
        }
      } else {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 18px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Host session ready · Waiting for emulator boot', canvas.width / 2, canvas.height / 2 - 12);
        ctx.fillStyle = '#64748B';
        ctx.font = '13px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Live Android video will stream automatically once booted', canvas.width / 2, canvas.height / 2 + 16);
      }
    };

    drawFrame();
    captureTimerRef.current = window.setInterval(drawFrame, 33);
    const stream = canvas.captureStream(30);
    captureStreamRef.current = stream;
    return stream;
  }, [screenRef]);

  const cleanupPeerConnections = useCallback(() => {
    for (const slot of hostPeersRef.current.values()) {
      try {
        slot.dc?.close();
      } catch {
        // ignore
      }
      try {
        slot.pc.close();
      } catch {
        // ignore
      }
    }
    hostPeersRef.current.clear();

    if (guestDcRef.current) {
      try {
        guestDcRef.current.close();
      } catch {
        // ignore
      }
      guestDcRef.current = null;
    }
    if (guestPcRef.current) {
      try {
        guestPcRef.current.close();
      } catch {
        // ignore
      }
      guestPcRef.current = null;
    }
    guestHostIdRef.current = null;
    guestPendingIceRef.current = [];
    if (guestTimeoutRef.current !== null) {
      window.clearTimeout(guestTimeoutRef.current);
      guestTimeoutRef.current = null;
    }
    stopCaptureStream();
    setRemoteStream(null);
    setRemoteCursors([]);
    setParticipants([]);
  }, [stopCaptureStream]);

  const leaveRoom = useCallback(
    (notifyServer = true) => {
      if (notifyServer && roleRef.current !== 'none') {
        sendWs({ type: 'leave_room' });
      }
      cleanupPeerConnections();
      setRole('none');
      setConnectionState('idle');
      setActiveRoom(null);
      setChatMessages([]);
      setErrorMessage(null);
    },
    [cleanupPeerConnections, sendWs]
  );

  // Clean up expired remote cursors automatically
  useEffect(() => {
    if (role === 'none') return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => prev.filter((c) => now - c.updatedAt < 4500));
    }, 1500);
    return () => window.clearInterval(id);
  }, [role]);

  // Sync host deviceMode / OS label / VM status to room directory and peers
  useEffect(() => {
    if (role !== 'host' || !activeRoomRef.current) return;
    sendWs({
      type: 'update_room_meta',
      hostName: username,
      deviceMode: localDeviceMode,
      osLabel: localOsLabel,
    });
    syncHostRoster();
  }, [localDeviceMode, localOsLabel, localVmStatus, role, sendWs, syncHostRoster, username]);

  const handleHostDataMessage = useCallback(
    (peerId: string, raw: string) => {
      let msg: MultiuserDataMessage;
      try {
        msg = JSON.parse(raw) as MultiuserDataMessage;
      } catch {
        return;
      }
      const slot = hostPeersRef.current.get(peerId);
      if (!slot) return;

      switch (msg.type) {
        case 'profile_update': {
          const clean = msg.username.trim().slice(0, 28);
          if (clean && clean !== slot.username) {
            const oldName = slot.username;
            slot.username = clean;
            syncHostRoster();
            const sysMsg: MultiuserChatMessage = {
              id: `sys_${Date.now()}_${Math.random()}`,
              senderId: 'system',
              senderName: 'System',
              senderColor: '#94A3B8',
              text: `${oldName} changed name to ${clean}`,
              timestamp: Date.now(),
              system: true,
            };
            appendChat(sysMsg);
            broadcastFromHost({
              type: 'chat',
              id: sysMsg.id,
              senderId: sysMsg.senderId,
              senderName: sysMsg.senderName,
              senderColor: sysMsg.senderColor,
              text: sysMsg.text,
              timestamp: sysMsg.timestamp,
            });
          }
          break;
        }
        case 'cursor': {
          const cursorPayload: MultiuserDataMessage = {
            type: 'cursor',
            peerId,
            username: slot.username,
            color: slot.color,
            x: msg.x,
            y: msg.y,
            visible: msg.visible,
          };
          setRemoteCursors((prev) => {
            const filtered = prev.filter((c) => c.peerId !== peerId);
            if (!msg.visible) return filtered;
            return [
              ...filtered,
              {
                peerId,
                username: slot.username,
                color: slot.color,
                x: msg.x,
                y: msg.y,
                visible: true,
                updatedAt: Date.now(),
              },
            ];
          });
          broadcastFromHost(cursorPayload, peerId);
          break;
        }
        case 'input_mouse_move': {
          remoteCallbacksRef.current.onRemoteMouseMove(msg.x, msg.y);
          break;
        }
        case 'input_mouse_button': {
          remoteCallbacksRef.current.onRemoteMouseButton(msg.button, msg.down, msg.x, msg.y);
          break;
        }
        case 'input_mouse_wheel': {
          remoteCallbacksRef.current.onRemoteMouseWheel(msg.deltaY);
          break;
        }
        case 'input_hw_key': {
          remoteCallbacksRef.current.onRemoteHardwareKey(msg.key);
          break;
        }
        case 'input_scancodes': {
          remoteCallbacksRef.current.onRemoteScancodes(msg.codes);
          break;
        }
        case 'chat': {
          const cleanText = msg.text.trim().slice(0, 400);
          if (!cleanText) return;
          const entry: MultiuserChatMessage = {
            id: msg.id,
            senderId: peerId,
            senderName: slot.username,
            senderColor: slot.color,
            text: cleanText,
            timestamp: msg.timestamp || Date.now(),
          };
          appendChat(entry);
          broadcastFromHost(
            {
              type: 'chat',
              id: entry.id,
              senderId: entry.senderId,
              senderName: entry.senderName,
              senderColor: entry.senderColor,
              text: entry.text,
              timestamp: entry.timestamp,
            },
            peerId
          );
          break;
        }
      }
    },
    [appendChat, broadcastFromHost, syncHostRoster]
  );

  const handleGuestDataMessage = useCallback(
    (raw: string) => {
      let msg: MultiuserDataMessage;
      try {
        msg = JSON.parse(raw) as MultiuserDataMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'room_state': {
          setParticipants(msg.participants);
          setHostDeviceMode(msg.deviceMode);
          setHostOsLabel(msg.osLabel);
          setHostVmStatus(msg.vmStatus);
          setActiveRoom((prev) =>
            prev
              ? {
                  ...prev,
                  deviceMode: msg.deviceMode,
                  osLabel: msg.osLabel,
                  peerCount: msg.participants.length,
                }
              : prev
          );
          break;
        }
        case 'cursor': {
          if (!msg.peerId || msg.peerId === myPeerIdRef.current) return;
          setRemoteCursors((prev) => {
            const filtered = prev.filter((c) => c.peerId !== msg.peerId);
            if (!msg.visible) return filtered;
            return [
              ...filtered,
              {
                peerId: msg.peerId!,
                username: msg.username || 'Peer',
                color: msg.color || '#38BDF8',
                x: msg.x,
                y: msg.y,
                visible: true,
                updatedAt: Date.now(),
              },
            ];
          });
          break;
        }
        case 'chat': {
          appendChat({
            id: msg.id,
            senderId: msg.senderId,
            senderName: msg.senderName,
            senderColor: msg.senderColor,
            text: msg.text,
            timestamp: msg.timestamp,
            system: msg.senderId === 'system',
          });
          break;
        }
      }
    },
    [appendChat]
  );

  const initiateHostConnectionToPeer = useCallback(
    async (roomId: string, peerId: string, peerName: string) => {
      const existing = hostPeersRef.current.get(peerId);
      if (existing) {
        existing.pc.close();
        hostPeersRef.current.delete(peerId);
      }

      const color = PEER_COLORS[colorCursorIndexRef.current % PEER_COLORS.length];
      colorCursorIndexRef.current += 1;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const stream = startCaptureStream();
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const dc = pc.createDataChannel('froyoone-control', { ordered: true });
      const slot: HostPeerSlot = {
        peerId,
        username: peerName,
        color,
        pc,
        dc,
        pendingIce: [],
      };
      hostPeersRef.current.set(peerId, slot);

      dc.onopen = () => {
        syncHostRoster();
        const joinNotice: MultiuserChatMessage = {
          id: `sys_${Date.now()}_${Math.random()}`,
          senderId: 'system',
          senderName: 'System',
          senderColor: '#94A3B8',
          text: `${slot.username} joined via WebRTC`,
          timestamp: Date.now(),
          system: true,
        };
        appendChat(joinNotice);
        broadcastFromHost({
          type: 'chat',
          id: joinNotice.id,
          senderId: joinNotice.senderId,
          senderName: joinNotice.senderName,
          senderColor: joinNotice.senderColor,
          text: joinNotice.text,
          timestamp: joinNotice.timestamp,
        });
      };

      dc.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          handleHostDataMessage(peerId, ev.data);
        }
      };

      dc.onclose = () => {
        if (hostPeersRef.current.has(peerId)) {
          const leftName = hostPeersRef.current.get(peerId)?.username || peerName;
          hostPeersRef.current.delete(peerId);
          setRemoteCursors((prev) => prev.filter((c) => c.peerId !== peerId));
          syncHostRoster();
          appendChat({
            id: `sys_${Date.now()}_${Math.random()}`,
            senderId: 'system',
            senderName: 'System',
            senderColor: '#94A3B8',
            text: `${leftName} disconnected`,
            timestamp: Date.now(),
            system: true,
          });
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendWs({
            type: 'signal',
            roomId,
            targetPeerId: peerId,
            payload: { type: 'ice', candidate: ev.candidate.toJSON() },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (hostPeersRef.current.has(peerId)) {
            hostPeersRef.current.delete(peerId);
            setRemoteCursors((prev) => prev.filter((c) => c.peerId !== peerId));
            syncHostRoster();
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWs({
        type: 'signal',
        roomId,
        targetPeerId: peerId,
        payload: { type: 'offer', sdp: offer.sdp },
      });
    },
    [appendChat, broadcastFromHost, handleHostDataMessage, sendWs, startCaptureStream, syncHostRoster]
  );

  const setupGuestPeerConnection = useCallback(
    (room: MultiuserRoomSummary, hostPeerId: string) => {
      if (guestPcRef.current) {
        guestPcRef.current.close();
      }
      guestHostIdRef.current = hostPeerId;
      guestPendingIceRef.current = [];

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      guestPcRef.current = pc;

      if (guestTimeoutRef.current !== null) {
        window.clearTimeout(guestTimeoutRef.current);
      }
      guestTimeoutRef.current = window.setTimeout(() => {
        if (roleRef.current === 'guest' && guestDcRef.current?.readyState !== 'open') {
          setConnectionState('error');
          setErrorMessage(
            'WebRTC peer connection timed out. A strict NAT or firewall may be blocking direct P2P traffic.'
          );
        }
      }, 15000);

      pc.ontrack = (ev) => {
        if (ev.streams && ev.streams[0]) {
          setRemoteStream(ev.streams[0]);
        } else {
          const fallback = new MediaStream([ev.track]);
          setRemoteStream(fallback);
        }
      };

      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        guestDcRef.current = dc;
        dc.onopen = () => {
          if (guestTimeoutRef.current !== null) {
            window.clearTimeout(guestTimeoutRef.current);
            guestTimeoutRef.current = null;
          }
          setConnectionState('connected');
          dc.send(JSON.stringify({ type: 'profile_update', username: usernameRef.current }));
        };
        dc.onmessage = (msgEv) => {
          if (typeof msgEv.data === 'string') {
            handleGuestDataMessage(msgEv.data);
          }
        };
        dc.onclose = () => {
          if (roleRef.current === 'guest') {
            setConnectionState('error');
            setErrorMessage('WebRTC data channel closed.');
          }
        };
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate && guestHostIdRef.current) {
          sendWs({
            type: 'signal',
            roomId: room.roomId,
            targetPeerId: guestHostIdRef.current,
            payload: { type: 'ice', candidate: ev.candidate.toJSON() },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          if (guestTimeoutRef.current !== null) {
            window.clearTimeout(guestTimeoutRef.current);
            guestTimeoutRef.current = null;
          }
          setConnectionState('connected');
        } else if (pc.connectionState === 'failed') {
          if (guestTimeoutRef.current !== null) {
            window.clearTimeout(guestTimeoutRef.current);
            guestTimeoutRef.current = null;
          }
          setConnectionState('error');
          setErrorMessage('WebRTC peer connection failed (NAT/firewall restriction).');
        }
      };
    },
    [handleGuestDataMessage, sendWs]
  );

  // Connect & maintain WebSocket signaling connection
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/webrtc-signaling`);
      wsRef.current = ws;

      ws.onopen = () => {
        setSignalingConnected(true);
        setRoomsLoading(false);
        ws.send(JSON.stringify({ type: 'list_rooms' }));
      };

      ws.onmessage = async (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'welcome': {
            if (typeof msg.clientId === 'string') {
              setMyPeerId(msg.clientId);
            }
            break;
          }
          case 'rooms_list': {
            if (Array.isArray(msg.rooms)) {
              setRooms(msg.rooms as MultiuserRoomSummary[]);
              setRoomsLoading(false);
            }
            break;
          }
          case 'create_error': {
            setConnectionState('error');
            setErrorMessage(typeof msg.message === 'string' ? msg.message : 'Unable to create server.');
            break;
          }
          case 'room_created': {
            const room = msg.room as MultiuserRoomSummary;
            const peerId = String(msg.peerId);
            setMyPeerId(peerId);
            myPeerIdRef.current = peerId;
            setRole('host');
            roleRef.current = 'host';
            setActiveRoom(room);
            setConnectionState('connected');
            setErrorMessage(null);
            setJoinError(null);
            startCaptureStream();
            setParticipants([
              {
                peerId,
                username: usernameRef.current,
                role: 'host',
                color: PEER_COLORS[0],
              },
            ]);
            setChatMessages([
              {
                id: `sys_${Date.now()}`,
                senderId: 'system',
                senderName: 'System',
                senderColor: '#94A3B8',
                text: `Hosting "${room.serverName}" via WebRTC. Anyone in the room can control the device.`,
                timestamp: Date.now(),
                system: true,
              },
            ]);
            break;
          }
          case 'join_error': {
            setConnectionState('idle');
            setJoinError({
              roomId: typeof msg.roomId === 'string' ? msg.roomId : '',
              code: typeof msg.code === 'string' ? msg.code : 'ERROR',
              message: typeof msg.message === 'string' ? msg.message : 'Unable to join server.',
            });
            break;
          }
          case 'joined_room': {
            const room = msg.room as MultiuserRoomSummary;
            const peerId = String(msg.peerId);
            const hostPeerId = String(msg.hostPeerId);
            setMyPeerId(peerId);
            myPeerIdRef.current = peerId;
            setRole('guest');
            roleRef.current = 'guest';
            setActiveRoom(room);
            setHostDeviceMode(room.deviceMode);
            setHostOsLabel(room.osLabel);
            setConnectionState('connecting_p2p');
            setErrorMessage(null);
            setJoinError(null);
            setChatMessages([
              {
                id: `sys_${Date.now()}`,
                senderId: 'system',
                senderName: 'System',
                senderColor: '#94A3B8',
                text: `Establishing WebRTC connection to "${room.serverName}"...`,
                timestamp: Date.now(),
                system: true,
              },
            ]);
            setupGuestPeerConnection(room, hostPeerId);
            break;
          }
          case 'peer_joined': {
            if (roleRef.current !== 'host') return;
            const roomId = String(msg.roomId);
            const peerId = String(msg.peerId);
            const peerName = typeof msg.username === 'string' ? msg.username : 'Guest';
            await initiateHostConnectionToPeer(roomId, peerId, peerName);
            break;
          }
          case 'peer_left': {
            if (roleRef.current !== 'host') return;
            const peerId = String(msg.peerId);
            const slot = hostPeersRef.current.get(peerId);
            if (slot) {
              const leftName = slot.username;
              try {
                slot.dc?.close();
              } catch {
                // ignore
              }
              try {
                slot.pc.close();
              } catch {
                // ignore
              }
              hostPeersRef.current.delete(peerId);
              setRemoteCursors((prev) => prev.filter((c) => c.peerId !== peerId));
              syncHostRoster();
              appendChat({
                id: `sys_${Date.now()}_${Math.random()}`,
                senderId: 'system',
                senderName: 'System',
                senderColor: '#94A3B8',
                text: `${leftName} left the server`,
                timestamp: Date.now(),
                system: true,
              });
            }
            break;
          }
          case 'room_closed': {
            if (roleRef.current === 'guest') {
              const reason = typeof msg.reason === 'string' ? msg.reason : 'Host closed the server.';
              cleanupPeerConnections();
              setRole('none');
              setActiveRoom(null);
              setConnectionState('error');
              setErrorMessage(reason);
            }
            break;
          }
          case 'signal': {
            const fromPeerId = String(msg.fromPeerId);
            const roomId = String(msg.roomId);
            const payload = msg.payload as { type: string; sdp?: string; candidate?: RTCIceCandidateInit };
            if (!payload) return;

            if (roleRef.current === 'host') {
              const slot = hostPeersRef.current.get(fromPeerId);
              if (!slot) return;
              if (payload.type === 'answer' && payload.sdp) {
                await slot.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
                for (const c of slot.pendingIce) {
                  await slot.pc.addIceCandidate(c);
                }
                slot.pendingIce = [];
              } else if (payload.type === 'ice' && payload.candidate) {
                if (slot.pc.remoteDescription) {
                  await slot.pc.addIceCandidate(payload.candidate);
                } else {
                  slot.pendingIce.push(payload.candidate);
                }
              }
            } else if (roleRef.current === 'guest' && guestPcRef.current) {
              const pc = guestPcRef.current;
              if (payload.type === 'offer' && payload.sdp) {
                await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
                for (const c of guestPendingIceRef.current) {
                  await pc.addIceCandidate(c);
                }
                guestPendingIceRef.current = [];
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendWs({
                  type: 'signal',
                  roomId,
                  targetPeerId: fromPeerId,
                  payload: { type: 'answer', sdp: answer.sdp },
                });
              } else if (payload.type === 'ice' && payload.candidate) {
                if (pc.remoteDescription) {
                  await pc.addIceCandidate(payload.candidate);
                } else {
                  guestPendingIceRef.current.push(payload.candidate);
                }
              }
            }
            break;
          }
        }
      };

      ws.onclose = () => {
        setSignalingConnected(false);
        if (!closedByUnmount) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      cleanupPeerConnections();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [
    appendChat,
    cleanupPeerConnections,
    initiateHostConnectionToPeer,
    sendWs,
    setupGuestPeerConnection,
    startCaptureStream,
    syncHostRoster,
  ]);

  const refreshRooms = useCallback(async () => {
    setRoomsLoading(true);
    if (!sendWs({ type: 'list_rooms' })) {
      try {
        const res = await fetch('/api/multiuser/rooms');
        if (res.ok) {
          const data = (await res.json()) as { rooms: MultiuserRoomSummary[] };
          setRooms(data.rooms);
        }
      } catch {
        // ignore network error
      } finally {
        setRoomsLoading(false);
      }
    }
  }, [sendWs]);

  const saveUsername = useCallback(
    (nextRaw: string) => {
      const cleaned = nextRaw.trim().slice(0, 28);
      if (!cleaned) return false;
      setUsername(cleaned);
      usernameRef.current = cleaned;
      try {
        window.localStorage.setItem(MULTIUSER_USERNAME_KEY, cleaned);
      } catch {
        // ignore
      }

      if (roleRef.current === 'host') {
        sendWs({ type: 'update_room_meta', hostName: cleaned });
        syncHostRoster();
      } else if (roleRef.current === 'guest' && guestDcRef.current?.readyState === 'open') {
        guestDcRef.current.send(JSON.stringify({ type: 'profile_update', username: cleaned }));
      }
      return true;
    },
    [sendWs, syncHostRoster]
  );

  const createServer = useCallback(
    (serverName: string, password: string) => {
      const trimmed = serverName.trim();
      if (!trimmed) {
        setErrorMessage('Please enter a server name.');
        return;
      }
      setErrorMessage(null);
      setJoinError(null);
      setConnectionState('creating');
      const sent = sendWs({
        type: 'create_room',
        serverName: trimmed,
        password,
        hostName: usernameRef.current,
        deviceMode: localMetaRef.current.deviceMode,
        osLabel: localMetaRef.current.osLabel,
      });
      if (!sent) {
        setConnectionState('error');
        setErrorMessage('WebRTC signaling server is reconnecting. Please try again in a moment.');
      }
    },
    [sendWs]
  );

  const joinServer = useCallback(
    (roomId: string, password = '') => {
      setErrorMessage(null);
      setJoinError(null);
      setConnectionState('joining');
      const sent = sendWs({
        type: 'join_room',
        roomId,
        password,
        username: usernameRef.current,
      });
      if (!sent) {
        setConnectionState('error');
        setErrorMessage('WebRTC signaling server is reconnecting. Please try again in a moment.');
      }
    },
    [sendWs]
  );

  const sendGuestData = useCallback((payload: MultiuserDataMessage) => {
    const dc = guestDcRef.current;
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify(payload));
      } catch {
        // ignore transient errors
      }
    }
  }, []);

  const sendLocalCursor = useCallback(
    (x: number, y: number, visible: boolean) => {
      if (roleRef.current === 'none') return;
      const now = performance.now();
      if (visible && now - lastCursorSentAtRef.current < 32) return;
      lastCursorSentAtRef.current = now;

      if (roleRef.current === 'host') {
        broadcastFromHost({
          type: 'cursor',
          peerId: myPeerIdRef.current || 'host',
          username: usernameRef.current,
          color: PEER_COLORS[0],
          x,
          y,
          visible,
        });
      } else if (roleRef.current === 'guest') {
        sendGuestData({ type: 'cursor', x, y, visible });
      }
    },
    [broadcastFromHost, sendGuestData]
  );

  const sendRemoteMouseMove = useCallback(
    (x: number, y: number) => {
      if (roleRef.current !== 'guest') return;
      const now = performance.now();
      if (now - lastMoveSentAtRef.current < 30) return;
      lastMoveSentAtRef.current = now;
      sendGuestData({ type: 'input_mouse_move', x, y });
    },
    [sendGuestData]
  );

  const sendRemoteMouseButton = useCallback(
    (button: 'left' | 'middle' | 'right', down: boolean, x: number, y: number) => {
      if (roleRef.current !== 'guest') return;
      sendGuestData({ type: 'input_mouse_button', button, down, x, y });
    },
    [sendGuestData]
  );

  const sendRemoteMouseWheel = useCallback(
    (deltaY: number) => {
      if (roleRef.current !== 'guest') return;
      sendGuestData({ type: 'input_mouse_wheel', deltaY });
    },
    [sendGuestData]
  );

  const sendRemoteHardwareKey = useCallback(
    (key: AndroidHardwareKey) => {
      if (roleRef.current !== 'guest') return;
      sendGuestData({ type: 'input_hw_key', key });
    },
    [sendGuestData]
  );

  const sendRemoteScancodes = useCallback(
    (codes: number[]) => {
      if (roleRef.current !== 'guest' || codes.length === 0) return;
      sendGuestData({ type: 'input_scancodes', codes });
    },
    [sendGuestData]
  );

  const sendChatMessage = useCallback(
    (rawText: string) => {
      const text = rawText.trim().slice(0, 400);
      if (!text || roleRef.current === 'none') return;

      const msgId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = Date.now();
      const myEntry = participants.find((p) => p.peerId === myPeerIdRef.current);
      const myColor = myEntry?.color || PEER_COLORS[0];

      const chatItem: MultiuserChatMessage = {
        id: msgId,
        senderId: myPeerIdRef.current || 'me',
        senderName: usernameRef.current,
        senderColor: myColor,
        text,
        timestamp,
      };
      appendChat(chatItem);

      if (roleRef.current === 'host') {
        broadcastFromHost({
          type: 'chat',
          id: msgId,
          senderId: chatItem.senderId,
          senderName: chatItem.senderName,
          senderColor: chatItem.senderColor,
          text,
          timestamp,
        });
      } else {
        sendGuestData({
          type: 'chat',
          id: msgId,
          senderId: chatItem.senderId,
          senderName: chatItem.senderName,
          senderColor: chatItem.senderColor,
          text,
          timestamp,
        });
      }
    },
    [appendChat, broadcastFromHost, participants, sendGuestData]
  );

  return {
    username,
    saveUsername,
    signalingConnected,
    rooms,
    roomsLoading,
    refreshRooms,
    role,
    connectionState,
    activeRoom,
    myPeerId,
    participants,
    chatMessages,
    remoteCursors,
    remoteStream,
    hostDeviceMode,
    hostOsLabel,
    hostVmStatus,
    errorMessage,
    joinError,
    clearJoinError: () => setJoinError(null),
    createServer,
    joinServer,
    leaveRoom,
    sendLocalCursor,
    sendRemoteMouseMove,
    sendRemoteMouseButton,
    sendRemoteMouseWheel,
    sendRemoteHardwareKey,
    sendRemoteScancodes,
    sendChatMessage,
  };
}
