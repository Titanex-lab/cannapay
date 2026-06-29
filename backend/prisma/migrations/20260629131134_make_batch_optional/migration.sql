-- DropForeignKey
ALTER TABLE "transaction_items" DROP CONSTRAINT "transaction_items_batch_id_fkey";

-- AlterTable
ALTER TABLE "transaction_items" ALTER COLUMN "batch_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
