import { Resend } from 'resend';
import { config } from '../config';

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(config.resendApiKey || 're_placeholder');
  }
  return resend;
}

export interface ReceiptEmailData {
  transactionId: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  budtenderName: string;
  locationName: string;
  date: string;
}

export async function sendReceiptEmail(email: string, data: ReceiptEmailData): Promise<boolean> {
  if (!config.resendApiKey || config.resendApiKey === 're_placeholder') {
    console.log('[email] No Resend API key configured — skipping receipt email');
    return false;
  }

  try {
    const itemsHtml = data.items
      .map(
        (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #1e293b;">${item.name} ×${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:right;">R ${item.lineTotal.toFixed(2)}</td>
        </tr>`
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#020617;color:#e2e8f0;font-family:system-ui,sans-serif;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#0f172a;border-radius:12px;border:1px solid #1e293b;overflow:hidden;">
    <div style="background:#059669;padding:20px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:20px;">CannaPay</h1>
      <p style="color:#d1fae5;margin:4px 0 0;font-size:13px;">${data.locationName}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:14px;">Thank you for your purchase, ${data.customerName}!</p>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Transaction #${data.transactionId}</p>
      <p style="margin:0 0 20px;font-size:12px;color:#64748b;">${data.date}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#1e293b;">
            <th style="padding:8px 12px;text-align:left;font-weight:500;">Item</th>
            <th style="padding:8px 12px;text-align:right;font-weight:500;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="margin-top:16px;border-top:1px solid #1e293b;padding-top:12px;font-size:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#64748b;">Subtotal</span><span>R ${data.subtotal.toFixed(2)}</span></div>
        ${data.discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#f59e0b;">Discount</span><span style="color:#f59e0b;">-R ${data.discount.toFixed(2)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#64748b;">Tax (15% VAT)</span><span>R ${data.tax.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #1e293b;font-weight:700;font-size:16px;"><span>Total</span><span style="color:#10b981;">R ${data.total.toFixed(2)}</span></div>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#64748b;">Payment: ${data.paymentMethod.toUpperCase()}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Served by: ${data.budtenderName}</p>
    </div>
    <div style="background:#0f172a;padding:16px 24px;border-top:1px solid #1e293b;text-align:center;">
      <p style="margin:0;font-size:11px;color:#475569;">CannaPay POS — ${data.locationName}</p>
    </div>
  </div>
</body>
</html>`;

    const result = await getResend().emails.send({
      from: 'CannaPay <receipts@cannapay.co.za>',
      to: email,
      subject: `Receipt — CannaPay #${data.transactionId}`,
      html,
    });

    console.log(`[email] Receipt sent to ${email}: ${result.data?.id || 'unknown'}`);
    return true;
  } catch (err: any) {
    console.error('[email] Failed to send receipt:', err.message);
    return false;
  }
}
