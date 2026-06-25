-- CreateEnum
CREATE TYPE "StrainType" AS ENUM ('indica', 'sativa', 'hybrid');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('flower', 'pre_roll', 'vape', 'concentrate', 'edible', 'topical', 'accessory');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('each', 'gram', 'eighth', 'quarter', 'half', 'ounce');

-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('standard', 'excise_flower', 'excise_edible', 'excise_concentrate', 'no_tax');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('budtender', 'shift_manager', 'store_manager', 'admin');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('completed', 'voided', 'refunded', 'partial_refund');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'other');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('damaged', 'gifted', 'internal_use', 'theft', 'expired', 'correction');

-- CreateEnum
CREATE TYPE "DrawerStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "strains" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "StrainType" NOT NULL,
    "thc_percent" DECIMAL(5,2),
    "cbd_percent" DECIMAL(5,2),
    "terpene_profile" TEXT,
    "aliases" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "strains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "lot_number" VARCHAR(100) NOT NULL,
    "strain_id" UUID NOT NULL,
    "supplier" VARCHAR(200),
    "harvest_date" DATE,
    "production_date" DATE,
    "lab_results" JSONB,
    "expiration_date" DATE,
    "current_potency_thc" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "strain_id" UUID,
    "batch_id" UUID,
    "cost_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sell_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit_type" "UnitType" NOT NULL DEFAULT 'each',
    "weight_grams" DECIMAL(8,3),
    "barcode" VARCHAR(100),
    "tax_category" "TaxCategory" NOT NULL DEFAULT 'standard',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" TEXT,
    "license_number" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(10,3) NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "pin" VARCHAR(6),
    "role" "UserRole" NOT NULL DEFAULT 'budtender',
    "location_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "transaction_num" INTEGER NOT NULL,
    "location_id" UUID NOT NULL,
    "budtender_id" UUID NOT NULL,
    "customer_id" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(12,2) NOT NULL,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'completed',
    "void_reason" VARCHAR(50),
    "void_approved_by" UUID,
    "notes" TEXT,
    "id_verified" BOOLEAN NOT NULL DEFAULT false,
    "id_verified_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10,2) NOT NULL,
    "tax_rate" DECIMAL(5,3) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "cash_tendered" DECIMAL(12,2),
    "change_due" DECIMAL(12,2),
    "card_last_four" VARCHAR(4),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID,
    "location_id" UUID NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "reason_code" "AdjustmentReason" NOT NULL,
    "notes" TEXT,
    "employee_id" UUID NOT NULL,
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_sessions" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "opening_amount" DECIMAL(12,2) NOT NULL,
    "closing_amount" DECIMAL(12,2),
    "expected_amount" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "status" "DrawerStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "cash_drawer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_holds" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "budtender_id" UUID NOT NULL,
    "cart_data" JSONB NOT NULL,
    "customer_name" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "changes" JSONB NOT NULL,
    "performed_by" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batches_lot_number_key" ON "batches"("lot_number");

-- CreateIndex
CREATE INDEX "batches_strain_id_idx" ON "batches"("strain_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_strain_id_idx" ON "products"("strain_id");

-- CreateIndex
CREATE INDEX "products_batch_id_idx" ON "products"("batch_id");

-- CreateIndex
CREATE INDEX "inventory_location_id_product_id_idx" ON "inventory"("location_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_product_id_location_id_key" ON "inventory"("product_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "transactions_location_id_created_at_idx" ON "transactions"("location_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_location_id_created_at_desc_idx" ON "transactions"("location_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items"("transaction_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_location_id_created_at_idx" ON "inventory_adjustments"("location_id", "created_at");

-- CreateIndex
CREATE INDEX "cart_holds_location_id_budtender_id_idx" ON "cart_holds"("location_id", "budtender_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_strain_id_fkey" FOREIGN KEY ("strain_id") REFERENCES "strains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_strain_id_fkey" FOREIGN KEY ("strain_id") REFERENCES "strains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budtender_id_fkey" FOREIGN KEY ("budtender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_void_approved_by_fkey" FOREIGN KEY ("void_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_id_verified_by_fkey" FOREIGN KEY ("id_verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_holds" ADD CONSTRAINT "cart_holds_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_holds" ADD CONSTRAINT "cart_holds_budtender_id_fkey" FOREIGN KEY ("budtender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
