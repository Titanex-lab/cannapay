import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as messagingService from '../services/messaging.service';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── POST /whatsapp — Send bulk WhatsApp messages ─────────────────────

router.post(
  '/whatsapp',
  authenticate,
  requireRole('store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { customerIds, message } = req.body;
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      res.status(400).json({ error: { message: 'customerIds array is required', statusCode: 400 } });
      return;
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: { message: 'message is required', statusCode: 400 } });
      return;
    }

    const results = await messagingService.sendBulkWhatsApp(
      customerIds,
      message.trim(),
      req.user!.id,
    );

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    res.json({ sent, failed, total: results.length, results });
  }),
);

// ── GET /history — Message log ───────────────────────────────────────

router.get(
  '/history',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const result = await messagingService.getMessageHistory(limit, offset);
    res.json(result);
  }),
);

// ── POST /telegram — Send bulk Telegram messages ─────────────────────

router.post(
  '/telegram',
  authenticate,
  requireRole('store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { customerIds, message } = req.body;
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      res.status(400).json({ error: { message: 'customerIds array is required', statusCode: 400 } });
      return;
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: { message: 'message is required', statusCode: 400 } });
      return;
    }

    const results = await messagingService.sendBulkTelegram(
      customerIds,
      message.trim(),
      req.user!.id,
    );

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    res.json({ sent, failed, total: results.length, results });
  }),
);

// ── POST /telegram/webhook — Receive Telegram messages ───────────────

router.post(
  '/telegram/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const update = req.body;
    console.log('[telegram webhook]', JSON.stringify(update).slice(0, 200));

    // Extract message details
    const msg = update?.message || update?.edited_message;
    if (!msg) {
      res.sendStatus(200);
      return;
    }

    const chatId = String(msg.chat?.id);
    const firstName = msg.chat?.first_name || msg.from?.first_name || '';
    const lastName = msg.chat?.last_name || msg.from?.last_name || '';
    const phone = msg.contact?.phone_number || msg.text?.match(/\+?\d{10,15}/)?.[0] || null;

    if (!chatId) {
      res.sendStatus(200);
      return;
    }

    // Try to find existing customer by phone or name
    const { prisma } = await import('../index');
    let customer = null;

    if (phone) {
      customer = await prisma.customer.findFirst({ where: { phone } });
    }

    if (!customer && firstName) {
      customer = await prisma.customer.findFirst({
        where: { firstName: { contains: firstName, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (customer) {
      // Update existing customer with telegramChatId
      await prisma.customer.update({
        where: { id: customer.id },
        data: { telegramChatId: chatId },
      });
      console.log(`[telegram] Linked ${customer.firstName} (${customer.id}) to chat ${chatId}`);
    } else {
      // Create a minimal customer record
      const defaultLocation = await prisma.location.findFirst({ orderBy: { createdAt: 'asc' } });
      if (defaultLocation) {
        const newCust = await prisma.customer.create({
          data: {
            firstName: firstName || 'Telegram',
            lastName: lastName || 'User',
            phone: phone || null,
            locationId: defaultLocation.id,
            telegramChatId: chatId,
          },
        });
        console.log(`[telegram] Created customer ${newCust.id} for chat ${chatId}`);
      }
    }

    // Auto-reply welcome message
    const { config } = await import('../config');
    if (config.telegramBotToken) {
      try {
        await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Welcome to CannaPay! 🌿\n\nYou're now connected. You'll receive promotional updates and offers here.\n\nReply STOP to unsubscribe.`,
          }),
        });
      } catch (e: any) {
        console.error('[telegram] Auto-reply failed:', e.message);
      }
    }

    res.sendStatus(200);
  }),
);

export default router;
