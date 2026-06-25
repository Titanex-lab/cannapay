import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('auth-storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  // If already connected, return existing socket
  if (socket?.connected) return socket;

  // If disconnected but exists, reconnect
  if (socket) {
    socket.connect();
    return socket;
  }

  const token = getToken();
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

  socket = io(url, {
    auth: { token: token || '' },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
    // If auth error, don't keep retrying
    if (err.message === 'Authentication required' || err.message === 'Invalid token') {
      socket?.disconnect();
    }
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

// Update auth token on the existing socket (e.g. after login)
export function updateSocketAuth(token: string): void {
  if (socket) {
    // For socket.io, we need to disconnect and reconnect with new auth
    socket.disconnect();
    // Update auth and reconnect
    (socket as any).auth = { token };
    socket.connect();
  }
}
