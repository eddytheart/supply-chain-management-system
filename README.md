# Supply Chain Management System: University of Ibadan (Central Stores and Procurement)

A web-based system that manages requisitions, suppliers, purchase orders, inventory and reports
for the University of Ibadan central stores and procurement.

**Group 30, Department of Computer Science, University of Ibadan**

Team: Idahosa Eddy Ewan (Team Leader), Adeleke Ayomide, Ojo Sunday Orobola, Adewale Deborah

## Tech stack
React (front end), Node.js and Express (back end), MySQL (database, 3NF).

## Folder structure
```
database/   scm_database.sql  (builds all 18 tables, a stock view and sample data)
backend/    Express API (src/, scripts/)
frontend/   React app (Vite): screens for every role
```

## How to run (first time)

**You need:** Node.js 18 or newer, and MySQL 8 (MySQL Workbench is the easiest way to run the SQL file).

1. **Create the database.** In MySQL Workbench: File, Open SQL Script, choose `database/scm_database.sql`, then click the lightning-bolt Run button. This creates a database named `scm_ui`.
2. **Set up the backend.**
   ```
   cd backend
   npm install
   cp .env.example .env
   ```
   Open `.env` and set `DB_PASSWORD` (your MySQL password) and `JWT_SECRET` (any long random text).
3. **Create the sample users (once).**
   ```
   npm run seed
   ```
4. **Start the API.**
   ```
   npm run dev
   ```
   It runs on http://localhost:5000. Open http://localhost:5000/api/health to check it. You should see `{"status":"ok"}`.
5. **Start the front end** (in a second terminal, with the backend still running).
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173 and sign in with one of the sample accounts below.

## Sample login accounts (development only)
| Role | Username | Password |
|---|---|---|
| Administrator | admin | Admin@12345 |
| Procurement Officer | procurement | Procure@12345 |
| Store Officer | store | Store@12345 |
| Requester | requester | Request@12345 |

All data in the system is sample data. No real University records are used.

## API endpoints (backend complete)
Logged-in requests send the token in a header: `Authorization: Bearer <token>`.
Roles: **Req** = Requester, **Store** = Store Officer, **Proc** = Procurement Officer, **Admin** = Administrator.

| Method | Endpoint | Who |
|---|---|---|
| POST | /api/auth/login | Anyone |
| GET | /api/auth/me | Any logged-in user |
| GET | /api/roles, /api/departments | Any logged-in user |
| GET, POST | /api/users | Admin |
| PUT | /api/users/:id | Admin |
| PATCH | /api/users/:id/active | Admin |
| GET | /api/items | Any logged-in user |
| POST, PUT | /api/items, /api/items/:id | Store |
| POST | /api/requisitions | Req |
| GET | /api/requisitions (optional `?status=`) | Req sees own; others see all |
| GET | /api/requisitions/:id | Owner, or any non-requester staff |
| PATCH | /api/requisitions/:id/decision | Proc (approve or reject) |
| GET | /api/requisitions/:id/stock-check | Store, Proc |
| POST | /api/requisitions/:id/issue | Store (FIFO stock issue) |
| PATCH | /api/requisitions/:id/close | Req (own), Proc |
| GET | /api/suppliers, /api/suppliers/:id | Proc, Store, Admin |
| POST, PUT | /api/suppliers, /api/suppliers/:id | Proc |
| PATCH | /api/suppliers/:id/active | Proc |
| PUT | /api/suppliers/:id/items/:itemId | Proc (set a price) |
| GET | /api/purchase-orders, /api/purchase-orders/:id | Proc, Store, Admin |
| POST | /api/purchase-orders | Proc |
| POST | /api/purchase-orders/:id/receipts | Store (record goods received) |
| PATCH | /api/purchase-orders/:id/close | Proc |
| GET | /api/inventory/stock (optional `?lowOnly=true`) | Store, Proc, Admin |
| GET | /api/inventory/stock/:itemId/batches | Store, Proc, Admin |
| POST | /api/inventory/adjustments | Store |
| GET | /api/reports/requisitions, /stock, /low-stock, /purchase-orders | Store, Proc, Admin |

Reports accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` where dates apply, and `?format=csv` to download.

## How a requisition moves
`submitted` -> `approved` or `rejected` (Procurement Officer)
`approved` -> `delivered` (Store Officer issues straight from stock, oldest batch first)
`approved` -> `ordered` (stock is short, so a purchase order is raised) -> `delivered` (goods received, then issued)
`delivered` -> `closed` (requester confirms receipt)

All status changes go through one function (`backend/src/utils/requisitionStatus.js`), so steps cannot be skipped.

## Status
- [x] Database schema (18 tables, 3NF)
- [x] Login, roles and access control, user management, audit log
- [x] Requisitions (create, track, approve or reject, close)
- [x] Suppliers and price lists
- [x] Purchase orders and goods receiving (partial deliveries)
- [x] Inventory: item catalogue, FIFO stock issue, reorder alerts, adjustments
- [x] Reports with date filters and CSV export
- [x] React front end: sign-in, a home page per role, requisitions with a progress track, suppliers, purchase orders, inventory, reports, users, audit log

## Testing
`frontend/src/test/flow.test.jsx` drives the real screens against a running backend: a requisition from request to closed
(raise, approve, order, receive, issue, confirm), the path where stock covers the request, rejection with a reason, and the
access rules for each role. To run it, start the backend on port 5055 with the sample users seeded, then in `frontend` run `npm test`.
