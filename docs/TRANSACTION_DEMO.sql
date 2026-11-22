-- ===== Proof of transaction / rollback (for the screenshots) =====
-- Run in psql:  psql postgresql://postgres:postgres@localhost:5432/hybrid_shop

-- A) BEFORE checkout: note the stock and the number of orders
SELECT product_id, title, stock_quantity FROM products ORDER BY product_id;
SELECT COUNT(*) AS orders_count FROM orders;

-- >>> In the UI: login as alice, add 2 × "Soothing hand cream" + 1 × "Paracetamol 500 mg", Checkout  (SUCCESS)

-- B) AFTER successful checkout: stock decreased, order + items created (relational join)
SELECT product_id, title, stock_quantity FROM products ORDER BY product_id;
SELECT o.order_id, u.email, o.total_amount, o.order_status, p.title, oi.quantity, oi.unit_price
FROM orders o JOIN users u ON u.user_id=o.user_id
JOIN order_items oi ON oi.order_id=o.order_id JOIN products p ON p.product_id=oi.product_id
ORDER BY o.order_id DESC;

-- >>> In the UI: add 5 × "Digital thermometer" (only 3 in stock), Checkout  (FAILS -> ROLLBACK)
-- >>> OR tick "DEMO: simulate a failure" with any cart (fails AFTER stock deduction + order insert)

-- C) AFTER the failed checkout: values must be IDENTICAL to section B (nothing partially saved)
SELECT product_id, title, stock_quantity FROM products ORDER BY product_id;
SELECT COUNT(*) AS orders_count FROM orders;

-- MongoDB side (mongosh):
--   use hybrid_shop
--   db.user_activity_logs.find({action_type:{$in:['ORDER_PLACED','CHECKOUT_ROLLBACK']}}).sort({timestamp:-1}).pretty()
--   db.user_notifications.find({userId:2}).sort({sentAt:-1}).pretty()
--   db.shopping_carts.find({userId:2}).pretty()      // items: [] after a successful order, kept after a rollback
