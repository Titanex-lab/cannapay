# Customer Capture + Email Receipts + WhatsApp Messaging — Implementation Plan

**Goal:** Add customer capture at checkout, automated email receipts via Resend, and a customer database with bulk WhatsApp messaging in the admin panel.

**Architecture:** New Customer + MessagingLog Prisma models, 7 new backend endpoints, customer capture step in CheckoutModal, Customers tab in admin panel, Resend SDK for email, WhatsApp Cloud API for messaging. All customer-facing flows are optional/non-blocking.

**Tech Stack:** Prisma/PostgreSQL, Express/TypeScript, Next.js 14, Resend SDK, WhatsApp Cloud API (direct HTTP)

**Files to change/create:**
- **DB:** `backend/prisma/schema.prisma` — add Customer, MessagingLog models
- **Backend new:** `backend/src/routes/customer.routes.ts`, `backend/src/routes/messaging.routes.ts`, `backend/src/services/customer.service.ts`, `backend/src/services/messaging.service.ts`, `backend/src/services/email.service.ts`
- **Backend modify:** `backend/src/index.ts` — mount new routes; `backend/src/services/transaction.service.ts` — accept customerId
- **Env:** `backend/.env` — add RESEND_API_KEY, WHATSAPP_* vars
- **Frontend modify:** `frontend/app/pos/components/CheckoutModal.tsx` — add customer capture step
- **Frontend new:** `frontend/app/admin/components/CustomerManager.tsx` — customers table + WhatsApp compose
- **Frontend modify:** `frontend/app/admin/page.tsx` — add "Customers" tab

---

### Phase 1: Database Schema

#### Task 1: Add Customer model to Prisma schema

Add after CartHold model (before AuditLog):

```prisma
model Customer {
  id            String        @id @default(uuid()) @db.Uuid
  firstName     String        @map("first_name") @db.VarChar(100)
  lastName      String        @map("last_name") @db.VarChar(100)
  email         String?       @db.VarChar(255)
  phone         String?       @db.VarChar(20)
  locationId    String        @map("location_id") @db.Uuid
  totalVisits   Int           @default(0) @map("total_visits")
  totalSpend    Decimal       @default(0) @map("total_spend") @db.Decimal(14, 2)
  consentSMS    Boolean       @default(false) @map("consent_sms")
  lastVisitAt   DateTime?     @map("last_visit_at") @db.Timestamptz(6)
  createdAt     DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  location      Location      @relation(fields: [locationId], references: [id])
  transactions  Transaction[]
  messagingLogs MessagingLog[]

  @@unique([email, locationId])
  @@index([locationId])
  @@index([phone])
  @@map("customers")
}
```

#### Task 2: Add MessagingLog model

```prisma
model MessagingLog {
  id          String   @id @default(uuid()) @db.Uuid
  customerId  String   @map("customer_id") @db.Uuid
  channel     String   @db.VarChar(20)  // 'whatsapp' | 'email'
  message     String
  status      String   @db.VarChar(20)  // 'sent' | 'failed' | 'queued'
  errorMessage String? @map("error_message")
  sentBy      String   @map("sent_by") @db.Uuid
  sentAt      DateTime @default(now()) @map("sent_at") @db.Timestamptz(6)
  customer    Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
  @@index([sentAt(sort: Desc)])
  @@map("messaging_logs")
}
```

#### Task 3: Add customer relation to Transaction (already has customerId field)

Add to Transaction model:
```prisma
  customer     Customer?  @relation(fields: [customerId], references: [id])
```

#### Task 4: Run migration

```bash
cd backend && npx prisma migrate dev --name add_customers_messaging
npx prisma generate
```

---

### Phase 2: Backend Services & Routes

#### Task 5: customer.service.ts — CRUD + search

File: `backend/src/services/customer.service.ts`
- `findOrCreate(data)` — lookup by email/phone, create if new
- `listCustomers(filters)` — paginated list with search
- `getCustomer(id)` — single record
- `updateCustomer(id, data)` — update fields
- `exportCSV(filters)` — CSV generation

#### Task 6: customer.routes.ts

File: `backend/src/routes/customer.routes.ts`
Mount at `/api/customers`
- `GET /` — list with ?search, ?locationId, ?limit, ?offset (shift_manager+)
- `GET /export` — CSV download (shift_manager+)
- `GET /:id` — single customer (shift_manager+)
- `POST /` — create (budtender+, used from POS)
- `PUT /:id` — update (shift_manager+)

#### Task 7: email.service.ts — Resend integration

File: `backend/src/services/email.service.ts`
- `sendReceipt(customerEmail, receiptData)` — builds HTML email via Resend SDK
- HTML template with CannaPay branding, itemized list, totals, location info

Requires: `npm install resend` in backend

#### Task 8: messaging.service.ts — WhatsApp Cloud API

File: `backend/src/services/messaging.service.ts`
- `sendBulkWhatsApp(recipients, message, sentBy)` — sends template messages via WhatsApp Cloud API
- Uses `https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages`
- Template: `"Hello {{1}}, {{2}} - CannaPay"` where {{1}} = firstName, {{2}} = custom message
- Logs each send to MessagingLog
- Rate-limited to ~20/second (WhatsApp limit)

#### Task 9: messaging.routes.ts

File: `backend/src/routes/messaging.routes.ts`
Mount at `/api/messaging`
- `POST /whatsapp` — send bulk message (store_manager+)  
  Body: `{ customerIds: string[], message: string }`
- `GET /history` — sent message log with ?limit, ?offset (shift_manager+)

#### Task 10: Update transaction.service.ts

Modify `backend/src/services/transaction.service.ts`:
- Accept optional `customerId` in create transaction payload
- If customerId provided, increment `totalVisits`, add to `totalSpend`, update `lastVisitAt`
- After transaction creation, if customer has email, call `emailService.sendReceipt()`

#### Task 11: Mount routes in index.ts

Add to `backend/src/index.ts`:
```ts
import customerRoutes from './routes/customer.routes';
import messagingRoutes from './routes/messaging.routes';
// ...
app.use('/api/customers', customerRoutes);
app.use('/api/messaging', messagingRoutes);
```

#### Task 12: Add env vars

Add to `backend/.env`:
```
RESEND_API_KEY=re_placeholder
WHATSAPP_API_KEY=placeholder
WHATSAPP_PHONE_NUMBER_ID=placeholder
WHATSAPP_BUSINESS_ACCOUNT_ID=placeholder
```

---

### Phase 3: Frontend — Checkout Customer Capture

#### Task 13: Add customer capture step to CheckoutModal

Modify `frontend/app/pos/components/CheckoutModal.tsx`:
- Add new step `'customer'` between `'verify'` and `'payment'`
- Step order: verify → customer → payment → receipt
- Customer capture UI:
  - Fields: firstName, lastName, email, phone
  - "Skip" button (always enabled)
  - If email/phone matches existing customer, show "Welcome back [name]" with option to use existing or create new
  - Consent checkbox: "I agree to receive promotional messages"
- Pass customerId to the transaction POST

---

### Phase 4: Frontend — Admin Customers Tab

#### Task 14: CustomerManager component

File: `frontend/app/admin/components/CustomerManager.tsx`
- Table: Name, Email, Phone, Visits, Total Spend, Last Visit, Location
- Search bar (name, email, phone)
- Location filter dropdown
- "Export CSV" button
- "Send Message" button → opens ComposePanel

#### Task 15: WhatsApp ComposePanel

In CustomerManager or separate component:
- Recipient selection: All, By Location, or checkboxes in table
- Message textarea with character count
- Preview showing template format: "Hello [name], [message] - CannaPay"
- Send button with confirmation dialog
- Status feedback (sent count, failures)

#### Task 16: Add Customers tab to admin page

Modify `frontend/app/admin/page.tsx`:
- Add "Customers" to the tabs array
- Render `<CustomerManager />` when active

---

### Phase 5: Verification

#### Task 17: Smoke test

1. Create customer via POST /api/customers
2. List customers via GET /api/customers
3. Complete a sale with customerId — verify totalVisits/totalSpend update
4. Check receipt email sends (mock Resend key)
5. Check admin customers tab loads
6. Test CSV export
7. Test WhatsApp send fails gracefully with placeholder key

---

**Verification:** Full curl-based smoke test of all 7 new endpoints, build check for frontend, manual checkout flow test.
