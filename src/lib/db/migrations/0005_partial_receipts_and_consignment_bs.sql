ALTER TABLE `purchase_items` ADD COLUMN `received_quantity` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `consignment_payments` ADD COLUMN `currency` text DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE `consignment_payments` ADD COLUMN `amount_original` real;
--> statement-breakpoint
ALTER TABLE `consignment_payments` ADD COLUMN `rate_used` real;
--> statement-breakpoint
ALTER TABLE `consignment_payments` ADD COLUMN `rate_source` text DEFAULT 'manual';
