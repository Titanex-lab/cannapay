import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../services/auth.service';

let io: Server | null = null;

// Initialize Socket.io on the HTTP server
export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyToken(token);
      (socket as any).user = payload;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    const locationId = user.locationId;
    
    console.log(`Socket connected: user=${user.userId}, location=${locationId}`);
    
    // Join location-specific room
    if (locationId) {
      socket.join(`location:${locationId}`);
    }
    
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: user=${user.userId}`);
    });
  });

  return io;
}

// Get the io instance (null if not initialized)
export function getIO(): Server | null {
  return io;
}

// Broadcast inventory update to all clients in a location
export function broadcastInventoryUpdate(locationId: string, data: {
  productId: string;
  productName?: string;
  newQuantity: number;
  timestamp: string;
}) {
  if (!io) return;
  io.to(`location:${locationId}`).emit('inventory:update', data);
}

// Broadcast multiple inventory updates
export function broadcastInventoryUpdates(locationId: string, updates: Array<{
  productId: string;
  productName?: string;
  newQuantity: number;
}>) {
  if (!io) return;
  const timestamp = new Date().toISOString();
  for (const update of updates) {
    io.to(`location:${locationId}`).emit('inventory:update', { ...update, timestamp });
  }
  // Also emit a batch event
  io.to(`location:${locationId}`).emit('inventory:batch-update', { updates, timestamp });
}
