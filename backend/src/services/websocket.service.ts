import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { jobProcessor } from './jobProcessor.service.js';

interface SocketUser {
  id: string;
  email: string;
  role: string;
}

export class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, SocketUser> = new Map();
  private jobProcessorListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  initialize(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        credentials: true,
      },
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        const user: SocketUser = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        };

        socket.data.user = user;
        this.connectedUsers.set(socket.id, user);
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.data.user.email} connected`);

      // Join user-specific room
      socket.join(`user:${socket.data.user.id}`);

      // Subscribe to job updates
      socket.on('subscribe:job', (jobId: string) => {
        socket.join(`job:${jobId}`);
        
        // Send current job status
        const jobStatus = jobProcessor.getJobStatus(jobId);
        if (jobStatus) {
          socket.emit('job:status', {
            jobId,
            status: jobStatus.status,
            progress: jobStatus.progress,
            progressMessage: jobStatus.progressMessage,
            matchedCount: jobStatus.matchedCount,
            itemCount: jobStatus.itemCount,
          });
        }
      });

      // Unsubscribe from job updates
      socket.on('unsubscribe:job', (jobId: string) => {
        socket.leave(`job:${jobId}`);
      });

      // Get processor status
      socket.on('processor:status', () => {
        const status = jobProcessor.getQueueStatus();
        socket.emit('processor:status', status);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.data.user.email} disconnected`);
        this.connectedUsers.delete(socket.id);
      });
    });

    // Listen to job processor events
    this.setupJobProcessorListeners();
  }

  private setupJobProcessorListeners() {
    // Remove any existing listeners first
    this.cleanupListeners();

    // Define handlers
    const handlers = [
      { event: 'job:queued', handler: (data: any) => this.emitToUser(data.userId, 'job:queued', data) },
      { event: 'job:started', handler: (data: any) => this.emitToJob(data.jobId, 'job:started', data) },
      { event: 'job:progress', handler: (data: any) => this.emitToJob(data.jobId, 'job:progress', data) },
      { event: 'job:completed', handler: (data: any) => this.emitToJob(data.jobId, 'job:completed', data) },
      { event: 'job:failed', handler: (data: any) => this.emitToJob(data.jobId, 'job:failed', data) },
      { event: 'job:cancelled', handler: (data: any) => this.emitToJob(data.jobId, 'job:cancelled', data) },
      { event: 'job:log', handler: (data: any) => this.emitToJob(data.jobId, 'job:log', data) },
    ];

    // Register handlers and store references
    handlers.forEach(({ event, handler }) => {
      jobProcessor.on(event, handler);
      this.jobProcessorListeners.push({ event, handler });
    });
  }

  private cleanupListeners() {
    // Remove all registered listeners
    this.jobProcessorListeners.forEach(({ event, handler }) => {
      jobProcessor.removeListener(event, handler);
    });
    this.jobProcessorListeners = [];
  }

  private emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  private emitToJob(jobId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`job:${jobId}`).emit(event, data);
    }
  }

  // Emit to all connected users
  broadcast(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Cleanup method for graceful shutdown
  async shutdown() {
    if (this.io) {
      // Remove all event listeners
      this.cleanupListeners();
      
      // Disconnect all clients
      const sockets = await this.io.fetchSockets();
      sockets.forEach(socket => {
        socket.disconnect(true);
      });
      
      // Close the server
      this.io.close();
      this.io = null;
      
      // Clear connected users
      this.connectedUsers.clear();
    }
  }
}

export const websocketService = new WebSocketService();