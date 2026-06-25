import { prisma } from '../index';
import { config } from '../config';

const WHATSAPP_API = 'https://graph.facebook.com/v22.0';

export interface SendResult {
  customerId: string;
  customerName: string;
  success: boolean;
  error?: string;
}

export async function sendBulkWhatsApp(
  customerIds: string[],
  message: string,
  sentBy: string,
): Promise<SendResult[]> {
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds }, phone: { not: null } },
    select: { id: true, firstName: true, phone: true },
  });

  const results: SendResult[] = [];

  for (const customer of customers) {
    const personalizedMsg = `Hello ${customer.firstName}, ${message} - CannaPay`;
    let success = false;
    let errorMsg: string | undefined;

    if (!config.whatsappApiKey || !config.whatsappPhoneNumberId) {
      errorMsg = 'WhatsApp API not configured';
    } else {
      try {
        const response = await fetch(
          `${WHATSAPP_API}/${config.whatsappPhoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.whatsappApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: customer.phone,
              type: 'template',
              template: {
                name: 'promotional_message',
                language: { code: 'en' },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: customer.firstName },
                      { type: 'text', text: message },
                    ],
                  },
                ],
              },
            }),
          },
        );

        const body = await response.json();
        if (response.ok) {
          success = true;
        } else {
          errorMsg = body?.error?.message || `HTTP ${response.status}`;
        }
      } catch (err: any) {
        errorMsg = err.message;
      }
    }

    // Log the attempt
    await prisma.messagingLog.create({
      data: {
        customerId: customer.id,
        channel: 'whatsapp',
        message: personalizedMsg,
        status: success ? 'sent' : 'failed',
        errorMessage: errorMsg || null,
        sentBy,
      },
    });

    results.push({
      customerId: customer.id,
      customerName: customer.firstName,
      success,
      error: errorMsg,
    });
  }

  return results;
}

export async function sendBulkTelegram(
  customerIds: string[],
  message: string,
  sentBy: string,
): Promise<SendResult[]> {
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds }, telegramChatId: { not: null } },
    select: { id: true, firstName: true, telegramChatId: true },
  });

  const results: SendResult[] = [];

  for (const customer of customers) {
    const personalizedMsg = `Hello ${customer.firstName}, ${message} — CannaPay`;
    let success = false;
    let errorMsg: string | undefined;

    if (!config.telegramBotToken) {
      errorMsg = 'Telegram bot token not configured';
    } else {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: customer.telegramChatId,
              text: personalizedMsg,
              parse_mode: 'HTML',
            }),
          },
        );

        const body = await response.json();
        if (body.ok) {
          success = true;
        } else {
          errorMsg = body?.description || `HTTP ${response.status}`;
        }
      } catch (err: any) {
        errorMsg = err.message;
      }
    }

    // Log the attempt
    await prisma.messagingLog.create({
      data: {
        customerId: customer.id,
        channel: 'telegram',
        message: personalizedMsg,
        status: success ? 'sent' : 'failed',
        errorMessage: errorMsg || null,
        sentBy,
      },
    });

    results.push({
      customerId: customer.id,
      customerName: customer.firstName,
      success,
      error: errorMsg,
    });
  }

  return results;
}

export async function getMessageHistory(limit = 50, offset = 0) {
  const [data, total] = await Promise.all([
    prisma.messagingLog.findMany({
      skip: offset,
      take: limit,
      orderBy: { sentAt: 'desc' },
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true } },
      },
    }),
    prisma.messagingLog.count(),
  ]);

  return {
    data: data.map((m) => ({
      id: m.id,
      customerName: `${m.customer.firstName} ${m.customer.lastName}`,
      customerPhone: m.customer.phone,
      channel: m.channel,
      message: m.message,
      status: m.status,
      errorMessage: m.errorMessage,
      sentAt: m.sentAt,
    })),
    total,
  };
}
