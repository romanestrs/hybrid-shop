# 🛒 Hybrid Shop – Full-stack app with a hybrid database architecture

A self-contained online shop combining a **relational database (PostgreSQL)** for critical transactional data and a **document database (MongoDB)** for flexible data. No external API, no cloud database, no external image hosting: everything runs locally.

> 🎥 **Presentation video:** `<PASTE VIDEO LINK HERE>`

## Why two databases?
| Need | Engine | Why |
|------|--------|-----|
| Users, products & stock, orders, order lines | **PostgreSQL** | ACID transactions, constraints, foreign keys, joins |
| Carts, reviews, activity logs, notifications | **MongoDB** | Flexible schemas, nested arrays, fast writes |

## Tech stack
Node.js ≥ 18 · Express 4 · PostgreSQL 14+ (`pg`) · MongoDB 6+ (`mongodb` driver) · JWT + bcrypt · Multer (local uploads) · Vanilla HTML/CSS/JS frontend.

## Architecture & diagrams
See [`docs/DIAGRAMS.md`](docs/DIAGRAMS.md): system architecture, SQL ER diagram, NoSQL document schemas, checkout sequence diagram.

```mermaid
flowchart LR
  UI["Browser UI"] -->|REST/JSON| API["Express API"]
  API -->|ACID transactions| PG[("PostgreSQL")]
  API -->|documents| MG[("MongoDB")]
  API --> FS[("/uploads local disk")]
```

## Database design
**SQL (4 tables)** – `users`, `products`, `orders`, `order_items` (PK, FK, UNIQUE, CHECK constraints) → [`sql/schema.sql`](sql/schema.sql)

**NoSQL (4 collections)** – `shopping_carts`, `product_reviews`, `user_activity_logs`, `user_notifications`

## CRUD coverage (all reachable from the web UI)
| Entity | Engine | Create | Read | Update | Delete |
|--------|--------|--------|------|--------|--------|
| Users | SQL | Register | Profile / admin list | Edit profile, avatar, role | Admin delete |
| Products | SQL | Admin form + image | Catalog / inventory | Edit price, **stock** | Delete (or archive) |
| Orders | SQL | Checkout | History with joins | Status (admin) | Delete order / cancel a line |
| Order_Items | SQL | Checkout | Order details | – (via cancel line) | Cancel line (stock restored) |
| Shopping_Carts | NoSQL | Add item | View cart | Change quantity | Remove item / clear |
| Product_Reviews | NoSQL | Post review | List + average rating | Edit, like | Delete |
| User_Notifications | NoSQL | Admin send / broadcast, auto | Panel | Mark as read | Dismiss |
| User_Activity_Logs | NoSQL | Automatic + manual entry | Admin live view | Admin note | Delete one / all |

## Transactions
`POST /api/orders/checkout` ([`src/routes/orders.js`](src/routes/orders.js)):
1. `BEGIN` → for each item `SELECT … FOR UPDATE` (verify stock) → `UPDATE` stock → `INSERT orders` → `INSERT order_items`
2. any failure (e.g. insufficient stock) → **`ROLLBACK`** of everything
3. after `COMMIT` → hybrid sync in MongoDB: clear cart, write `ORDER_PLACED` audit log, send notification
4. on rollback → `CHECKOUT_ROLLBACK` log + notification

Cancelling an order / a line / changing status to *cancelled* is also transactional (stock restored atomically).
> Note: MongoDB cross-collection steps are executed *after* the SQL commit (no distributed transaction); they are best-effort and cannot undo a committed order.

**Rollback demo:** set `DEMO_MODE=true` and tick *"simulate a failure"* at checkout, or order more than the available stock. Proof queries: [`docs/TRANSACTION_DEMO.sql`](docs/TRANSACTION_DEMO.sql).

## Setup
### 1. Prerequisites
Node.js ≥ 18, PostgreSQL, MongoDB running **locally**. (Quick option: `docker compose up -d` starts both locally using `docker-compose.yml`.)

### 2. Install
```bash
git clone <repo-url> && cd hybrid-shop
npm install
cp .env.example .env      # adjust if needed
npm run db:init           # creates tables, indexes, seed data (⚠ resets everything)
npm start                 # http://localhost:3000
```
PostgreSQL manual setup if not using Docker: `createdb hybrid_shop` and set `PG_URL` in `.env`.

### 3. Environment variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP port |
| `PG_URL` | `postgresql://postgres:postgres@localhost:5432/hybrid_shop` | PostgreSQL connection |
| `MONGO_URL` / `MONGO_DB` | `mongodb://localhost:27017` / `hybrid_shop` | MongoDB connection |
| `JWT_SECRET` | – | Secret used to sign tokens |
| `DEMO_MODE` | `true` | Shows the "simulate failure" option for the rollback demo |

### 4. Demo accounts
`admin@shop.local / Admin123!` · `alice@shop.local / User123!` · `bob@shop.local / User123!`

## API documentation
Auth: `Authorization: Bearer <JWT>`. 🔒 = login required, 👑 = admin.

| Method & path | Description |
|---------------|-------------|
| `POST /api/auth/register` · `POST /api/auth/login` | Create account / login |
| `GET/PUT /api/users/me` 🔒 · `POST /api/users/me/avatar` 🔒 | Profile, avatar (multipart) |
| `GET /api/users` 👑 · `PUT/DELETE /api/users/:id` 👑 | Manage users |
| `GET /api/products?q=` · `GET /api/products/:id` | Catalog (with average rating) |
| `POST /api/products` 👑 · `PUT/DELETE /api/products/:id` 👑 | Manage products (multipart with `image`) |
| `GET /api/cart` · `POST /api/cart/items` · `PUT/DELETE /api/cart/items/:productId` · `DELETE /api/cart` 🔒 | Cart |
| `GET /api/reviews?productId=` · `POST /api/reviews` 🔒 · `PUT/DELETE /api/reviews/:id` 🔒 · `POST /api/reviews/:id/like` 🔒 | Reviews |
| `POST /api/orders/checkout` 🔒 | **Transactional checkout** |
| `GET /api/orders` · `GET /api/orders/:id` 🔒 | History (joins) |
| `PUT /api/orders/:id/status` 👑 · `DELETE /api/orders/:id` 🔒 · `DELETE /api/orders/:id/items/:itemId` 🔒 | Update / cancel |
| `GET /api/notifications` 🔒 · `POST` 👑 · `PUT /:id/read` · `PUT /read-all` · `DELETE /:id` 🔒 | Notifications |
| `GET /api/logs` 👑 · `GET /api/logs/mine` 🔒 · `POST /api/logs` 🔒 · `PUT/DELETE /api/logs/:id` 👑 · `DELETE /api/logs` 👑 | Activity logs |

## Project structure
```
src/            server.js, config.js, utils.js, middleware/, routes/
sql/            schema.sql
scripts/        init-db.js (migration + seed for SQL and MongoDB)
public/         index.html, app.js, style.css
uploads/        locally stored images and avatars
docs/           diagrams, screenshots/, transaction demo, video script, slides outline
```

## Screenshots
See [`docs/screenshots/`](docs/screenshots/CHECKLIST.md).
