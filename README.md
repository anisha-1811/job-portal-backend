# Job Portal — Backend API

Express + MySQL backend for the [Job Application Portal](https://github.com/anisha-1811/Job-Application-Portal).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MySQL 8 (via `mysql2`) |
| Auth | Firebase (frontend) + JWT (backend) |
| Security | `helmet`, `express-rate-limit`, `express-validator` |

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/anisha-1811/job-portal-backend.git
cd job-portal-backend
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Then fill in your values in .env
```

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MySQL host (e.g. `localhost`) |
| `DB_PORT` | MySQL port (default `3306`) |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name (`job_portal`) |
| `JWT_SECRET` | Secret key for signing JWTs (min 32 chars) |
| `PORT` | Server port (default `5000`) |

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Set up the database

```bash
mysql -u root -p < schema.sql
```

### 4. Run the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | None | Login/register via Firebase UID |

**Body:**
```json
{
  "firebase_uid": "abc123",
  "email": "user@example.com",
  "display_name": "Jane Doe"
}
```

**Response:**
```json
{
  "success": true,
  "token": "<jwt>",
  "applicant_id": "APPxxxxxxxx",
  "email": "user@example.com"
}
```

---

### Application

All routes require `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/application/save` | Submit/update the full application |
| `GET`  | `/api/application/get`  | Fetch the applicant's saved application |

---

## Project Structure

```
job-portal-backend/
├── config/
│   └── db.js               # MySQL connection pool
├── controllers/
│   ├── authController.js   # Login/register logic
│   └── applicationController.js  # Save & fetch application
├── middleware/
│   └── verifyToken.js      # JWT guard
├── routes/
│   ├── auth.js
│   └── application.js
├── schema.sql              # Full DB schema — run once to initialize
├── server.js               # App entry point
├── .env.example            # Environment variable template
└── package.json
```

---

## Security

- **Helmet** sets secure HTTP response headers
- **Rate limiting** — auth routes: 20 req/15 min · API routes: 100 req/15 min
- **express-validator** validates and sanitizes all incoming data
- **JWT** tokens expire after 7 days
- **Firebase** handles all password management — no passwords are stored

---

## Deployment (Render)

1. Push to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add all `.env` variables in the Render dashboard
6. Add your Render URL to the `origin` list in `server.js` CORS config
