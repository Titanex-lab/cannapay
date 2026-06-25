import { Telegraf } from 'telegraf';
import { config } from '../config';
import { prisma } from '../index';

let bot: Telegraf | null = null;

export function startTelegramBot(): void {
  if (!config.telegramBotToken || config.telegramBotToken.length < 20) {
    console.log('[telegram] No valid bot token — skipping bot startup');
    return;
  }

  bot = new Telegraf(config.telegramBotToken);

  // Handle any incoming message
  bot.on('message', async (ctx) => {
    const msg = ctx.message;
    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name || (msg.chat as any).first_name || '';
    const lastName = msg.from?.last_name || (msg.chat as any).last_name || '';
    const phone =
      ('contact' in msg && msg.contact?.phone_number) ||
      ('text' in msg && msg.text?.match(/\+?\d{10,15}/)?.[0]) ||
      null;

    console.log(`[telegram] Message from ${firstName} (chat ${chatId})`);

    try {
      // Find or create customer
      let customer = null;

      if (phone) {
        customer = await prisma.customer.findFirst({ where: { phone } });
      }

      if (!customer) {
        customer = await prisma.customer.findFirst({
          where: { firstName: { contains: firstName, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (customer) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { telegramChatId: chatId },
        });
        console.log(`[telegram] Linked ${customer.firstName} to chat ${chatId}`);
      } else {
        const defaultLocation = await prisma.location.findFirst({ orderBy: { createdAt: 'asc' } });
        if (defaultLocation) {
          await prisma.customer.create({
            data: {
              firstName: firstName || 'Telegram',
              lastName: lastName || 'User',
              phone: phone || null,
              locationId: defaultLocation.id,
              telegramChatId: chatId,
            },
          });
          console.log(`[telegram] Created customer for chat ${chatId}`);
        }
      }

      // Welcome reply
      await ctx.reply(
        `Welcome to CannaPay! 🌿\n\nYou're now connected. You'll receive promotional updates and offers here.\n\nReply STOP to unsubscribe.`,
      );
    } catch (err: any) {
      console.error('[telegram] Error processing message:', err.message);
    }
  });

  // Handle /start command
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `👋 Welcome to CannaPay!\n\nWe'll keep you updated with the latest products and offers from your local dispensary.\n\nYour chat ID has been saved.`,
    );
  });

  // Handle /stop command
  bot.command('stop', async (ctx) => {
    const chatId = String(ctx.chat.id);
    await prisma.customer.updateMany({
      where: { telegramChatId: chatId },
      data: { telegramChatId: null },
    });
    await ctx.reply('You have been unsubscribed from CannaPay messages. Send any message to re-subscribe.');
  });

  bot.catch((err: any) => {
    if (err?.response?.error_code === 401 || String(err).includes('Unauthorized')) {
      console.error('[telegram] Token revoked or invalid — bot disabled until token is updated');
      stopTelegramBot();
      return;
    }
    console.error('[telegram] Bot error:', err.message || err);
  });

  // Launch returns a promise — catch async errors
  bot.launch().then(() => {
    console.log('[telegram] Bot started — listening for messages via long polling');
  }).catch((err: any) => {
    console.error('[telegram] Bot launch failed (token likely revoked):', err.message || err);
    bot = null;
  });
}

export function stopTelegramBot(): void {
  if (bot) {
    bot.stop('SIGTERM');
    console.log('[telegram] Bot stopped');
  }
}
