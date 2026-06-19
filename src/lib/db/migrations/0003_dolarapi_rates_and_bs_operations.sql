ALTER TABLE `exchange_rates` ADD COLUMN `currency_code` text DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD COLUMN `provider` text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD COLUMN `display_name` text DEFAULT 'Dolar' NOT NULL;
--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD COLUMN `buy` real;
--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD COLUMN `sell` real;
--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD COLUMN `average` real;
--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD COLUMN `external_updated_at` text;
--> statement-breakpoint
CREATE INDEX `exchange_rates_currency_source_idx` ON `exchange_rates` (`currency_code`,`source`,`date`);
--> statement-breakpoint
ALTER TABLE `sale_payments` ADD COLUMN `currency` text DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE `sale_payments` ADD COLUMN `amount_original` real;
--> statement-breakpoint
ALTER TABLE `sale_payments` ADD COLUMN `rate_used` real;
--> statement-breakpoint
ALTER TABLE `sale_payments` ADD COLUMN `rate_source` text DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `rate_source` text DEFAULT 'manual';
