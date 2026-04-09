# GitHub Release Notificator — Draft Plan

## Контекст

Тестове завдання для SE School 6.0. API для підписки на email-сповіщення про нові релізи GitHub-репозиторіїв. Дедлайн: 12 квітня 2026.

**Стек:** Express.js + TypeScript + PostgreSQL + Drizzle ORM + Redis + Mailtrap
**Runtime:** Node.js + tsx (dev), tsc + node (prod)
**Архітектура:** Моноліт з feature-based структурою
**Деплой:** DigitalOcean Droplet + docker-compose

---

## Архітектурні рішення

### Моноліт + інфраструктура

Додаток — це один Node.js процес з трьома модулями (API, Scanner, Notifier). Postgres, Redis — інфраструктурні сервіси, не мікросервіси. Це стандартна архітектура моноліту.

### Деплой на DigitalOcean

- **Droplet** ($6/міс) з Docker + docker-compose
- Порт маппінг: `80:3000` — юзер заходить на `http://<ip>` без порту
- Postgres і Redis **не виставлені** назовні (без `ports:` в docker-compose)
- DigitalOcean Firewall: дозволити тільки 22 (SSH) та 80 (HTTP)
- Без Nginx — Express серверить і API, і статичну HTML-сторінку через `express.static()`
- Без домену, тільки HTTP

### Фронтенд

Express серверить `public/index.html` напряму:
```typescript
app.use(express.static('public'));
```
Юзер заходить `http://<ip>` → бачить HTML-сторінку підписки. API доступний на `http://<ip>/api/*`.

### Регулярне сканування — node-cron

`node-cron` — in-process cron scheduler всередині моноліту. Запускає scanner кожні N хвилин (конфігурується через env).

Чому node-cron:
- Простий, без зовнішніх залежностей
- Працює в процесі моноліту
- Cron-синтаксис для гнучкого налаштування

Mutex запобігає одночасним сканам:
```typescript
let isScanning = false;
async function scanAll() {
  if (isScanning) return;
  isScanning = true;
  try { /* ... */ } finally { isScanning = false; }
}
```

### Множинні релізи між сканами

Використовуємо `GET /repos/{owner}/{repo}/releases` (список, не `/latest`) і порівнюємо з `last_seen_tag`. Якщо між сканами вийшло 3 релізи — надсилаємо повідомлення про кожен з них. Це потребує більше API-запитів, але дає повну картину юзеру.

### API Key автентифікація (Extra)

Middleware перевіряє `X-API-Key` header на всіх `/api/*` ендпоінтах. API key зберігається в env. Для HTML-сторінки (/) — без автентифікації.

---

## Схема бази даних

### Таблиця `users`

Один email = один юзер. Нормалізація даних.

```
users
├── id          SERIAL PRIMARY KEY
├── email       VARCHAR(255) UNIQUE NOT NULL
├── created_at  TIMESTAMP DEFAULT NOW()
├── updated_at  TIMESTAMP DEFAULT NOW()
```

### Таблиця `repositories`

Унікальні GitHub-репозиторії та стан сканування.

```
repositories
├── id              SERIAL PRIMARY KEY
├── owner           VARCHAR(255) NOT NULL        -- "golang"
├── repo            VARCHAR(255) NOT NULL        -- "go"
├── last_seen_tag   VARCHAR(255) NULL            -- "v1.22.0" (null = ще не перевірявся)
├── last_checked_at TIMESTAMP NULL               -- коли останній раз сканер перевіряв
├── created_at      TIMESTAMP DEFAULT NOW()
├── updated_at      TIMESTAMP DEFAULT NOW()
└── UNIQUE(owner, repo)
```

Чому окрема таблиця:
- `last_seen_tag` — per-repo, не per-subscription
- Якщо 100 юзерів підписані на один репо — перевіряємо GitHub один раз
- Scanner запитує унікальні репозиторії

### Таблиця `subscriptions`

Підписки юзерів на репозиторії.

```
subscriptions
├── id                  SERIAL PRIMARY KEY
├── user_id             INT NOT NULL REFERENCES users(id)
├── repository_id       INT NOT NULL REFERENCES repositories(id)
├── status              VARCHAR(20) NOT NULL DEFAULT 'pending'
│                       -- 'pending' | 'active' | 'unsubscribed'
├── confirm_token       VARCHAR(64) NOT NULL UNIQUE
├── unsubscribe_token   VARCHAR(64) NOT NULL UNIQUE
├── created_at          TIMESTAMP DEFAULT NOW()
├── updated_at          TIMESTAMP DEFAULT NOW()
└── UNIQUE(user_id, repository_id)
```

Чому `status` замість `confirmed: boolean`:
- Три стани lifecycle: pending → active → unsubscribed
- Boolean не покриває "відписався"
- Чистіше описує бізнес-логіку

### Таблиця `scan_jobs`

Логує кожен запуск сканера. Дає observability.

```
scan_jobs
├── id              SERIAL PRIMARY KEY
├── status          VARCHAR(20) NOT NULL    -- 'running' | 'completed' | 'failed'
├── repos_checked   INT DEFAULT 0
├── releases_found  INT DEFAULT 0
├── notifications_created INT DEFAULT 0
├── error_count     INT DEFAULT 0
├── error_message   TEXT NULL
├── started_at      TIMESTAMP NOT NULL
├── finished_at     TIMESTAMP NULL
```

### Таблиця `notifications`

Кожне окреме повідомлення. Дозволяє retry та відслідковування.

```
notifications
├── id              SERIAL PRIMARY KEY
├── subscription_id INT NOT NULL REFERENCES subscriptions(id)
├── type            VARCHAR(20) NOT NULL    -- 'confirmation' | 'release'
├── release_tag     VARCHAR(255) NULL       -- тег релізу (для type='release')
├── status          VARCHAR(20) NOT NULL DEFAULT 'pending'
│                   -- 'pending' | 'sent' | 'failed'
├── error_message   TEXT NULL               -- причина failed
├── attempts        INT DEFAULT 0           -- кількість спроб відправки
├── created_at      TIMESTAMP DEFAULT NOW()
├── sent_at         TIMESTAMP NULL          -- коли реально відправлено
```

Переваги notifications таблиці:
- Видно що зафейлилось і чому
- Retry для failed notifications (при наступному скані або окремим cron)
- Scanner оновлює `last_seen_tag` одразу, створює записи в notifications
- Notifier обробляє pending notifications з таблиці
- Confirmation email також записується — видно чи дійсно відправлено

### Візуалізація зв'язків

```
users 1 ──── N subscriptions N ──── 1 repositories
                  │                        │
                  │ status: pending →       │ last_seen_tag
                  │   active →             │ (per repo)
                  │   unsubscribed         │
                  │                        │
                  └──── N notifications    │
                          │                │
                          │ type:          │
                          │  confirmation  │
                          │  release       │
                          │                │
                          │ status:        │
                          │  pending →     │
                          │  sent / failed │

scan_jobs (незалежна таблиця — логує кожен запуск сканера)
```

### Індекси

```
-- repositories
UNIQUE INDEX (owner, repo)

-- subscriptions
UNIQUE INDEX (user_id, repository_id)     -- запобігає дублюванню
INDEX (confirm_token)                      -- GET /confirm/:token
INDEX (unsubscribe_token)                  -- GET /unsubscribe/:token
INDEX (status) WHERE status = 'active'     -- scanner queries

-- users
UNIQUE INDEX (email)

-- notifications
INDEX (status) WHERE status = 'pending'    -- notifier обробляє pending
INDEX (subscription_id)                     -- пошук нотифікацій підписки
```

---

## Структура проєкту

```
src/
├── app.ts                              # Express setup: middleware, routes, error handler
├── server.ts                           # Entry point: запуск сервера, міграції, cron
├── config/
│   ├── env.ts                          # Zod-валідація env змінних
│   └── database.ts                     # Drizzle + pg pool
├── db/
│   ├── schema.ts                       # Drizzle table definitions (всі таблиці)
│   ├── migrate.ts                      # Запуск міграцій при старті
│   └── migrations/                     # Згенеровані SQL міграції (drizzle-kit)
├── subscription/
│   ├── subscription.router.ts          # POST /subscribe, GET /confirm, /unsubscribe, /subscriptions
│   ├── subscription.service.ts         # Бізнес-логіка підписок
│   ├── subscription.repository.ts      # DB-запити через Drizzle
│   ├── subscription.validator.ts       # Zod-схеми валідації request
│   └── subscription.service.test.ts
├── scanner/
│   ├── scanner.cron.ts                 # node-cron scheduling + mutex
│   ├── scanner.service.ts              # Логіка сканування: fetch releases, порівняння, створення notifications
│   └── scanner.service.test.ts
├── notifier/
│   ├── notifier.service.ts             # Обробка pending notifications з таблиці, відправка email
│   ├── notifier.cron.ts                # Окремий cron для retry failed notifications
│   ├── notifier.templates.ts           # HTML-шаблони: confirmation, release notification
│   └── notifier.service.test.ts
├── github/
│   ├── github.client.ts                # GitHub API клієнт з rate limiting
│   ├── github.cache.ts                 # Redis кеш для GitHub відповідей
│   └── github.client.test.ts
├── common/
│   ├── errors.ts                       # AppError, NotFoundError, ConflictError, ValidationError
│   ├── error-handler.ts                # Express global error handler middleware
│   ├── auth.middleware.ts              # API key автентифікація middleware
│   ├── token.ts                        # crypto.randomUUID() утиліти
│   ├── logger.ts                       # Pino logger
│   └── redis.ts                        # ioredis клієнт singleton
├── metrics/
│   ├── metrics.router.ts               # GET /metrics endpoint
│   └── metrics.ts                      # prom-client: counters, gauges, histograms
└── public/
    └── index.html                      # Статична HTML-сторінка підписки на релізи

drizzle.config.ts                       # Drizzle Kit config
tsconfig.json
package.json
Dockerfile
docker-compose.yml
.env.example
.github/workflows/ci.yml               # Lint + tests on push
vitest.config.ts
README.md
```

---

## Потоки даних (Flows)

### POST /api/subscribe

```
Request { email, repo: "owner/repo" }
  │
  ├─ 1. Auth: перевірка X-API-Key header
  │     └─ 401 якщо невалідний/відсутній
  │
  ├─ 2. Validation (Zod): email format, repo regex ^[\w.-]+/[\w.-]+$
  │     └─ 400 якщо невалідно
  │
  ├─ 3. GitHub API: GET /repos/{owner}/{repo}
  │     ├─ Redis cache hit → skip API call
  │     ├─ 404 → return 404 "Repository not found"
  │     └─ 429 → return 503 + Retry-After header
  │
  ├─ 4. Upsert user: INSERT ... ON CONFLICT (email) DO NOTHING → get user.id
  │
  ├─ 5. Upsert repository: INSERT ... ON CONFLICT (owner, repo) DO NOTHING → get repo.id
  │
  ├─ 6. Fetch releases list → seed last_seen_tag з найновішим тегом
  │     └─ Щоб не слати нотифікацію про поточний реліз
  │
  ├─ 7. Перевірка існуючої підписки (user_id + repository_id):
  │     ├─ status='active' → return 409 "Already subscribed"
  │     ├─ status='pending' → створити новий notification (confirmation), return 200
  │     ├─ status='unsubscribed' → reset to 'pending', нові токени, confirmation notification
  │     └─ not found → create subscription + confirmation notification
  │
  └─ 8. Return 200 "Subscription successful. Confirmation email sent."
        (email відправиться через notifier з таблиці notifications)
```

### GET /api/confirm/{token}

```
  ├─ 1. Auth: X-API-Key
  ├─ 2. Validate token format (UUID regex) → 400
  ├─ 3. Lookup subscription by confirm_token → 404
  ├─ 4. If already active → 200 (idempotent)
  └─ 5. Update status → 'active', return 200
```

### GET /api/unsubscribe/{token}

```
  ├─ 1. Auth: X-API-Key
  ├─ 2. Validate token format → 400
  ├─ 3. Lookup subscription by unsubscribe_token → 404
  └─ 4. Update status → 'unsubscribed', return 200
```

### GET /api/subscriptions?email={email}

```
  ├─ 1. Auth: X-API-Key
  ├─ 2. Validate email format → 400
  ├─ 3. Find user by email
  ├─ 4. JOIN subscriptions (status='active') + repositories
  └─ 5. Return array: [{ email, repo: "owner/repo", confirmed: true, last_seen_tag }]
```

### Scanner Flow (cron, кожні 5 хвилин)

```
cron trigger
  │
  ├─ 1. Mutex check (skip if already scanning)
  │
  ├─ 2. Create scan_job record (status='running')
  │
  ├─ 3. SELECT repositories з хоча б одною active subscription
  │
  ├─ 4. For each repository (sequential, ~100ms пауза):
  │     │
  │     ├─ GitHub API: GET /repos/{owner}/{repo}/releases
  │     │   ├─ Redis cache hit → use cached
  │     │   ├─ 404 → skip (no releases або repo deleted)
  │     │   └─ 429 → pause until rate limit reset
  │     │
  │     ├─ Фільтруємо releases новіші за last_seen_tag
  │     │   ├─ Немає нових → skip
  │     │   └─ Є нові → для кожного нового release:
  │     │       ├─ Fetch active subscriptions для цього repo
  │     │       └─ Створити notification record (type='release', status='pending')
  │     │
  │     ├─ Update repositories.last_seen_tag = найновіший тег
  │     └─ Update repositories.last_checked_at = NOW()
  │
  ├─ 5. Update scan_job (status='completed', counters)
  │
  └─ 6. Log scan summary
```

### Notifier Flow (cron, кожну хвилину)

```
cron trigger
  │
  ├─ 1. SELECT notifications WHERE status='pending' OR (status='failed' AND attempts < 3)
  │     ORDER BY created_at ASC
  │     LIMIT 50
  │
  ├─ 2. For each notification:
  │     │
  │     ├─ Fetch subscription + user + repository data
  │     │
  │     ├─ Render email template (confirmation або release)
  │     │
  │     ├─ Send via Nodemailer (Mailtrap SMTP)
  │     │   ├─ Success → update status='sent', sent_at=NOW()
  │     │   └─ Failure → update status='failed', error_message, attempts++
  │     │
  │     └─ Update Prometheus counters
  │
  └─ 3. Log: sent N, failed M
```

---

## GitHub API Rate Limiting

Багаторівнева стратегія:

1. **GitHub PAT token** — 5000 req/hr замість 60 (env: `GITHUB_TOKEN`)
2. **Redis cache TTL 10 хв** — повторні запити йдуть з кешу
3. **ETags / If-None-Match** — 304 відповіді не рахуються в rate limit
4. **Sequential processing** з паузою ~100ms між запитами
5. **Header tracking** — `X-RateLimit-Remaining` / `X-RateLimit-Reset`

```
Якщо Remaining < 10 → sleep до Reset timestamp
Якщо 429 → read Retry-After, sleep, retry once
```

---

## Redis Caching

| Key | Value | TTL | Коли |
|-----|-------|-----|------|
| `github:repos:{owner}/{repo}:exists` | `"1"` / `"0"` | 10 хв | POST /subscribe |
| `github:repos:{owner}/{repo}:releases` | JSON array | 10 хв | Scanner |
| `github:repos:{owner}/{repo}:etag` | ETag string | 30 хв | Conditional requests |

Graceful degradation: якщо Redis недоступний — пропускаємо кеш, йдемо напряму в GitHub API. Всі cache operations загорнуті в try/catch.

---

## API Key Authentication

```typescript
// common/auth.middleware.ts
function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ message: 'Invalid or missing API key' });
  }
  next();
}

// app.ts
app.use('/api', apiKeyAuth);
// GET / (HTML page) — без auth
```

API key генерується один раз і зберігається в `.env`. Для тестового це достатньо.

---

## Prometheus Metrics

```
# Counters
http_requests_total{method, path, status}
subscriptions_created_total
emails_sent_total{type: confirmation|release}
emails_failed_total{type}
github_api_calls_total{endpoint, cache_hit}
scan_runs_total{status: completed|failed}

# Gauges
active_subscriptions
tracked_repositories
github_rate_limit_remaining
pending_notifications

# Histograms
http_request_duration_seconds{method, path}
scan_duration_seconds
email_send_duration_seconds
```

---

## Docker Setup

### Dockerfile (multi-stage)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build    # tsc → dist/

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src/public ./dist/public
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### docker-compose.yml

```yaml
services:
  app:
    build: .
    ports: ["80:3000"]           # маппінг на 80 — доступ без порту
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: releases
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secret}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d releases"]
      interval: 5s
      retries: 5
    # НЕ виставляємо ports — доступний тільки всередині docker network

  redis:
    image: redis:7-alpine
    # НЕ виставляємо ports — аналогічно

volumes:
  pgdata:
```

### docker-compose.dev.yml (для локальної розробки)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]         # відкритий для локального доступу
    environment:
      POSTGRES_DB: releases
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d releases"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]         # відкритий для локального доступу

volumes:
  pgdata:
```

Для розробки: `docker-compose -f docker-compose.dev.yml up` (тільки інфра), додаток запускається через `tsx`.

---

## Тестування

### Unit tests (обов'язкові) — Vitest

- `subscription.service.test.ts` — mock repository + GitHub client
  - Нова підписка → створення user, repo, subscription, notification
  - Дублікат → 409
  - Re-subscribe після unsubscribe → reset
  - Невалідний repo format → 400
  - Repo not found на GitHub → 404
- `scanner.service.test.ts` — mock GitHub client + repository
  - Новий реліз → створення notifications
  - Множинні нові релізи → notifications для кожного
  - Немає нових → skip
  - GitHub API failure → error logged, інші repos продовжують скануватись
- `notifier.service.test.ts` — mock Nodemailer transport
  - Pending notification → sent
  - SMTP failure → status='failed', error_message записано
  - Retry failed → attempts збільшується
- `github.client.test.ts` — mock fetch
  - Успішна відповідь, 404, 429 з retry, cache hit/miss

### Integration tests (bonus)

- Testcontainers: Postgres + Redis
- Повний flow: subscribe → confirm → scan → notifications created → email sent → unsubscribe

---

## GitHub Actions CI

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

---

## Проблемні питання та Edge Cases

### Критичні

1. **Race condition при підписці на один репо**
   - Два юзери одночасно підписуються на новий репо → два INSERT в repositories.
   - Рішення: `ON CONFLICT DO NOTHING` + повторний SELECT. PostgreSQL UNIQUE constraint гарантує consistency.

2. **GitHub rate limit під час підписки**
   - Юзер підписується, але rate limit вичерпаний.
   - Рішення: return 503 з описом помилки. Swagger не визначає 503, але це кращий UX ніж false 404.

3. **Репозиторій видалений після підписки**
   - Scanner отримує 404 для раніше існуючого репо.
   - Рішення: логувати warning, пропустити. Після N послідовних 404 — помічати як invalid.

4. **Порівняння тегів для визначення "нових" релізів**
   - GitHub releases list повертає в хронологічному порядку (найновіші перші).
   - Знаходимо позицію `last_seen_tag` в списку → всі releases до нього — нові.
   - Якщо `last_seen_tag` не знайдено в списку (можливо видалений реліз) → вважаємо тільки перший (найновіший) як новий.

5. **Notification delivery failure**
   - Тепер вирішено через notifications таблицю: failed notifications автоматично retry (до 3 спроб).
   - `last_seen_tag` оновлюється незалежно від відправки email.

### Важливі

6. **Releases vs Tags**
   - Деякі репо використовують тільки tags без releases.
   - Використовуємо Releases API — якщо репо не має releases, не буде сповіщень.
   - Це прийнятно, бо завдання чітко каже "releases".

7. **Pre-releases**
   - Фільтруємо `prerelease: false` і `draft: false` з releases list.
   - Юзери зазвичай хочуть знати про stable releases.

8. **Re-subscribe після unsubscribe**
   - UNIQUE constraint (user_id, repository_id) блокує новий INSERT.
   - Рішення: знайти існуючий рядок, оновити status на 'pending', перегенерувати токени.

9. **Pending підписка — повторний POST /subscribe**
   - Юзер не підтвердив email і знову підписується.
   - Створюємо новий notification (type='confirmation'), return 200 (ідемпотентність).

10. **Великий releases list**
    - GitHub API за замовчуванням повертає до 30 releases per page.
    - Для більшості випадків першої сторінки достатньо (скануємо кожні 5 хв).
    - Якщо `last_seen_tag` не знайдено на першій сторінці — pagination.

### Менш критичні

11. **Token guessing**
    - UUID v4 має 122 біти ентропії — brute force нереальний.
    - Додатково: rate limiting на confirm/unsubscribe endpoints.

12. **Email harvesting через GET /subscriptions**
    - API key auth частково вирішує проблему.

13. **Scanner overlap**
    - Mutex flag `isScanning` запобігає одночасним запускам.

14. **Масштабування сканера**
    - 5000 req/hr з токеном, ~83 репо/хв з паузами.
    - З Redis кешем і ETags — ефективніше.
    - Для тестового завдання — більш ніж достатньо.

15. **Notification spam protection**
    - Перевірка: не створювати дублікат notification для того ж subscription + release_tag.
    - UNIQUE constraint або перевірка перед INSERT.

16. **Часові зони**
    - Всі timestamps зберігаються в UTC.
    - created_at/sent_at — завжди UTC.

---

## Залежності

```json
{
  "dependencies": {
    "express": "^4.18",
    "drizzle-orm": "^0.30",
    "pg": "^8.11",
    "node-cron": "^3.0",
    "nodemailer": "^6.9",
    "zod": "^3.22",
    "ioredis": "^5.3",
    "pino": "^8.17",
    "pino-http": "^9.0",
    "prom-client": "^15.1",
    "cors": "^2.8"
  },
  "devDependencies": {
    "typescript": "^5.3",
    "drizzle-kit": "^0.20",
    "@types/express": "^4.17",
    "@types/node-cron": "^3.0",
    "@types/nodemailer": "^6.4",
    "@types/pg": "^8.10",
    "vitest": "^1.2",
    "eslint": "^8.56",
    "@typescript-eslint/parser": "^6",
    "@typescript-eslint/eslint-plugin": "^6",
    "tsx": "^4.7"
  }
}
```

---

## Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000

# Auth
API_KEY=your-secret-api-key-here

# Database
DATABASE_URL=postgresql://app:secret@localhost:5432/releases

# Redis
REDIS_URL=redis://localhost:6379

# GitHub
GITHUB_TOKEN=ghp_xxxxx    # PAT — 5000 req/hr (strongly recommended)

# SMTP (Mailtrap)
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=<from_mailtrap>
SMTP_PASS=<from_mailtrap>
EMAIL_FROM=noreply@releases-api.app

# Scanner
SCAN_INTERVAL=*/5 * * * *     # every 5 minutes
NOTIFY_INTERVAL=*/1 * * * *   # every minute (process pending notifications)
NOTIFY_MAX_ATTEMPTS=3          # max retry attempts for failed emails
```

---

## План реалізації (по днях)

### День 1 (10 квітня) — Foundation + API

**Ранок:**
1. Init проєкту: package.json, tsconfig, eslint, vitest config
2. Config: env.ts (Zod validation), database.ts (Drizzle + pg pool)
3. DB schema: users, repositories, subscriptions, scan_jobs, notifications
4. Drizzle-kit: generate міграції
5. Express app setup: middleware, error handler, auth middleware, logger
6. Dockerfile + docker-compose.yml + docker-compose.dev.yml
7. Verify: `docker-compose up` → сервер стартує, міграції проходять

**Після обіду:**
8. GitHub client (базовий, без кешу)
9. Subscription module: validator → repository → service → router
10. Notifier: базова відправка email через Nodemailer
11. Manual testing: всі 4 endpoints (curl/Postman)
12. Unit tests: subscription.service

### День 2 (11 квітня) — Scanner + Extras

**Ранок:**
13. Scanner service: fetch releases, порівняння тегів, створення notifications
14. Scanner cron: scheduling + mutex
15. Notifier cron: обробка pending notifications, retry failed
16. Release notification email templates
17. E2E manual test: subscribe → confirm → scan → notification → email
18. Unit tests: scanner.service, notifier.service

**Після обіду:**
19. Redis caching layer (github.cache.ts)
20. Prometheus metrics
21. HTML-сторінка підписки (public/index.html)
22. GitHub Actions CI (lint + tests)
23. API key auth middleware

### День 3 (12 квітня) — Deploy + Polish

24. DigitalOcean: створити Droplet, встановити Docker
25. Deploy docker-compose на сервер
26. DigitalOcean Firewall: 22 + 80
27. Тестування на production
28. README.md: архітектура, рішення, setup instructions
29. Integration tests (якщо є час)
30. Фінальна перевірка + коміт
