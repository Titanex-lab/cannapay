import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import http from 'http';
import { PrismaClient } from '@prisma/client';
import { config } from './config';
import { AppError } from './utils/errors';
import { initializeSocket } from './socket/inventorySync';
import { startTelegramBot } from './services/telegram-bot.service';
import authRoutes from './routes/auth.routes';
import strainRoutes from './routes/strains.routes';
import batchRoutes from './routes/batches.routes';
import productRoutes from './routes/products.routes';
import inventoryRoutes from './routes/inventory.routes';
import transactionRoutes from './routes/transactions.routes';
import cartRoutes from './routes/cart.routes';
import searchRoutes from './routes/search.routes';
import cashDrawerRoutes from './routes/cashdrawer.routes';
import reportsRoutes from './routes/reports.routes';
import analyticsRoutes from './routes/analytics.routes';
import adminRoutes from './routes/admin.routes';
import customerRoutes from './routes/customer.routes';
import messagingRoutes from './routes/messaging.routes';

// Singleton Prisma client
export const prisma = new PrismaClient();

const app = express();

// --- Security & parsing middleware ---
app.use(cors({ origin: config.corsOrigin }));
app.use(helmet());
app.use(compression());
app.use(express.json());

// --- Health check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/strains', strainRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/cash-drawer', cashDrawerRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/messaging', messagingRoutes);

// --- Global error handler (must be last middleware) ---
app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: {
          message: err.message,
          statusCode: err.statusCode,
        },
      });
      return;
    }

    // Unknown / unexpected error
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        statusCode: 500,
      },
    });
  },
);

// --- Start server ---
const server = http.createServer(app);
initializeSocket(server);
server.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  startTelegramBot();
});

export { app };
