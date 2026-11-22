# Diagrams (Mermaid – rendered natively by GitHub)

Take a screenshot of each rendered diagram and save it in `docs/screenshots/` (e.g. `diagram-architecture.png`, `diagram-er-sql.png`, `diagram-nosql.png`).

## 1. System Architecture

```mermaid
flowchart LR
  subgraph Client["Browser (UI frontend)"]
    UI["HTML / CSS / Vanilla JS<br/>Catalog · Cart · Orders · Admin"]
  end
  subgraph Server["Node.js + Express (API backend)"]
    R["Routes / Controllers<br/>auth · products · cart · reviews<br/>orders · notifications · logs"]
    MW["Middleware<br/>JWT auth · Multer upload"]
    FS[("Local file system<br/>/uploads (images, avatars)")]
  end
  subgraph SQL["PostgreSQL (local)"]
    T[("users · products<br/>orders · order_items")]
  end
  subgraph NOSQL["MongoDB (local)"]
    C[("shopping_carts · product_reviews<br/>user_activity_logs · user_notifications")]
  end
  UI -- "REST / JSON (fetch)" --> MW --> R
  R -- "ACID transactions<br/>BEGIN / COMMIT / ROLLBACK" --> T
  R -- "Flexible documents" --> C
  R --> FS
```

## 2. SQL Entity-Relationship Diagram

```mermaid
erDiagram
  USERS ||--o{ ORDERS : places
  ORDERS ||--|{ ORDER_ITEMS : contains
  PRODUCTS ||--o{ ORDER_ITEMS : "is sold in"
  USERS {
    int user_id PK
    varchar email UK
    varchar password_hash
    varchar full_name
    varchar role "customer | admin"
    varchar avatar_url
    timestamp created_at
  }
  PRODUCTS {
    int product_id PK
    varchar title
    text description
    numeric price "CHECK >= 0"
    int stock_quantity "CHECK >= 0"
    varchar image_url
    varchar status "active | archived"
    timestamp created_at
  }
  ORDERS {
    int order_id PK
    int user_id FK
    numeric total_amount
    varchar order_status "pending|paid|shipped|delivered|cancelled"
    varchar shipping_address
    timestamp created_at
  }
  ORDER_ITEMS {
    int item_id PK
    int order_id FK "ON DELETE CASCADE"
    int product_id FK "ON DELETE RESTRICT"
    numeric unit_price
    int quantity "CHECK > 0"
  }
```

## 3. NoSQL Document Schemas & Collection Flow

```mermaid
flowchart TB
  subgraph MongoDB
    A["<b>shopping_carts</b><br/>_id · userId (unique)<br/>items: [ {productId, title, quantity, price} ]<br/>updatedAt"]
    B["<b>product_reviews</b><br/>_id · productId · userId · userName<br/>rating (1-5) · comment · likes · likedBy[]<br/>createdAt · updatedAt"]
    L["<b>user_activity_logs</b><br/>_id · userId · action_type · ip_address<br/>metadata {…free structure…} · timestamp"]
    N["<b>user_notifications</b><br/>_id · userId · title · message<br/>isRead · sentAt · broadcast"]
  end
  SQLU[("SQL users.user_id")] -. "userId" .-> A & B & L & N
  SQLP[("SQL products.product_id")] -. "productId" .-> A & B
```

## 4. Checkout flow (SQL transaction + hybrid synchronisation)

```mermaid
sequenceDiagram
  participant UI as Browser
  participant API as Express API
  participant PG as PostgreSQL
  participant MG as MongoDB
  UI->>API: POST /api/orders/checkout
  API->>MG: read shopping_carts
  API->>PG: BEGIN
  loop for each cart item
    API->>PG: SELECT … FOR UPDATE (verify stock)
    API->>PG: UPDATE products (deduct stock)
  end
  API->>PG: INSERT orders
  API->>PG: INSERT order_items
  alt every step succeeded
    API->>PG: COMMIT
    API->>MG: clear cart
    API->>MG: insert ORDER_PLACED log
    API->>MG: insert notification
    API-->>UI: 201 Created
  else any step failed (e.g. insufficient stock)
    API->>PG: ROLLBACK
    API->>MG: log CHECKOUT_ROLLBACK + notification
    API-->>UI: 409 error (nothing saved)
  end
```
