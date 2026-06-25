-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "location_id" UUID NOT NULL,
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "total_spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "consent_sms" BOOLEAN NOT NULL DEFAULT false,
    "last_visit_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_logs" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "sent_by" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_location_id_idx" ON "customers"("location_id");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_email_location_id_idx" ON "customers"("email", "location_id");

-- CreateIndex
CREATE INDEX "messaging_logs_customer_id_idx" ON "messaging_logs"("customer_id");

-- CreateIndex
CREATE INDEX "messaging_logs_sent_at_idx" ON "messaging_logs"("sent_at" DESC);

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_logs" ADD CONSTRAINT "messaging_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
