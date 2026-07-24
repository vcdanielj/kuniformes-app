CREATE INDEX IF NOT EXISTS `purchases_status_idx` ON `purchases` (`status`);
CREATE INDEX IF NOT EXISTS `quotes_status_idx` ON `quotes` (`status`);
CREATE INDEX IF NOT EXISTS `returns_status_idx` ON `returns` (`status`);
CREATE INDEX IF NOT EXISTS `consignment_lots_status_idx` ON `consignment_lots` (`status`);
CREATE INDEX IF NOT EXISTS `shipments_status_idx` ON `shipments` (`status`);