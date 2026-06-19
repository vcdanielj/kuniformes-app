INSERT OR IGNORE INTO users (id, name, email, password_hash, role, active)
VALUES
  ('usr_admin', 'Administrador K-Uniformes', 'admin@kuniformes.com', 'ef9fae9ea736af21bde2dd90e98ed0d8:1e6342f304632fae2cdb94d6261d414b30a97d21507c82cc0a739337e6177047', 'admin', 1),
  ('usr_seller', 'Yoselin K.', 'yoselin@kuniformes.com', 'c5cb25af2cb03f990ba134a554c8eca1:d69450f315e03f96889037d1ceb1efd45ed8eba9ab35bb073f5a731ed7dcac9f', 'vendedor', 1);

INSERT OR IGNORE INTO colors (code, name, hex, sort_order)
VALUES
  ('Z21', 'Negro', '#1b1b1d', 0),
  ('Z22', 'Azul Rey', '#1e3a8a', 1),
  ('Z34', 'Gris Plomo', '#6b7280', 2),
  ('Z40', 'Rojo Vino', '#7c1d2b', 3),
  ('Z18', 'Verde Quirófano', '#2f6f5e', 4),
  ('Z27', 'Lila', '#8b6db0', 5),
  ('Z12', 'Blanco', '#d9dad4', 6);

INSERT OR IGNORE INTO sizes (name, sort_order)
VALUES
  ('XS', 0),
  ('S', 1),
  ('M', 2),
  ('L', 3),
  ('XL', 4),
  ('2XL', 5);

INSERT OR IGNORE INTO categories (name, type)
VALUES
  ('Cuello V', 'product'),
  ('Cuello Mao', 'product'),
  ('Cuello Neru', 'product'),
  ('Pantalón', 'product'),
  ('Gorros', 'product'),
  ('Accesorio', 'product'),
  ('Publicidad', 'expense'),
  ('Importación', 'expense'),
  ('Operativos', 'expense'),
  ('Sistema', 'expense');

INSERT OR IGNORE INTO payment_methods (name, currency, active)
VALUES
  ('Zelle', 'USD', 1),
  ('Binance', 'USDT', 1),
  ('Efectivo', 'USD', 1),
  ('Bolívares', 'Bs', 1);

INSERT OR IGNORE INTO carriers (name, tag)
VALUES
  ('MRW', 'Principal'),
  ('Zoom', 'Principal'),
  ('Domesa', 'Secundario'),
  ('Tealca', 'Secundario');

INSERT OR IGNORE INTO settings (key, value)
VALUES
  ('marca', 'K-Uniformes'),
  ('rif', 'J-50000000-0'),
  ('telefono', '+58 424-000 0000'),
  ('instagram', '@k_uniformesvzla'),
  ('umbral_stock_bajo', '5'),
  ('tasa_default', 'paralelo'),
  ('ne_counter', '184'),
  ('cot_counter', '11'),
  ('dv_counter', '42');
