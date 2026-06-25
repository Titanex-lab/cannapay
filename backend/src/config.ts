import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()),
  currency: process.env.CURRENCY || 'ZAR',
  currencySymbol: process.env.CURRENCY_SYMBOL || 'R',
  taxRateStandard: parseFloat(process.env.TAX_RATE_STANDARD || '0.15'),
  taxRateExciseFlower: parseFloat(process.env.TAX_RATE_EXCISE_FLOWER || '0.15'),
  taxRateExciseEdible: parseFloat(process.env.TAX_RATE_EXCISE_EDIBLE || '0.15'),
  taxRateExciseConcentrate: parseFloat(process.env.TAX_RATE_EXCISE_CONCENTRATE || '0.15'),
  managerApprovalVoidThreshold: parseFloat(process.env.MANAGER_APPROVAL_VOID_THRESHOLD || '500'),
  managerApprovalAdjustmentThreshold: parseFloat(process.env.MANAGER_APPROVAL_ADJUSTMENT_THRESHOLD || '1000'),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  resendApiKey: process.env.RESEND_API_KEY || '',
  whatsappApiKey: process.env.WHATSAPP_API_KEY || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
} as const;
