# SplitRight — Shared Expense Tracker

A full-stack shared expense tracker built for a group of flatmates. Import messy CSVs, track multi-currency expenses across changing membership, settle debts, and drill into every balance.

## 🌐 Live Demo

| | URL |
|--|--|
| **Frontend** | **https://split-right-phi.vercel.app** |
| **Backend API** | https://splitright-production-7c96.up.railway.app |
| **Health Check** | https://splitright-production-7c96.up.railway.app/api/health |

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Vanilla CSS (glassmorphism dark theme) |
| Backend | Node.js 22 + Express |
| Database | PostgreSQL 16 (via Prisma ORM) |
| Auth | JWT + bcrypt |
| Currency | frankfurter.app (free historical rates API) |
| Fuzzy matching | fuse.js |
| CSV parsing | csv-parse |
| Deployment | Railway (backend + PostgreSQL) + Vercel (frontend) |

---

## 🚀 Local Development Setup

### Prerequisites
- Node.js v18+ (v22 recommended)
- PostgreSQL 14+ running locally

### 1. Clone & install

```bash
git clone https://github.com/Harsha-2005/splitRight.git
cd splitRight

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure environment variables

**Backend** — create `backend/.env` from the example:
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/spretail"
JWT_SECRET="your-secret-key-here"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

**Frontend** — create `frontend/.env`:
```env
VITE_API_URL=http://localhost:3001/api
```

### 3. Set up the database

```bash
cd backend

# Push schema to database (creates all tables)
npx prisma db push

# Generate Prisma client
npx prisma generate
```

### 4. Run locally

```bash
# Terminal 1 — backend (runs on http://localhost:3001)
cd backend && npm run dev

# Terminal 2 — frontend (runs on http://localhost:5173)
cd frontend && npm run dev
```

Open **http://localhost:5173**

### 5. Import the CSV

1. Register an account and create a group (e.g. "Flatmates 2024")
2. Add all flatmates as members with their correct join dates
3. Go to **Import CSV** and upload `Expenses Export.csv`
4. Review the 19 anomaly checks — confirm or discard flagged rows
5. Click **Commit Import** to save all expenses

---

## ☁️ Deployment

### Backend → Railway

1. Create a Railway project and link to this GitHub repo
2. Add a **PostgreSQL** database service (auto-injects `DATABASE_URL`)
3. Set **Root Directory** to `backend` in service settings
4. Add environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | _(auto-linked from PostgreSQL service)_ |
| `JWT_SECRET` | your-secure-secret-here |
| `NODE_ENV` | production |
| `FRONTEND_URL` | https://your-vercel-app.vercel.app |

5. Railway uses `start.sh` at the root — it runs `prisma db push` then `node src/index.js`

### Frontend → Vercel

1. Import the GitHub repo to Vercel
2. Set **Root Directory** to `frontend`
3. Framework: **Vite** (auto-detected)
4. Add environment variable:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | https://your-railway-backend.up.railway.app/api |

5. Click Deploy — Vercel builds and serves the React app

---

## 📁 Repository Structure

```
splitRight/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # DB schema (User, Group, Expense, Settlement…)
│   ├── src/
│   │   ├── index.js              # Express server + CORS config
│   │   ├── lib/
│   │   │   ├── prisma.js         # DB client singleton
│   │   │   ├── splitEngine.js    # Balance calculation logic
│   │   │   ├── currency.js       # frankfurter.app exchange rate fetcher
│   │   │   └── csvAnomalyDetector.js  # 19 anomaly detection checks
│   │   ├── middleware/
│   │   │   ├── authenticate.js   # JWT middleware
│   │   │   └── errorHandler.js   # Global error handler
│   │   └── routes/
│   │       ├── auth.js           # POST /register, POST /login
│   │       ├── groups.js         # CRUD groups + members
│   │       ├── expenses.js       # CRUD expenses
│   │       ├── balances.js       # Balance calculation endpoint
│   │       ├── settlements.js    # Record settlements
│   │       └── import.js         # CSV import + anomaly detection
│   ├── nixpacks.toml             # Railway build config (Node.js 22)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── GroupPage.jsx
│   │   │   ├── ExpensesPage.jsx
│   │   │   ├── BalancePage.jsx
│   │   │   └── ImportPage.jsx
│   │   ├── components/
│   │   │   └── Layout.jsx        # Sidebar navigation
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx   # JWT auth state
│   │   └── lib/
│   │       └── api.js            # Axios client (reads VITE_API_URL)
│   ├── vercel.json               # SPA rewrite rule
│   └── package.json
├── start.sh                      # Railway entry point (root)
├── package.json                  # Root package (proxies to backend for Railway)
├── Procfile                      # Fallback Railway process definition
├── Expenses Export.csv           # Original CSV data file
├── README.md
├── SCOPE.md                      # Project requirements
├── DECISIONS.md                  # Architecture decisions log
└── AI_USAGE.md                   # AI tool usage documentation
```

---

## 🔑 Key Features

- **Multi-currency support** — expenses in INR, USD, GBP, EUR converted to INR at historical rates
- **CSV import** — parses the raw Splitwise export with 19 anomaly checks
- **Anomaly detection** — flags duplicates, missing members, zero amounts, currency mismatches, etc.
- **Smart name matching** — fuzzy match CSV names to group members (handles abbreviations, first-name-only entries)
- **Balance engine** — calculates who owes whom with minimal transactions
- **Membership-aware splits** — expenses before a member's join date are excluded from their share

---

## 🤖 AI Tool Used

**Antigravity IDE** — used as pair programming collaborator throughout the build.

See [`AI_USAGE.md`](AI_USAGE.md) for details on prompts, where the AI helped, and cases where its output was incorrect and needed correction.
