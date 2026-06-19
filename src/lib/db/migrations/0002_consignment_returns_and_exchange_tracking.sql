ALTER TABLE `return_items` ADD COLUMN `replacement_sku_id` integer REFERENCES `skus`(`id`);
--> statement-breakpoint
ALTER TABLE `return_items` ADD COLUMN `replacement_quantity` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `consignment_items` ADD COLUMN `liquidated_quantity` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `consignment_items` ADD COLUMN `returned_quantity` integer DEFAULT 0 NOT NULL;
