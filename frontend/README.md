# Retail EDM Integration Frontend

Next.js 15+ (App Router) frontend for the Retail EDM Integration System.

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local
```

Ensure `NEXT_PUBLIC_API_URL` points to the Laravel API (default `http://localhost:8000/api`).

## Run

```bash
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run build
npm run start
```

## Notes

- Sanctum token is stored in `localStorage` after login.
- Seeded users: `admin@retail.test`, `manager@retail.test`, `staff@retail.test` (password: `password`).
- If the backend API is offline, pages show an "API offline" state and allow retry.