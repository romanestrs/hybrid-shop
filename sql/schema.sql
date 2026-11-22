-- ============ HYBRID SHOP : RELATIONAL SCHEMA (PostgreSQL) ============
DROP TABLE IF EXISTS order_items, orders, products, users CASCADE;

CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  avatar_url    VARCHAR(255),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  product_id     SERIAL PRIMARY KEY,
  title          VARCHAR(150) NOT NULL,
  description    TEXT,
  price          NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  image_url      VARCHAR(255),
  status         VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  order_id         SERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  total_amount     NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  order_status     VARCHAR(12) NOT NULL DEFAULT 'pending'
                   CHECK (order_status IN ('pending','paid','shipped','delivered','cancelled')),
  shipping_address VARCHAR(255),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  item_id    SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(order_id)     ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity   INT NOT NULL CHECK (quantity > 0),
  UNIQUE (order_id, product_id)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_items_order ON order_items(order_id);
