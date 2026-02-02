/*
  Warnings:

  - You are about to drop the column `billDate` on the `Bill` table. All the data in the column will be lost.
  - You are about to drop the column `billNumber` on the `Bill` table. All the data in the column will be lost.
  - You are about to drop the column `ocrData` on the `Bill` table. All the data in the column will be lost.
  - You are about to drop the column `pharmacyPhone` on the `Bill` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `Bill` table. All the data in the column will be lost.
  - You are about to drop the column `itemName` on the `BillItem` table. All the data in the column will be lost.
  - You are about to drop the column `totalPrice` on the `BillItem` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `BillItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Bill" DROP COLUMN "billDate",
DROP COLUMN "billNumber",
DROP COLUMN "ocrData",
DROP COLUMN "pharmacyPhone",
DROP COLUMN "totalAmount";

-- AlterTable
ALTER TABLE "BillItem" DROP COLUMN "itemName",
DROP COLUMN "totalPrice",
DROP COLUMN "unitPrice";
