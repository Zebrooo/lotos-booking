# План v1, часть 1: каркас, домен, база, сценарии

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** рабочее ядро онлайн-записи: приложение собирается, база мигрирует, чистый домен покрыт тестами, сценарии удержания, подтверждения, отмены, переноса и истечения работают против настоящего PostgreSQL.

**Architecture:** четыре слоя из `12-design-v1.md`: `src/domain` без базы и сети, `src/ports` с интерфейсами, `src/adapters` с заглушками v1, `src/lib/usecases` с транзакциями над `postgres`. Страницы, кабинет и фоновые задачи — во второй части плана (`14-plan-v1-ui.md`).

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3, TypeScript 5.9.3, zod 4, `postgres` 3.4, pg-boss 12, nanoid 6, vitest 5, PostgreSQL 16 в docker, pnpm 10.28.

## Global Constraints

- Node `>=22.22.0`; локально Node 26.4, pnpm 10.28.2, Docker (colima), `psql` на машине нет — SQL только через драйвер или `docker exec`.
- Версии пинуются точно, без `^`; `pnpm.overrides` в `package.json` pnpm 10.28 не читает — переопределения в `pnpm-workspace.yaml`.
- Без `drizzle-orm`, `drizzle-kit`, `luxon`. Сырой SQL через `postgres`. Миграции `migrations/YYYYMMDDHHMMSS_name.sql`, применяются лексикографически, каждая в транзакции.
- Часовой пояс клиники `+05:00`, фиксированный, без перевода часов. В базе `timestamptz`.
- Деньги — целые копейки. Предоплата по умолчанию `40000`.
- Идентификаторы наружу — `nanoid` длиной 21. Персональные данные в логах маскируются.
- Все страницы и тексты по-русски. Пути на латинице по образцу `/moya-zapis`.
- Ни одного коммита в `main`: ветка `feat/<кебаб>` и PR. Мёрж делает Дмитрий.
- Next.js 16 отличается от прежних версий: перед правкой `src/app` читать `node_modules/next/dist/docs/`.
- Заглушка платежей в проде запрещена: `NODE_ENV=production` вместе с `PAYMENT_PROVIDER=fake` валит запуск.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.db.config.ts` | сборка, линт, два набора тестов |
| `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts` | минимальное приложение и живость |
| `src/domain/time.ts` | смещение `+05:00`, день, минуты, будний день |
| `src/domain/slots.ts` | интервалы работы с исключениями, свободные окна, проверка окна |
| `src/domain/transitions.ts` | статусы записи и переходы по событию и актору |
| `src/domain/cancel.ts` | срок удержания, порог отмены, последствие отмены, допустимость переноса |
| `src/domain/money.ts` | состояние денег из журнала |
| `src/ports/{payment,fiscal,notify,clock}.ts` | интерфейсы внешнего мира |
| `src/adapters/payment-fake.ts`, `fiscal-log.ts`, `notify-log.ts`, `clock-system.ts`, `src/adapters/index.ts` | заглушки v1 и выбор по окружению |
| `src/lib/db/client.ts` | подключение `postgres`, транзакции |
| `src/lib/db/schema-check.ts` | список ожидаемых таблиц для теста миграций |
| `scripts/migrate.ts`, `scripts/new-migration.sh` | применение и создание миграций |
| `migrations/20260915120000_core.sql` | вся схема раздела 4 дизайна плюс `refunds` |
| `tests/db/setup.ts`, `tests/db/helpers.ts` | сброс схемы, миграции, фабрики данных |
| `src/lib/usecases/hold.ts` | удержание слота: пациент, запись, ресурсы |
| `src/lib/usecases/payment.ts` | создание платежа и обработка уведомления |
| `src/lib/usecases/cancel.ts` | отмена пациентом и клиникой |
| `src/lib/usecases/transfer.ts` | перенос |
| `src/lib/usecases/expire.ts` | истечение удержаний |
| `src/lib/usecases/errors.ts` | типизированные ошибки сценариев |
| `docker-compose.yml`, `docker/db-init/01-test-db.sql`, `.env.example`, `.github/workflows/ci.yml` | база локально и в CI |

---

### Task 1: Каркас приложения, база в docker, CI

**Files:**
- Modify: `package.json`
- Create: `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/api/health/route.ts`, `docker-compose.yml`, `docker/db-init/01-test-db.sql`, `.env.example`, `.github/workflows/ci.yml`
- Test: `src/app/api/health/route.test.ts`

**Interfaces:**
- Produces: скрипты `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build`, `pnpm db:up`, `pnpm db:migrate`; переменные `DATABASE_URL`, `TEST_DATABASE_URL`.

- [ ] **Step 1: Ветка**

```bash
git checkout -b feat/scaffold
```

- [ ] **Step 2: `package.json`** — заменить целиком:

```json
{
  "name": "lotos-booking",
  "private": true,
  "packageManager": "pnpm@10.28.2",
  "engines": { "node": ">=22.22.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:db": "vitest run --config vitest.db.config.ts",
    "test:e2e": "playwright test",
    "db:up": "docker compose up -d db",
    "db:migrate": "node scripts/migrate.ts",
    "db:new": "bash scripts/new-migration.sh",
    "audit": "pnpm audit --audit-level=low"
  },
  "dependencies": {
    "next": "16.3.5",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "zod": "4.6.5",
    "postgres": "3.4.9",
    "pg-boss": "12.32.0",
    "pino": "10.3.1",
    "jose": "6.2.12",
    "@node-rs/argon2": "2.2.1",
    "nanoid": "6.0.1",
    "server-only": "0.0.1"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "@tailwindcss/postcss": "4.3.3",
    "tailwindcss": "4.3.3",
    "eslint": "10.10.0",
    "eslint-config-next": "16.3.5",
    "vitest": "5.0.0",
    "@playwright/test": "1.63.0",
    "@types/node": "26.5.1",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "pino-pretty": "13.1.3"
  }
}
```

Если какая-то версия не найдётся в реестре, взять ближайшую существующую и записать её в `tech/versions.md`.

- [ ] **Step 3: `pnpm-workspace.yaml`**

```yaml
packages: []
overrides:
  esbuild: "^0.25.0"
```

- [ ] **Step 4: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules", "scripts"]
}
```

- [ ] **Step 5: `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`**

```ts
// next.config.ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "scripts/**"]),
]);
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 6: Приложение-минимум**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Запись к врачу · Лотос", description: "Онлайн-запись в медицинский центр «Лотос»" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="ru"><body>{children}</body></html>);
}
```

```tsx
// src/app/page.tsx
export default function Home() {
  return <main><h1>Запись к врачу</h1><p>Раздел в разработке.</p></main>;
}
```

```css
/* src/app/globals.css */
@import "tailwindcss";
```

```ts
// src/app/api/health/route.ts
export function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 7: Тест здоровья** — `src/app/api/health/route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GET } from "./route";
describe("health", () => {
  it("отвечает ok", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 8: База в docker**

```yaml
# docker-compose.yml
name: lotos
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: lotos
      POSTGRES_PASSWORD: lotos
      POSTGRES_DB: lotos
    ports: ["127.0.0.1:55432:5432"]
    volumes:
      - lotos-db:/var/lib/postgresql/data
      - ./docker/db-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lotos -d lotos"]
      interval: 5s
      timeout: 3s
      retries: 20
volumes:
  lotos-db:
```

```sql
-- docker/db-init/01-test-db.sql
create database lotos_test owner lotos;
```

```bash
# .env.example
DATABASE_URL=postgres://lotos:lotos@127.0.0.1:55432/lotos
TEST_DATABASE_URL=postgres://lotos:lotos@127.0.0.1:55432/lotos_test
PAYMENT_PROVIDER=fake
FAKE_PAYMENT_SECRET=dev-secret
FISCALIZER=log
NOTIFIER=log
SITE_URL=http://localhost:3000
```

- [ ] **Step 9: CI** — `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      db:
        image: postgres:16-alpine
        env: { POSTGRES_USER: lotos, POSTGRES_PASSWORD: lotos, POSTGRES_DB: lotos_test }
        ports: ["55432:5432"]
        options: >-
          --health-cmd "pg_isready -U lotos" --health-interval 5s --health-timeout 3s --health-retries 20
    env:
      TEST_DATABASE_URL: postgres://lotos:lotos@127.0.0.1:55432/lotos_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10.28.2 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm test:db
      - run: pnpm build
      - run: pnpm audit --audit-level=low
```

- [ ] **Step 10: Установить и проверить**

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: линт и типы без ошибок, 1 тест зелёный, сборка успешна. Если `next build` ругается на структуру `src/app`, свериться с `node_modules/next/dist/docs/`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Каркас: Next 16, vitest, docker-compose с PostgreSQL, CI"
```

---

### Task 2: Время клиники

**Files:**
- Create: `src/domain/time.ts`
- Test: `src/domain/time.test.ts`

**Interfaces:**
- Produces: `CLINIC_TZ_OFFSET = "+05:00"`, `type IsoDay = string`, `type Weekday = 1|2|3|4|5|6|7` (1 — понедельник), `localDay(at: Date): IsoDay`, `localMinutes(at: Date): number`, `localTime(day: IsoDay, minutes: number): Date`, `weekday(day: IsoDay): Weekday`, `addDays(day: IsoDay, n: number): IsoDay`, `hhmm(minutes: number): string`, `toMinutes(s: string): number`, `minutesBetween(a: Date, b: Date): number`, `addMinutes(at: Date, n: number): Date`.

- [ ] **Step 1: Тест** — `src/domain/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { localDay, localMinutes, localTime, weekday, addDays, hhmm, toMinutes, minutesBetween, addMinutes } from "./time";

describe("время клиники, +05:00", () => {
  const late = new Date("2026-09-15T20:30:00Z"); // 01:30 следующего дня по Челябинску
  it("день и минуты считаются по часам клиники", () => {
    expect(localDay(late)).toBe("2026-09-16");
    expect(localMinutes(late)).toBe(90);
  });
  it("локальное время превращается в момент UTC", () => {
    expect(localTime("2026-09-16", 90).toISOString()).toBe("2026-09-15T20:30:00.000Z");
  });
  it("будний день: 15 сентября 2026 — вторник, 20 сентября — воскресенье", () => {
    expect(weekday("2026-09-15")).toBe(2);
    expect(weekday("2026-09-20")).toBe(7);
  });
  it("сложение дней переходит через месяц", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
  it("минуты и ЧЧ:ММ взаимно обратны", () => {
    expect(hhmm(570)).toBe("09:30");
    expect(toMinutes("09:30")).toBe(570);
  });
  it("разница и сдвиг в минутах", () => {
    const a = new Date("2026-09-15T04:00:00Z");
    expect(minutesBetween(a, addMinutes(a, 45))).toBe(45);
  });
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

Run: `pnpm test src/domain/time.test.ts`
Expected: FAIL, модуль `./time` не найден.

- [ ] **Step 3: Реализация** — `src/domain/time.ts`:

```ts
// Время клиники: Челябинск, UTC+5, перевода часов нет. Поэтому достаточно
// фиксированного смещения, без библиотек зон. В базе всё в UTC.
export const CLINIC_TZ_OFFSET = "+05:00";
export const CLINIC_TZ_OFFSET_MIN = 300;
/** Дата YYYY-MM-DD по часам клиники. */
export type IsoDay = string;
/** 1 — понедельник … 7 — воскресенье. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const MIN = 60_000;

export function localDay(at: Date): IsoDay {
  return new Date(at.getTime() + CLINIC_TZ_OFFSET_MIN * MIN).toISOString().slice(0, 10);
}

/** Минут от местной полуночи. */
export function localMinutes(at: Date): number {
  const shifted = new Date(at.getTime() + CLINIC_TZ_OFFSET_MIN * MIN);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Момент «day + minutes» по часам клиники. */
export function localTime(day: IsoDay, minutes: number): Date {
  return new Date(new Date(`${day}T00:00:00${CLINIC_TZ_OFFSET}`).getTime() + minutes * MIN);
}

export function weekday(day: IsoDay): Weekday {
  // Полдень: он в тот же день и по UTC, и по +05:00.
  const js = new Date(`${day}T12:00:00${CLINIC_TZ_OFFSET}`).getUTCDay(); // 0 = вс
  return (js === 0 ? 7 : js) as Weekday;
}

export function addDays(day: IsoDay, n: number): IsoDay {
  return localDay(new Date(localTime(day, 12 * 60).getTime() + n * 24 * 60 * MIN));
}

export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function toMinutes(s: string): number {
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MIN;
}

export function addMinutes(at: Date, n: number): Date {
  return new Date(at.getTime() + n * MIN);
}
```

- [ ] **Step 4: Запустить, убедиться, что проходит**

Run: `pnpm test src/domain/time.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Commit**

```bash
git add src/domain/time.ts src/domain/time.test.ts
git commit -m "Домен: время клиники с фиксированным смещением +05:00"
```

---

### Task 3: Интервалы работы и свободные окна

**Files:**
- Create: `src/domain/slots.ts`
- Test: `src/domain/slots.test.ts`

**Interfaces:**
- Consumes: всё из Task 2.
- Produces: типы `Rule { resourceId, weekday, fromMin, toMin }`, `ScheduleException { resourceId, day, kind: "off"|"extra", fromMin: number|null, toMin: number|null }`, `Busy { resourceId, startsAt, endsAt }`, `SlotSettings { stepMin, leadMinutes, horizonDays }`, `Slot { startsAt, endsAt }`, `Interval { fromMin, toMin }`; функции `workIntervals({ resourceId, day, rules, exceptions }): Interval[]`, `freeSlots({ resourceIds, durationMin, day, rules, exceptions, busy, now, settings }): Slot[]`, `isSlotFree({ resourceIds, durationMin, startsAt, rules, exceptions, busy, now, settings }): { ok: true } | { ok: false; reason: "closed"|"past"|"beyond_horizon"|"taken" }`.

Правило: запись занимает **все** ресурсы услуги. Окно свободно, если оно внутри интервалов работы каждого ресурса и не пересекается с занятостью ни одного. Ресурс без правил вовсе (аппарат, кабинет) считается доступным весь день. `off` без интервала снимает весь день, `off` с интервалом вырезает его, `extra` добавляет интервал.

- [ ] **Step 1: Тест** — `src/domain/slots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { workIntervals, freeSlots, isSlotFree, type Rule, type ScheduleException, type Busy } from "./slots";
import { localTime } from "./time";

const DOCTOR = 1, DEVICE = 2;
const rules: Rule[] = [
  { resourceId: DOCTOR, weekday: 2, fromMin: 540, toMin: 780 },   // вт 09:00–13:00
  { resourceId: DOCTOR, weekday: 2, fromMin: 840, toMin: 1080 },  // вт 14:00–18:00
];
const settings = { stepMin: 15, leadMinutes: 60, horizonDays: 30 };
const now = new Date("2026-09-14T00:00:00Z");
const DAY = "2026-09-15"; // вторник
const base = { rules, exceptions: [] as ScheduleException[], busy: [] as Busy[], now, settings };

describe("workIntervals", () => {
  it("по правилам будня, отсортированные", () => {
    expect(workIntervals({ resourceId: DOCTOR, day: DAY, rules, exceptions: [] })).toEqual([
      { fromMin: 540, toMin: 780 }, { fromMin: 840, toMin: 1080 },
    ]);
  });
  it("ресурс без правил доступен весь день", () => {
    expect(workIntervals({ resourceId: DEVICE, day: DAY, rules, exceptions: [] })).toEqual([{ fromMin: 0, toMin: 1440 }]);
  });
  it("off без интервала снимает день, off с интервалом вырезает", () => {
    const off: ScheduleException = { resourceId: DOCTOR, day: DAY, kind: "off", fromMin: null, toMin: null };
    expect(workIntervals({ resourceId: DOCTOR, day: DAY, rules, exceptions: [off] })).toEqual([]);
    const cut: ScheduleException = { resourceId: DOCTOR, day: DAY, kind: "off", fromMin: 720, toMin: 780 };
    expect(workIntervals({ resourceId: DOCTOR, day: DAY, rules, exceptions: [cut] })).toEqual([
      { fromMin: 540, toMin: 720 }, { fromMin: 840, toMin: 1080 },
    ]);
  });
  it("extra добавляет интервал в выходной", () => {
    const extra: ScheduleException = { resourceId: DOCTOR, day: "2026-09-20", kind: "extra", fromMin: 600, toMin: 720 };
    expect(workIntervals({ resourceId: DOCTOR, day: "2026-09-20", rules, exceptions: [extra] })).toEqual([{ fromMin: 600, toMin: 720 }]);
  });
});

describe("freeSlots", () => {
  it("30 окон по 30 минут с шагом 15 в двух интервалах", () => {
    const slots = freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 30, day: DAY });
    expect(slots).toHaveLength(30);
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-09-15T04:00:00.000Z"); // 09:00 местного
    expect(slots[0]!.endsAt.toISOString()).toBe("2026-09-15T04:30:00.000Z");
  });
  it("занятость врача убирает пересекающиеся окна", () => {
    const busy: Busy[] = [{ resourceId: DOCTOR, startsAt: localTime(DAY, 540), endsAt: localTime(DAY, 570) }];
    expect(freeSlots({ ...base, busy, resourceIds: [DOCTOR], durationMin: 30, day: DAY })).toHaveLength(28);
  });
  it("занятость аппарата тоже убирает окна, хотя у аппарата нет правил", () => {
    const busy: Busy[] = [{ resourceId: DEVICE, startsAt: localTime(DAY, 600), endsAt: localTime(DAY, 660) }];
    expect(freeSlots({ ...base, busy, resourceIds: [DOCTOR, DEVICE], durationMin: 30, day: DAY })).toHaveLength(25);
  });
  it("ближайший час не предлагается", () => {
    const late = new Date("2026-09-15T04:30:00Z"); // 09:30 местного
    const slots = freeSlots({ ...base, now: late, resourceIds: [DOCTOR], durationMin: 30, day: DAY });
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-09-15T05:30:00.000Z"); // 10:30
  });
  it("за горизонтом и в прошлом пусто", () => {
    expect(freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 30, day: "2026-10-20" })).toEqual([]);
    expect(freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 30, day: "2026-09-08" })).toEqual([]);
  });
  it("услуга через обед не предлагается", () => {
    const slots = freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 90, day: DAY });
    expect(slots.every(s => s.endsAt <= localTime(DAY, 780) || s.startsAt >= localTime(DAY, 840))).toBe(true);
  });
});

describe("isSlotFree", () => {
  const at = (min: number) => localTime(DAY, min);
  it("свободно", () => {
    expect(isSlotFree({ ...base, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(600) })).toEqual({ ok: true });
  });
  it("вне часов работы — closed", () => {
    expect(isSlotFree({ ...base, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(480) })).toEqual({ ok: false, reason: "closed" });
  });
  it("ближе часа — past", () => {
    const late = new Date("2026-09-15T04:30:00Z");
    expect(isSlotFree({ ...base, now: late, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(570) })).toEqual({ ok: false, reason: "past" });
  });
  it("занято — taken", () => {
    const busy: Busy[] = [{ resourceId: DOCTOR, startsAt: at(600), endsAt: at(630) }];
    expect(isSlotFree({ ...base, busy, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(615) })).toEqual({ ok: false, reason: "taken" });
  });
  it("за горизонтом — beyond_horizon", () => {
    expect(isSlotFree({ ...base, resourceIds: [DOCTOR], durationMin: 30, startsAt: localTime("2026-10-20", 600) })).toEqual({ ok: false, reason: "beyond_horizon" });
  });
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

Run: `pnpm test src/domain/slots.test.ts`
Expected: FAIL, модуль `./slots` не найден.

- [ ] **Step 3: Реализация** — `src/domain/slots.ts`:

```ts
// Свободные окна: правила недели × исключения × занятость × длительность.
// Чистые функции без базы. Запись занимает все ресурсы услуги: врача и,
// если нужен, аппарат или кабинет — так один аппарат не продаётся дважды.
import { type IsoDay, type Weekday, localDay, localMinutes, localTime, weekday, addMinutes, addDays } from "./time";

export type Rule = { resourceId: number; weekday: Weekday; fromMin: number; toMin: number };
export type ScheduleException = {
  resourceId: number; day: IsoDay; kind: "off" | "extra";
  /** Пусто у off — снят весь день. */
  fromMin: number | null; toMin: number | null;
};
export type Busy = { resourceId: number; startsAt: Date; endsAt: Date };
export type SlotSettings = { stepMin: number; leadMinutes: number; horizonDays: number };
export type Slot = { startsAt: Date; endsAt: Date };
export type Interval = { fromMin: number; toMin: number };

type Common = {
  resourceIds: readonly number[]; durationMin: number;
  rules: readonly Rule[]; exceptions: readonly ScheduleException[]; busy: readonly Busy[];
  now: Date; settings: SlotSettings;
};

/** Интервалы работы ресурса в день. Ресурс без правил вовсе доступен весь день. */
export function workIntervals(input: { resourceId: number; day: IsoDay; rules: readonly Rule[]; exceptions: readonly ScheduleException[] }): Interval[] {
  const { resourceId, day } = input;
  const own = input.rules.filter(r => r.resourceId === resourceId);
  const wd = weekday(day);
  let intervals: Interval[] = own.length === 0
    ? [{ fromMin: 0, toMin: 24 * 60 }]
    : own.filter(r => r.weekday === wd).map(r => ({ fromMin: r.fromMin, toMin: r.toMin }));
  for (const ex of input.exceptions) {
    if (ex.resourceId !== resourceId || ex.day !== day) continue;
    if (ex.kind === "extra") {
      if (ex.fromMin != null && ex.toMin != null) intervals.push({ fromMin: ex.fromMin, toMin: ex.toMin });
      continue;
    }
    if (ex.fromMin == null || ex.toMin == null) { intervals = []; continue; }
    const cut: Interval = { fromMin: ex.fromMin, toMin: ex.toMin };
    intervals = intervals.flatMap(it => subtract(it, cut));
  }
  return intervals.filter(it => it.toMin > it.fromMin).sort((a, b) => a.fromMin - b.fromMin);
}

function subtract(it: Interval, cut: Interval): Interval[] {
  if (cut.toMin <= it.fromMin || cut.fromMin >= it.toMin) return [it];
  const out: Interval[] = [];
  if (cut.fromMin > it.fromMin) out.push({ fromMin: it.fromMin, toMin: cut.fromMin });
  if (cut.toMin < it.toMin) out.push({ fromMin: cut.toMin, toMin: it.toMin });
  return out;
}

const overlaps = (aS: Date, aE: Date, bS: Date, bE: Date) => aS < bE && bS < aE;
const inside = (intervals: Interval[], fromMin: number, toMin: number) =>
  intervals.some(it => fromMin >= it.fromMin && toMin <= it.toMin);

function anyBusy(input: Common, startsAt: Date, endsAt: Date): boolean {
  return input.resourceIds.some(id =>
    input.busy.some(b => b.resourceId === id && overlaps(startsAt, endsAt, b.startsAt, b.endsAt)));
}

export function freeSlots(input: Common & { day: IsoDay }): Slot[] {
  const { resourceIds, durationMin, day, now, settings } = input;
  if (resourceIds.length === 0 || !Number.isInteger(durationMin) || durationMin <= 0) return [];
  if (!Number.isInteger(settings.stepMin) || settings.stepMin <= 0) return [];
  const today = localDay(now);
  if (day < today || day > addDays(today, settings.horizonDays)) return [];
  const earliest = addMinutes(now, settings.leadMinutes);
  const perResource = resourceIds.map(id => workIntervals({ resourceId: id, day, rules: input.rules, exceptions: input.exceptions }));
  const primary = perResource[0] ?? [];
  const out: Slot[] = [];
  for (const it of primary) {
    for (let t = it.fromMin; t + durationMin <= it.toMin; t += settings.stepMin) {
      const startsAt = localTime(day, t);
      if (startsAt < earliest) continue;
      if (!perResource.every(iv => inside(iv, t, t + durationMin))) continue;
      const endsAt = addMinutes(startsAt, durationMin);
      if (anyBusy(input, startsAt, endsAt)) continue;
      out.push({ startsAt, endsAt });
    }
  }
  return out;
}

export type SlotCheck = { ok: true } | { ok: false; reason: "closed" | "past" | "beyond_horizon" | "taken" };

/** Последний рубеж перед удержанием: то же правило, что у freeSlots. */
export function isSlotFree(input: Common & { startsAt: Date }): SlotCheck {
  const { resourceIds, durationMin, startsAt, now, settings } = input;
  if (resourceIds.length === 0 || !Number.isInteger(durationMin) || durationMin <= 0) return { ok: false, reason: "closed" };
  if (startsAt < addMinutes(now, settings.leadMinutes)) return { ok: false, reason: "past" };
  const day = localDay(startsAt);
  if (day > addDays(localDay(now), settings.horizonDays)) return { ok: false, reason: "beyond_horizon" };
  const fromMin = localMinutes(startsAt);
  for (const id of resourceIds) {
    const iv = workIntervals({ resourceId: id, day, rules: input.rules, exceptions: input.exceptions });
    if (!inside(iv, fromMin, fromMin + durationMin)) return { ok: false, reason: "closed" };
  }
  if (anyBusy(input, startsAt, addMinutes(startsAt, durationMin))) return { ok: false, reason: "taken" };
  return { ok: true };
}
```

- [ ] **Step 4: Запустить, убедиться, что проходит**

Run: `pnpm test src/domain/slots.test.ts`
Expected: PASS, 15 тестов. Если счётчики окон не сходятся, сначала проверить арифметику теста на бумаге, потом код.

- [ ] **Step 5: Commit**

```bash
git add src/domain/slots.ts src/domain/slots.test.ts
git commit -m "Домен: интервалы работы, исключения и свободные окна по всем ресурсам услуги"
```

---

### Task 4: Статусы и переходы записи

**Files:**
- Create: `src/domain/transitions.ts`
- Test: `src/domain/transitions.test.ts`

**Interfaces:**
- Produces: `BOOKING_STATUSES`, `type BookingStatus = "held"|"confirmed"|"done"|"no_show"|"cancelled"|"transferred"|"expired"`, `type BookingEvent = "pay"|"cancel"|"transfer"|"done"|"no_show"|"expire"`, `type Actor = "patient"|"clinic"|"system"`, `STATUS_LABEL`, `transition(status, event, actor): { ok: true; status } | { ok: false; reason }`, `holdsResources(status): boolean`.

- [ ] **Step 1: Тест** — `src/domain/transitions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { transition, holdsResources, BOOKING_STATUSES } from "./transitions";

describe("переходы записи", () => {
  it("оплата подтверждает удержанную запись, и только системой", () => {
    expect(transition("held", "pay", "system")).toEqual({ ok: true, status: "confirmed" });
    expect(transition("held", "pay", "patient").ok).toBe(false);
  });
  it("удержание истекает только системой", () => {
    expect(transition("held", "expire", "system")).toEqual({ ok: true, status: "expired" });
    expect(transition("confirmed", "expire", "system").ok).toBe(false);
  });
  it("отменить может пациент и клиника из held и confirmed", () => {
    expect(transition("held", "cancel", "patient")).toEqual({ ok: true, status: "cancelled" });
    expect(transition("confirmed", "cancel", "clinic")).toEqual({ ok: true, status: "cancelled" });
    expect(transition("confirmed", "cancel", "system").ok).toBe(false);
  });
  it("перенос только из confirmed", () => {
    expect(transition("confirmed", "transfer", "patient")).toEqual({ ok: true, status: "transferred" });
    expect(transition("held", "transfer", "patient").ok).toBe(false);
  });
  it("итог приёма ставит только клиника", () => {
    expect(transition("confirmed", "done", "clinic")).toEqual({ ok: true, status: "done" });
    expect(transition("confirmed", "no_show", "clinic")).toEqual({ ok: true, status: "no_show" });
    expect(transition("confirmed", "done", "patient").ok).toBe(false);
  });
  it("из конечных статусов выхода нет", () => {
    for (const s of ["done", "no_show", "cancelled", "transferred", "expired"] as const) {
      for (const e of ["pay", "cancel", "transfer", "done", "no_show", "expire"] as const) {
        expect(transition(s, e, "clinic").ok).toBe(false);
      }
    }
  });
  it("ресурсы держат только held и confirmed", () => {
    expect(BOOKING_STATUSES.filter(holdsResources)).toEqual(["held", "confirmed"]);
  });
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

Run: `pnpm test src/domain/transitions.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/domain/transitions.ts`:

```ts
// Ось записи из 12-design-v1.md, раздел 5. Одна таблица правил: из какого
// статуса какое событие кем допустимо. Всё, чего здесь нет, — ошибка.
export const BOOKING_STATUSES = ["held", "confirmed", "done", "no_show", "cancelled", "transferred", "expired"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingEvent = "pay" | "cancel" | "transfer" | "done" | "no_show" | "expire";
export type Actor = "patient" | "clinic" | "system";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  held: "Ждёт оплаты",
  confirmed: "Подтверждена",
  done: "Приём состоялся",
  no_show: "Пациент не пришёл",
  cancelled: "Отменена",
  transferred: "Перенесена",
  expired: "Снята: не оплачена в срок",
};

const RULES: Record<BookingStatus, Partial<Record<BookingEvent, readonly Actor[]>>> = {
  held: { pay: ["system"], cancel: ["patient", "clinic"], expire: ["system"] },
  confirmed: { cancel: ["patient", "clinic"], transfer: ["patient", "clinic"], done: ["clinic"], no_show: ["clinic"] },
  done: {}, no_show: {}, cancelled: {}, transferred: {}, expired: {},
};

const NEXT: Record<BookingEvent, BookingStatus> = {
  pay: "confirmed", cancel: "cancelled", transfer: "transferred", done: "done", no_show: "no_show", expire: "expired",
};

export type TransitionResult = { ok: true; status: BookingStatus } | { ok: false; reason: string };

export function transition(status: BookingStatus, event: BookingEvent, actor: Actor): TransitionResult {
  const allowed = RULES[status][event];
  if (!allowed) return { ok: false, reason: `из состояния «${STATUS_LABEL[status]}» событие ${event} невозможно` };
  if (!allowed.includes(actor)) return { ok: false, reason: `событие ${event} недоступно для ${actor}` };
  return { ok: true, status: NEXT[event] };
}

/** Какие статусы держат ресурсы в booking_resources.active. */
export function holdsResources(status: BookingStatus): boolean {
  return status === "held" || status === "confirmed";
}
```

- [ ] **Step 4: Run** `pnpm test src/domain/transitions.test.ts` — Expected: PASS, 7 тестов.

- [ ] **Step 5: Commit**

```bash
git add src/domain/transitions.ts src/domain/transitions.test.ts
git commit -m "Домен: статусы записи и таблица переходов"
```

---

### Task 5: Удержание, порог отмены, последствие отмены

**Files:**
- Create: `src/domain/cancel.ts`
- Test: `src/domain/cancel.test.ts`

**Interfaces:**
- Consumes: `minutesBetween`, `addMinutes` из Task 2; `Actor` из Task 4.
- Produces: `CancelSettings { freeCancelHours, coolingOffMinutes }`, `HoldSettings { holdMinutes, leadMinutes }`, `type CancelOutcome = { kind: "none"; reason: "not_paid" } | { kind: "refund"; reason: "cooling_off"|"before_threshold"|"by_clinic" } | { kind: "retain"; reason: "after_threshold" }`, `cancelOutcome({ now, startsAt, paidAt, actor, settings }): CancelOutcome`, `hoursBefore(now, startsAt): number`, `canTransfer({ now, startsAt, actor, settings }): boolean`, `holdUntil({ now, startsAt, settings }): Date`.

- [ ] **Step 1: Тест** — `src/domain/cancel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cancelOutcome, canTransfer, holdUntil, hoursBefore } from "./cancel";

const settings = { freeCancelHours: 24, coolingOffMinutes: 60 };
const startsAt = new Date("2026-09-17T05:00:00Z"); // 10:00 местного 17 сентября

describe("cancelOutcome", () => {
  it("не оплачено — возвращать нечего", () => {
    expect(cancelOutcome({ now: new Date("2026-09-16T05:00:00Z"), startsAt, paidAt: null, actor: "patient", settings }))
      .toEqual({ kind: "none", reason: "not_paid" });
  });
  it("клиника отменяет — всегда возврат", () => {
    expect(cancelOutcome({ now: new Date("2026-09-17T04:00:00Z"), startsAt, paidAt: new Date("2026-09-10T00:00:00Z"), actor: "clinic", settings }))
      .toEqual({ kind: "refund", reason: "by_clinic" });
  });
  it("час на размышление после оплаты — возврат даже впритык к приёму", () => {
    const paidAt = new Date("2026-09-17T03:30:00Z");
    expect(cancelOutcome({ now: new Date("2026-09-17T04:20:00Z"), startsAt, paidAt, actor: "patient", settings }))
      .toEqual({ kind: "refund", reason: "cooling_off" });
  });
  it("раньше порога — возврат, ровно на пороге тоже", () => {
    const paidAt = new Date("2026-09-10T00:00:00Z");
    expect(cancelOutcome({ now: new Date("2026-09-15T05:00:00Z"), startsAt, paidAt, actor: "patient", settings }).kind).toBe("refund");
    expect(cancelOutcome({ now: new Date("2026-09-16T05:00:00Z"), startsAt, paidAt, actor: "patient", settings }))
      .toEqual({ kind: "refund", reason: "before_threshold" });
  });
  it("позже порога — удержание", () => {
    const paidAt = new Date("2026-09-10T00:00:00Z");
    expect(cancelOutcome({ now: new Date("2026-09-16T05:01:00Z"), startsAt, paidAt, actor: "patient", settings }))
      .toEqual({ kind: "retain", reason: "after_threshold" });
  });
});

describe("hoursBefore и canTransfer", () => {
  it("часов до приёма", () => {
    expect(hoursBefore(new Date("2026-09-16T05:00:00Z"), startsAt)).toBe(24);
  });
  it("пациент переносит до порога, клиника всегда", () => {
    expect(canTransfer({ now: new Date("2026-09-16T04:00:00Z"), startsAt, actor: "patient", settings })).toBe(true);
    expect(canTransfer({ now: new Date("2026-09-16T06:00:00Z"), startsAt, actor: "patient", settings })).toBe(false);
    expect(canTransfer({ now: new Date("2026-09-17T04:00:00Z"), startsAt, actor: "clinic", settings })).toBe(true);
  });
});

describe("holdUntil", () => {
  const hold = { holdMinutes: 15, leadMinutes: 60 };
  it("обычно now + 15 минут", () => {
    expect(holdUntil({ now: new Date("2026-09-16T05:00:00Z"), startsAt, settings: hold }).toISOString()).toBe("2026-09-16T05:15:00.000Z");
  });
  it("но не позже, чем за час до приёма", () => {
    expect(holdUntil({ now: new Date("2026-09-17T03:50:00Z"), startsAt, settings: hold }).toISOString()).toBe("2026-09-17T04:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/domain/cancel.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/domain/cancel.ts`:

```ts
// Порог отмены (12-design-v1.md, раздел 6): до порога возврат, после —
// удержание в счёт фактических расходов. Кнопка отмены работает всегда,
// здесь считается только последствие.
import { minutesBetween, addMinutes } from "./time";
import type { Actor } from "./transitions";

export type CancelSettings = { freeCancelHours: number; coolingOffMinutes: number };
export type HoldSettings = { holdMinutes: number; leadMinutes: number };

export type CancelOutcome =
  | { kind: "none"; reason: "not_paid" }
  | { kind: "refund"; reason: "cooling_off" | "before_threshold" | "by_clinic" }
  | { kind: "retain"; reason: "after_threshold" };

export function hoursBefore(now: Date, startsAt: Date): number {
  return minutesBetween(now, startsAt) / 60;
}

export function cancelOutcome(input: { now: Date; startsAt: Date; paidAt: Date | null; actor: Actor; settings: CancelSettings }): CancelOutcome {
  const { now, startsAt, paidAt, actor, settings } = input;
  if (paidAt === null) return { kind: "none", reason: "not_paid" };
  if (actor === "clinic") return { kind: "refund", reason: "by_clinic" };
  if (minutesBetween(paidAt, now) <= settings.coolingOffMinutes) return { kind: "refund", reason: "cooling_off" };
  if (hoursBefore(now, startsAt) >= settings.freeCancelHours) return { kind: "refund", reason: "before_threshold" };
  return { kind: "retain", reason: "after_threshold" };
}

export function canTransfer(input: { now: Date; startsAt: Date; actor: Actor; settings: Pick<CancelSettings, "freeCancelHours"> }): boolean {
  if (input.actor === "clinic") return true;
  return hoursBefore(input.now, input.startsAt) >= input.settings.freeCancelHours;
}

/** Срок удержания: now + holdMinutes, но не позже чем за leadMinutes до приёма. */
export function holdUntil(input: { now: Date; startsAt: Date; settings: HoldSettings }): Date {
  const byHold = addMinutes(input.now, input.settings.holdMinutes);
  const byStart = addMinutes(input.startsAt, -input.settings.leadMinutes);
  return byHold < byStart ? byHold : byStart;
}
```

- [ ] **Step 4: Run** `pnpm test src/domain/cancel.test.ts` — Expected: PASS, 9 тестов.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cancel.ts src/domain/cancel.test.ts
git commit -m "Домен: срок удержания и последствие отмены по порогу"
```

---

### Task 6: Состояние денег из журнала

**Files:**
- Create: `src/domain/money.ts`
- Test: `src/domain/money.test.ts`

**Interfaces:**
- Produces: `LEDGER_KINDS`, `type LedgerKind = "advance"|"settle"|"refund"|"retain"|"transfer_out"|"transfer_in"`, `LedgerRow { kind, amountKopecks }`, `type MoneyState = "unpaid"|"advance_held"|"settled"|"refunded"|"retained"|"transferred_out"|"inconsistent"`, `balanceKopecks(rows): number`, `moneyState(rows): MoneyState`, `canAppend(rows, row): { ok: true } | { ok: false; reason: string }`.

Правила: приход — `advance` и `transfer_in`, не больше одного на запись. `settle`, `refund`, `transfer_out` списывают баланс и не могут превысить его. `retain` баланс не списывает: это признание аванса доходом, после него возврат по требованию всё ещё возможен. Состояние — по последней строке-исходу.

- [ ] **Step 1: Тест** — `src/domain/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { moneyState, balanceKopecks, canAppend, type LedgerRow } from "./money";

const adv: LedgerRow = { kind: "advance", amountKopecks: 40000 };

describe("moneyState", () => {
  it.each<[LedgerRow[], string]>([
    [[], "unpaid"],
    [[adv], "advance_held"],
    [[adv, { kind: "settle", amountKopecks: 40000 }], "settled"],
    [[adv, { kind: "refund", amountKopecks: 40000 }], "refunded"],
    [[adv, { kind: "retain", amountKopecks: 40000 }], "retained"],
    [[adv, { kind: "transfer_out", amountKopecks: 40000 }], "transferred_out"],
    [[{ kind: "transfer_in", amountKopecks: 40000 }], "advance_held"],
    [[adv, { kind: "retain", amountKopecks: 40000 }, { kind: "refund", amountKopecks: 40000 }], "refunded"],
    [[adv, { kind: "refund", amountKopecks: 50000 }], "inconsistent"],
    [[{ kind: "refund", amountKopecks: 40000 }], "inconsistent"],
  ])("%j → %s", (rows, expected) => {
    expect(moneyState(rows)).toBe(expected);
  });
});

describe("balanceKopecks", () => {
  it("retain баланс не списывает, refund списывает", () => {
    expect(balanceKopecks([adv, { kind: "retain", amountKopecks: 40000 }])).toBe(40000);
    expect(balanceKopecks([adv, { kind: "refund", amountKopecks: 40000 }])).toBe(0);
  });
});

describe("canAppend", () => {
  it("второй аванс запрещён", () => {
    expect(canAppend([adv], adv).ok).toBe(false);
  });
  it("возврат больше баланса запрещён", () => {
    expect(canAppend([adv], { kind: "refund", amountKopecks: 40001 }).ok).toBe(false);
    expect(canAppend([adv], { kind: "refund", amountKopecks: 40000 }).ok).toBe(true);
  });
  it("удержание только при нетронутом авансе и один раз", () => {
    expect(canAppend([adv], { kind: "retain", amountKopecks: 40000 }).ok).toBe(true);
    expect(canAppend([adv, { kind: "retain", amountKopecks: 40000 }], { kind: "retain", amountKopecks: 40000 }).ok).toBe(false);
    expect(canAppend([adv, { kind: "refund", amountKopecks: 40000 }], { kind: "retain", amountKopecks: 40000 }).ok).toBe(false);
  });
  it("сумма — целые копейки больше нуля", () => {
    expect(canAppend([], { kind: "advance", amountKopecks: 0 }).ok).toBe(false);
    expect(canAppend([], { kind: "advance", amountKopecks: 400.5 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/domain/money.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/domain/money.ts`:

```ts
// Деньги — журнал операций, не колонка-статус (12-design-v1.md, раздел 5).
// Состояние выводится из строк; строки только добавляются.
export const LEDGER_KINDS = ["advance", "settle", "refund", "retain", "transfer_out", "transfer_in"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
export type LedgerRow = { kind: LedgerKind; amountKopecks: number };
export type MoneyState = "unpaid" | "advance_held" | "settled" | "refunded" | "retained" | "transferred_out" | "inconsistent";

const isInflow = (k: LedgerKind) => k === "advance" || k === "transfer_in";
const isDebit = (k: LedgerKind) => k === "settle" || k === "refund" || k === "transfer_out";
const validAmount = (n: number) => Number.isInteger(n) && n > 0;

/** Сколько денег пациента ещё лежит на записи. retain не списывает. */
export function balanceKopecks(rows: readonly LedgerRow[]): number {
  return rows.reduce((acc, r) => acc + (isInflow(r.kind) ? r.amountKopecks : isDebit(r.kind) ? -r.amountKopecks : 0), 0);
}

export function moneyState(rows: readonly LedgerRow[]): MoneyState {
  if (rows.length === 0) return "unpaid";
  if (rows.some(r => !validAmount(r.amountKopecks))) return "inconsistent";
  if (rows.filter(r => isInflow(r.kind)).length !== 1 || !isInflow(rows[0]!.kind)) return "inconsistent";
  if (balanceKopecks(rows) < 0) return "inconsistent";
  const last = rows.filter(r => !isInflow(r.kind)).at(-1);
  if (!last) return "advance_held";
  switch (last.kind) {
    case "settle": return "settled";
    case "refund": return "refunded";
    case "retain": return "retained";
    case "transfer_out": return "transferred_out";
    default: return "inconsistent";
  }
}

export function canAppend(rows: readonly LedgerRow[], row: LedgerRow): { ok: true } | { ok: false; reason: string } {
  if (!validAmount(row.amountKopecks)) return { ok: false, reason: "сумма — целые копейки больше нуля" };
  if (isInflow(row.kind)) {
    return rows.length === 0 ? { ok: true } : { ok: false, reason: "приход на запись уже есть" };
  }
  if (rows.length === 0 || !isInflow(rows[0]!.kind)) return { ok: false, reason: "нет прихода" };
  if (row.kind === "retain") {
    const untouched = rows.length === 1;
    return untouched ? { ok: true } : { ok: false, reason: "удержать можно только нетронутый аванс, один раз" };
  }
  if (row.amountKopecks > balanceKopecks(rows)) return { ok: false, reason: "сумма больше остатка на записи" };
  return { ok: true };
}
```

- [ ] **Step 4: Run** `pnpm test src/domain/money.test.ts` — Expected: PASS, 15 тестов.

- [ ] **Step 5: Commit**

```bash
git add src/domain/money.ts src/domain/money.test.ts
git commit -m "Домен: состояние денег из журнала операций"
```

---

### Task 7: Порты и заглушки v1

**Files:**
- Create: `src/ports/payment.ts`, `src/ports/fiscal.ts`, `src/ports/notify.ts`, `src/ports/clock.ts`, `src/adapters/payment-fake.ts`, `src/adapters/fiscal-log.ts`, `src/adapters/notify-log.ts`, `src/adapters/clock-system.ts`, `src/adapters/index.ts`
- Test: `src/adapters/payment-fake.test.ts`, `src/adapters/index.test.ts`

**Interfaces:**
- Produces: `PaymentProvider { name; createPayment(req: PaymentRequest): Promise<PaymentCreated>; parseNotification(req: Request): Promise<ParsedNotification>; status(externalId): Promise<"paid"|"pending"|"failed">; refund(externalId, amountKopecks): Promise<RefundResult> }`, `PaymentRequest { paymentId, amountKopecks, description, returnUrl, email }`, `PaymentCreated { externalId, payUrl }`, `PaymentNotification { externalId, status: "paid"|"failed", amountKopecks, raw }`, `ParsedNotification = PaymentNotification | { invalid: string }`, `RefundResult = { ok: true; refundId } | { ok: false; error }`; `Fiscalizer { name; send(r: ReceiptRequest): Promise<ReceiptResult> }`; `Notifier { name; sendEmail(m: EmailMessage): Promise<SendResult> }`; `Clock { now(): Date }`; `createFakePaymentProvider({ baseUrl, secret })`, `fakeSignature(secret, externalId, status, amountKopecks)`, `loadAdapters(env): Adapters { payment, fiscal, notify, clock }`.

- [ ] **Step 1: Порты**

```ts
// src/ports/payment.ts
export type PaymentRequest = { paymentId: number; amountKopecks: number; description: string; returnUrl: string; email: string };
export type PaymentCreated = { externalId: string; payUrl: string };
export type PaymentNotification = { externalId: string; status: "paid" | "failed"; amountKopecks: number; raw: unknown };
export type ParsedNotification = PaymentNotification | { invalid: string };
export type RefundResult = { ok: true; refundId: string } | { ok: false; error: string };

export interface PaymentProvider {
  readonly name: string;
  createPayment(req: PaymentRequest): Promise<PaymentCreated>;
  /** Разбор и проверка подписи входящего уведомления. Не трогает базу. */
  parseNotification(req: Request): Promise<ParsedNotification>;
  status(externalId: string): Promise<"paid" | "pending" | "failed">;
  refund(externalId: string, amountKopecks: number): Promise<RefundResult>;
}
```

```ts
// src/ports/fiscal.ts
export type ReceiptRequest = { kind: "advance" | "settle" | "refund"; amountKopecks: number; email: string; description: string; bookingId: number };
export type ReceiptResult = { ok: true; externalId: string } | { ok: false; error: string };
export interface Fiscalizer { readonly name: string; send(r: ReceiptRequest): Promise<ReceiptResult>; }
```

```ts
// src/ports/notify.ts
export type EmailMessage = { to: string; subject: string; text: string };
export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };
export interface Notifier { readonly name: string; sendEmail(m: EmailMessage): Promise<SendResult>; }
```

```ts
// src/ports/clock.ts
export interface Clock { now(): Date }
```

- [ ] **Step 2: Тест заглушки платежей** — `src/adapters/payment-fake.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createFakePaymentProvider, fakeSignature } from "./payment-fake";

const p = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const notify = (body: unknown) => new Request("http://x/notify", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("fake payment provider", () => {
  it("создаёт ссылку на dev-страницу оплаты", async () => {
    const r = await p.createPayment({ paymentId: 7, amountKopecks: 40000, description: "x", returnUrl: "http://localhost:3000/moya-zapis/abc", email: "a@b.c" });
    expect(r.externalId).toBe("fake-7");
    expect(r.payUrl).toContain("/dev/oplata/fake-7");
  });
  it("принимает подписанное уведомление", async () => {
    const sig = fakeSignature("s", "fake-7", "paid", 40000);
    const r = await p.parseNotification(notify({ externalId: "fake-7", status: "paid", amountKopecks: 40000, signature: sig }));
    expect(r).toMatchObject({ externalId: "fake-7", status: "paid", amountKopecks: 40000 });
  });
  it("отвергает чужую подпись и не-JSON", async () => {
    const bad = await p.parseNotification(notify({ externalId: "fake-7", status: "paid", amountKopecks: 40000, signature: "00" }));
    expect(bad).toEqual({ invalid: "подпись не сошлась" });
    const notJson = await p.parseNotification(new Request("http://x/notify", { method: "POST", body: "{" }));
    expect(notJson).toEqual({ invalid: "тело не JSON" });
  });
});
```

- [ ] **Step 3: Тест выбора адаптеров** — `src/adapters/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadAdapters } from "./index";

describe("loadAdapters", () => {
  it("в разработке заглушки по умолчанию", () => {
    const a = loadAdapters({ NODE_ENV: "development" });
    expect(a.payment.name).toBe("fake");
    expect(a.fiscal.name).toBe("log");
    expect(a.notify.name).toBe("log");
  });
  it("заглушка платежей в production запрещена", () => {
    expect(() => loadAdapters({ NODE_ENV: "production", PAYMENT_PROVIDER: "fake" })).toThrow(/production/);
  });
  it("неизвестный поставщик — ошибка", () => {
    expect(() => loadAdapters({ NODE_ENV: "development", PAYMENT_PROVIDER: "nobody" })).toThrow(/PAYMENT_PROVIDER/);
  });
});
```

- [ ] **Step 4: Run** `pnpm test src/adapters` — Expected: FAIL, модулей нет.

- [ ] **Step 5: Реализация**

```ts
// src/adapters/payment-fake.ts
// Заглушка платежей для разработки и тестов: ссылка ведёт на dev-страницу,
// которая сама шлёт подписанное уведомление в /api/pay/fake/notify.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PaymentRequest, ParsedNotification } from "@/ports/payment";

export type FakePaymentOptions = { baseUrl: string; secret: string };

export function fakeSignature(secret: string, externalId: string, status: string, amountKopecks: number): string {
  return createHmac("sha256", secret).update(`${externalId}|${status}|${amountKopecks}`).digest("hex");
}

export function createFakePaymentProvider(o: FakePaymentOptions): PaymentProvider {
  return {
    name: "fake",
    async createPayment(req: PaymentRequest) {
      const externalId = `fake-${req.paymentId}`;
      const payUrl = `${o.baseUrl}/dev/oplata/${externalId}?amount=${req.amountKopecks}&return=${encodeURIComponent(req.returnUrl)}`;
      return { externalId, payUrl };
    },
    async parseNotification(req: Request): Promise<ParsedNotification> {
      let body: unknown;
      try { body = await req.json(); } catch { return { invalid: "тело не JSON" }; }
      const b = body as { externalId?: unknown; status?: unknown; amountKopecks?: unknown; signature?: unknown };
      if (typeof b.externalId !== "string" || (b.status !== "paid" && b.status !== "failed")
        || typeof b.amountKopecks !== "number" || !Number.isInteger(b.amountKopecks) || typeof b.signature !== "string") {
        return { invalid: "неполное уведомление" };
      }
      const expected = Buffer.from(fakeSignature(o.secret, b.externalId, b.status, b.amountKopecks));
      const got = Buffer.from(b.signature);
      if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { invalid: "подпись не сошлась" };
      return { externalId: b.externalId, status: b.status, amountKopecks: b.amountKopecks, raw: body };
    },
    async status() { return "pending"; },
    async refund(externalId) { return { ok: true, refundId: `refund-${externalId}` }; },
  };
}
```

```ts
// src/adapters/fiscal-log.ts
import type { Fiscalizer } from "@/ports/fiscal";
export const logFiscalizer: Fiscalizer = {
  name: "log",
  async send(r) {
    console.info("[чек:лог]", r.kind, r.amountKopecks, "→", r.email.replace(/^(.).*(@.*)$/, "$1***$2"));
    return { ok: true, externalId: `log-${Date.now()}` };
  },
};
```

```ts
// src/adapters/notify-log.ts
import type { Notifier } from "@/ports/notify";
export const logNotifier: Notifier = {
  name: "log",
  async sendEmail(m) {
    console.info("[письмо:лог]", m.subject, "→", m.to.replace(/^(.).*(@.*)$/, "$1***$2"));
    return { ok: true, messageId: `log-${Date.now()}` };
  },
};
```

```ts
// src/adapters/clock-system.ts
import type { Clock } from "@/ports/clock";
export const systemClock: Clock = { now: () => new Date() };
```

```ts
// src/adapters/index.ts
import type { PaymentProvider } from "@/ports/payment";
import type { Fiscalizer } from "@/ports/fiscal";
import type { Notifier } from "@/ports/notify";
import type { Clock } from "@/ports/clock";
import { createFakePaymentProvider } from "./payment-fake";
import { logFiscalizer } from "./fiscal-log";
import { logNotifier } from "./notify-log";
import { systemClock } from "./clock-system";

export type Adapters = { payment: PaymentProvider; fiscal: Fiscalizer; notify: Notifier; clock: Clock };

export function loadAdapters(env: Record<string, string | undefined>): Adapters {
  const provider = env.PAYMENT_PROVIDER ?? "fake";
  if (env.NODE_ENV === "production" && provider === "fake") {
    throw new Error("PAYMENT_PROVIDER=fake запрещён в production");
  }
  let payment: PaymentProvider;
  if (provider === "fake") {
    payment = createFakePaymentProvider({ baseUrl: env.SITE_URL ?? "http://localhost:3000", secret: env.FAKE_PAYMENT_SECRET ?? "dev-secret" });
  } else {
    throw new Error(`Неизвестный PAYMENT_PROVIDER: ${provider}`);
  }
  const fiscalName = env.FISCALIZER ?? "log";
  if (fiscalName !== "log") throw new Error(`Неизвестный FISCALIZER: ${fiscalName}`);
  const notifyName = env.NOTIFIER ?? "log";
  if (notifyName !== "log") throw new Error(`Неизвестный NOTIFIER: ${notifyName}`);
  return { payment, fiscal: logFiscalizer, notify: logNotifier, clock: systemClock };
}
```

- [ ] **Step 6: Run** `pnpm test src/adapters` — Expected: PASS, 6 тестов.

- [ ] **Step 7: Commit**

```bash
git add src/ports src/adapters
git commit -m "Порты платежей, чеков, писем, часов и заглушки v1"
```

---

### Task 8: Миграции, клиент базы, тестовая обвязка

**Files:**
- Create: `scripts/migrate.ts`, `scripts/new-migration.sh`, `migrations/20260915120000_core.sql`, `src/lib/db/client.ts`, `vitest.db.config.ts`, `tests/db/setup.ts`, `tests/db/helpers.ts`
- Test: `tests/db/schema.test.ts`
- Modify: `tsconfig.json` — убрать `"scripts"` из `exclude`, чтобы `tsc` проверял и скрипты.

**Interfaces:**
- Produces: `migrate(databaseUrl, dir?): Promise<string[]>`; `createDb(url): Sql`, `db(): Sql` (по `DATABASE_URL`); в тестах `testDb(): Sql`, `truncateAll(sql)`, `seedClinic(sql): Promise<{ doctorId, deviceId, consultId, uziId, consentIds: [number, number] }>`. Все `bigint` из базы приходят числами, имена колонок — в camelCase (`transform: postgres.camel`).

- [ ] **Step 1: Скрипты миграций**

```ts
// scripts/migrate.ts — запуск: node scripts/migrate.ts (Node 22+ исполняет .ts без сборки)
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function migrate(databaseUrl: string, dir = path.resolve("migrations")): Promise<string[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map(r => r.name));
    const done: string[] = [];
    for (const f of files) {
      if (applied.has(f)) continue;
      const body = await readFile(path.join(dir, f), "utf8");
      await sql.begin(async tx => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      done.push(f);
    }
    return done;
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL не задан"); process.exit(1); }
  migrate(url)
    .then(d => console.log(d.length ? `применено: ${d.join(", ")}` : "новых миграций нет"))
    .catch(e => { console.error(e); process.exit(1); });
}
```

```bash
#!/usr/bin/env bash
# scripts/new-migration.sh <имя> — новый файл миграции с именем по времени создания.
set -euo pipefail
name="${1:?имя миграции, например: core}"
f="migrations/$(date -u +%Y%m%d%H%M%S)_${name}.sql"
printf -- "-- %s\n\n" "$name" > "$f"
echo "$f"
```

- [ ] **Step 2: Миграция схемы** — `migrations/20260915120000_core.sql`:

```sql
-- core: схема v1 по 12-design-v1.md, раздел 4.
create extension if not exists btree_gist;

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Одна строка настроек.
create table settings (
  id smallint primary key default 1 check (id = 1),
  free_cancel_hours int not null default 24,
  hold_minutes int not null default 15,
  lead_minutes int not null default 60,
  horizon_days int not null default 30,
  reminder_hours_before int not null default 27,
  cooling_off_minutes int not null default 60,
  arrive_early_minutes int not null default 10,
  slot_step_min int not null default 15,
  online_booking_paused boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger settings_touch before update on settings for each row execute function touch_updated_at();
insert into settings (id) values (1);

create table services (
  id bigint generated always as identity primary key,
  title text not null,
  kind text not null check (kind in ('consultation', 'ultrasound', 'analysis', 'diagnostics')),
  duration_min int not null check (duration_min between 5 and 480),
  price_kopecks int not null check (price_kopecks >= 0),
  prepay_kopecks int not null default 40000 check (prepay_kopecks >= 0),
  prep_note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table resources (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('doctor', 'room', 'device')),
  title text not null,
  specialty text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ресурсы услуги: врачи вида doctor — кто её оказывает, пациент выбирает
-- одного; ресурсы других видов занимаются всегда (аппарат, кабинет).
create table service_resources (
  service_id bigint not null references services (id) on delete cascade,
  resource_id bigint not null references resources (id) on delete cascade,
  primary key (service_id, resource_id)
);

create table schedule_rules (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  from_min int not null check (from_min between 0 and 1439),
  to_min int not null check (to_min between 1 and 1440),
  check (to_min > from_min)
);
create index schedule_rules_resource_idx on schedule_rules (resource_id, weekday);

create table schedule_exceptions (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('off', 'extra')),
  from_min int check (from_min between 0 and 1439),
  to_min int check (to_min between 1 and 1440),
  reason text,
  created_at timestamptz not null default now(),
  check ((from_min is null) = (to_min is null)),
  check (to_min is null or to_min > from_min),
  check (kind = 'off' or from_min is not null)
);
create index schedule_exceptions_resource_day_idx on schedule_exceptions (resource_id, day);

create table patients (
  id bigint generated always as identity primary key,
  full_name text not null,
  birth_date date not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone, birth_date)
);
create trigger patients_touch before update on patients for each row execute function touch_updated_at();

create table consents (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('personal_data', 'prepay_terms')),
  version int not null,
  body text not null,
  published_at timestamptz not null default now(),
  unique (kind, version)
);

create table bookings (
  id bigint generated always as identity (start with 1001) primary key,
  token text not null unique,
  patient_id bigint not null references patients (id) on delete restrict,
  service_id bigint not null references services (id) on delete restrict,
  service jsonb not null,
  resource_id bigint not null references resources (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'held'
    check (status in ('held', 'confirmed', 'done', 'no_show', 'cancelled', 'transferred', 'expired')),
  hold_until timestamptz,
  paid_at timestamptz,
  cancelled_by text check (cancelled_by in ('patient', 'clinic')),
  cancelled_at timestamptz,
  cancel_reason text,
  hours_before_cancel numeric(8, 2),
  transferred_from_id bigint references bookings (id) on delete set null,
  source text not null default 'site' check (source in ('site', 'admin')),
  booker_relation text not null default 'self' check (booker_relation in ('self', 'child', 'relative')),
  booker_name text,
  booker_phone text,
  booker_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((status = 'cancelled') = (cancelled_by is not null)),
  check (status <> 'held' or hold_until is not null)
);
create index bookings_patient_idx on bookings (patient_id, starts_at desc);
create index bookings_status_time_idx on bookings (status, starts_at);
create index bookings_hold_idx on bookings (hold_until) where status = 'held';
create trigger bookings_touch before update on bookings for each row execute function touch_updated_at();

-- Единственная защита от двойной продажи. Полуоткрытый интервал: запись до
-- 12:00 и запись с 12:00 не мешают друг другу. Держат ресурс только active.
create table booking_resources (
  booking_id bigint not null references bookings (id) on delete cascade,
  resource_id bigint not null references resources (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  primary key (booking_id, resource_id),
  check (ends_at > starts_at),
  constraint booking_resources_no_overlap exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (active)
);
create index booking_resources_resource_time_idx on booking_resources (resource_id, starts_at) where active;

create table booking_consents (
  booking_id bigint not null references bookings (id) on delete cascade,
  consent_id bigint not null references consents (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  primary key (booking_id, consent_id)
);

create table payments (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  provider text not null,
  external_id text,
  amount_kopecks int not null check (amount_kopecks > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'expired')),
  pay_url text,
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index payments_booking_idx on payments (booking_id);
create trigger payments_touch before update on payments for each row execute function touch_updated_at();

-- Журнал денег: только вставка. Состояние выводится кодом (src/domain/money.ts).
create table ledger (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  kind text not null check (kind in ('advance', 'settle', 'refund', 'retain', 'transfer_out', 'transfer_in')),
  amount_kopecks int not null check (amount_kopecks > 0),
  payment_id bigint references payments (id),
  note text,
  created_at timestamptz not null default now()
);
create index ledger_booking_idx on ledger (booking_id, id);

-- Возврат в работе: строка появляется при отмене, деньги и запись в ledger — когда провайдер подтвердил.
create table refunds (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  payment_id bigint not null references payments (id),
  amount_kopecks int not null check (amount_kopecks > 0),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  external_id text,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_status_idx on refunds (status);
create trigger refunds_touch before update on refunds for each row execute function touch_updated_at();

create table receipts (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  kind text not null check (kind in ('advance', 'settle', 'refund')),
  ledger_id bigint references ledger (id),
  amount_kopecks int not null check (amount_kopecks > 0),
  email text not null,
  provider text,
  external_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index receipts_status_idx on receipts (status);
create trigger receipts_touch before update on receipts for each row execute function touch_updated_at();

create table admins (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'senior')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table notifications (
  id bigint generated always as identity primary key,
  booking_id bigint references bookings (id) on delete set null,
  channel text not null default 'email' check (channel in ('email')),
  recipient text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_status_idx on notifications (status, created_at);

create table audit (
  id bigint generated always as identity primary key,
  admin_id bigint references admins (id) on delete set null,
  action text not null,
  booking_id bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 3: Клиент базы** — `src/lib/db/client.ts`:

```ts
import postgres, { type Sql } from "postgres";

export type { Sql };

// bigint (int8) из базы — числом: идентификаторы и копейки далеки от 2^53.
const bigintAsNumber = { to: 20, from: [20], serialize: (x: number | bigint) => x.toString(), parse: (x: string) => Number(x) };

export function createDb(url: string, max = 10): Sql {
  return postgres(url, { max, transform: postgres.camel, types: { bigint: bigintAsNumber }, onnotice: () => {} });
}

let shared: Sql | undefined;
/** Общее подключение приложения по DATABASE_URL. */
export function db(): Sql {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL не задан");
    shared = createDb(url);
  }
  return shared;
}
```

- [ ] **Step 4: Тестовая обвязка**

```ts
// vitest.db.config.ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
```

```ts
// tests/db/setup.ts — раз на прогон: чистая схема и все миграции.
import postgres from "postgres";
import { migrate } from "../../scripts/migrate";
export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://lotos:lotos@127.0.0.1:55432/lotos_test";
export default async function setup() {
  const sql = postgres(TEST_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
  } finally {
    await sql.end();
  }
  await migrate(TEST_URL);
}
```

```ts
// tests/db/helpers.ts
import { createDb, type Sql } from "@/lib/db/client";
export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://lotos:lotos@127.0.0.1:55432/lotos_test";
export function testDb(): Sql { return createDb(TEST_URL, 4); }

export async function truncateAll(sql: Sql): Promise<void> {
  await sql`truncate audit, notifications, receipts, refunds, ledger, payments, booking_consents,
    booking_resources, bookings, consents, patients, schedule_exceptions, schedule_rules,
    service_resources, resources, services, admins restart identity cascade`;
  await sql`update settings set free_cancel_hours = 24, hold_minutes = 15, lead_minutes = 60,
    horizon_days = 30, cooling_off_minutes = 60, slot_step_min = 15, online_booking_paused = false where id = 1`;
}

/** Кардиолог с приёмом пн–пт 09:00–13:00 и 14:00–18:00, аппарат УЗИ, две услуги, два согласия. */
export async function seedClinic(sql: Sql) {
  const [doctor] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Жаворонкова А. А.', 'кардиолог') returning id`;
  const [device] = await sql<{ id: number }[]>`insert into resources (kind, title) values ('device', 'Аппарат УЗИ') returning id`;
  const [consult] = await sql<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks) values ('Консультация кардиолога', 'consultation', 30, 180000) returning id`;
  const [uzi] = await sql<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks) values ('УЗИ сердца', 'ultrasound', 45, 250000) returning id`;
  await sql`insert into service_resources (service_id, resource_id) values (${consult!.id}, ${doctor!.id}), (${uzi!.id}, ${doctor!.id}), (${uzi!.id}, ${device!.id})`;
  for (const wd of [1, 2, 3, 4, 5]) {
    await sql`insert into schedule_rules (resource_id, weekday, from_min, to_min) values (${doctor!.id}, ${wd}, 540, 780), (${doctor!.id}, ${wd}, 840, 1080)`;
  }
  const [pd] = await sql<{ id: number }[]>`insert into consents (kind, version, body) values ('personal_data', 1, 'Согласие на обработку персональных данных, редакция 1') returning id`;
  const [pt] = await sql<{ id: number }[]>`insert into consents (kind, version, body) values ('prepay_terms', 1, 'Условия предоплаты, редакция 1') returning id`;
  return { doctorId: doctor!.id, deviceId: device!.id, consultId: consult!.id, uziId: uzi!.id, consentIds: [pd!.id, pt!.id] as [number, number] };
}
```

- [ ] **Step 5: Тест схемы** — `tests/db/schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

describe("схема", () => {
  it("все таблицы на месте", async () => {
    const rows = await sql<{ tableName: string }[]>`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    expect(rows.map(r => r.tableName)).toEqual([
      "admins", "audit", "booking_consents", "booking_resources", "bookings", "consents", "ledger",
      "notifications", "patients", "payments", "receipts", "refunds", "resources", "schedule_exceptions",
      "schedule_rules", "schema_migrations", "service_resources", "services", "settings",
    ]);
  });

  it("исключающее ограничение не даёт занять ресурс дважды", async () => {
    const { doctorId, consultId } = await seedClinic(sql);
    const [p] = await sql<{ id: number }[]>`insert into patients (full_name, birth_date, phone, email) values ('Иванов И. И.', '1980-01-01', '+79000000001', 'i@example.com') returning id`;
    const mk = async (token: string, from: string, to: string) => {
      const [b] = await sql<{ id: number }[]>`insert into bookings (token, patient_id, service_id, service, resource_id, starts_at, ends_at, status, hold_until)
        values (${token}, ${p!.id}, ${consultId}, '{}', ${doctorId}, ${from}, ${to}, 'held', now() + interval '15 minutes') returning id`;
      return b!.id;
    };
    const b1 = await mk("t1", "2026-09-15T04:00:00Z", "2026-09-15T04:30:00Z");
    await sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b1}, ${doctorId}, '2026-09-15T04:00:00Z', '2026-09-15T04:30:00Z')`;
    const b2 = await mk("t2", "2026-09-15T04:15:00Z", "2026-09-15T04:45:00Z");
    await expect(
      sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b2}, ${doctorId}, '2026-09-15T04:15:00Z', '2026-09-15T04:45:00Z')`,
    ).rejects.toMatchObject({ code: "23P01", constraint_name: "booking_resources_no_overlap" });
    // Стык интервалов — не пересечение; неактивная строка ресурс не держит.
    const b3 = await mk("t3", "2026-09-15T04:30:00Z", "2026-09-15T05:00:00Z");
    await sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b3}, ${doctorId}, '2026-09-15T04:30:00Z', '2026-09-15T05:00:00Z')`;
    await sql`update booking_resources set active = false where booking_id = ${b1}`;
    const b4 = await mk("t4", "2026-09-15T04:00:00Z", "2026-09-15T04:30:00Z");
    await sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b4}, ${doctorId}, '2026-09-15T04:00:00Z', '2026-09-15T04:30:00Z')`;
  });
});
```

- [ ] **Step 6: Поднять базу и прогнать**

```bash
pnpm db:up
pnpm test:db
```

Expected: PASS, 2 теста. Первый запуск контейнера создаёт `lotos_test` из `docker/db-init`. Если имя ограничения в ошибке приходит в другом поле, свериться с тем, что отдаёт драйвер `postgres` (`err.constraint_name`), и поправить тест, а не схему.

- [ ] **Step 7: Commit**

```bash
git add scripts migrations src/lib/db vitest.db.config.ts tests/db tsconfig.json
git commit -m "База: миграции по времени создания, схема v1, тестовая обвязка против PostgreSQL"
```

---

### Task 9: Ошибки, настройки и удержание слота

**Files:**
- Create: `src/lib/usecases/errors.ts`, `src/lib/usecases/settings.ts`, `src/lib/usecases/hold.ts`
- Test: `tests/db/hold.test.ts`

**Interfaces:**
- Consumes: домен Task 2–5, `Sql` и `createDb` из Task 8, `Clock` из Task 7.
- Produces: `class UsecaseError extends Error { code: UsecaseErrorCode }` с кодами `"slot_taken"|"slot_closed"|"slot_past"|"beyond_horizon"|"duplicate_booking"|"not_found"|"bad_status"|"amount_mismatch"|"consent_missing"|"service_inactive"|"transfer_not_allowed"|"online_paused"|"doctor_mismatch"`; `loadSettings(sql): Promise<Settings>`; `holdSlot(sql, clock, input: HoldInput): Promise<HoldResult>`, где `HoldInput { serviceId, doctorId, startsAt: Date, patient: { fullName, birthDate: string, phone, email }, booker?: { relation: "child"|"relative", name, phone, email }, consentIds: number[], ip?, userAgent?, source?: "site"|"admin" }`, `HoldResult { bookingId, token, holdUntil: Date, endsAt: Date, prepayKopecks }`; вспомогательное `loadSlotContext(sql, { serviceId, doctorId, day }): Promise<{ service, resourceIds, rules, exceptions, busy }>` — переиспользуется переносом.

- [ ] **Step 1: Ошибки и настройки**

```ts
// src/lib/usecases/errors.ts
export type UsecaseErrorCode =
  | "slot_taken" | "slot_closed" | "slot_past" | "beyond_horizon" | "duplicate_booking"
  | "not_found" | "bad_status" | "amount_mismatch" | "consent_missing" | "service_inactive"
  | "transfer_not_allowed" | "online_paused" | "doctor_mismatch";

export class UsecaseError extends Error {
  constructor(public readonly code: UsecaseErrorCode, message: string) {
    super(message);
    this.name = "UsecaseError";
  }
}

/** Ошибка исключающего ограничения PostgreSQL. */
export function isExclusionViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23P01";
}
```

```ts
// src/lib/usecases/settings.ts
import type { Sql } from "@/lib/db/client";
export type Settings = {
  freeCancelHours: number; holdMinutes: number; leadMinutes: number; horizonDays: number;
  reminderHoursBefore: number; coolingOffMinutes: number; arriveEarlyMinutes: number;
  slotStepMin: number; onlineBookingPaused: boolean;
};
export async function loadSettings(sql: Sql): Promise<Settings> {
  const [row] = await sql<Settings[]>`select free_cancel_hours, hold_minutes, lead_minutes, horizon_days,
    reminder_hours_before, cooling_off_minutes, arrive_early_minutes, slot_step_min, online_booking_paused
    from settings where id = 1`;
  if (!row) throw new Error("settings пуста");
  return row;
}
```

- [ ] **Step 2: Тест удержания** — `tests/db/hold.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { UsecaseError } from "@/lib/usecases/errors";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") }; // пн, 11:00 местного
const DAY = "2026-09-15"; // вт
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };

describe("holdSlot", () => {
  it("создаёт удержание, занимает врача и аппарат, пишет согласия", async () => {
    const s = await seedClinic(sql);
    const r = await holdSlot(sql, clock, { serviceId: s.uziId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    expect(r.token).toHaveLength(21);
    expect(r.prepayKopecks).toBe(40000);
    expect(r.endsAt.toISOString()).toBe(localTime(DAY, 645).toISOString());
    expect(r.holdUntil.toISOString()).toBe("2026-09-14T06:15:00.000Z");
    const res = await sql<{ resourceId: number }[]>`select resource_id from booking_resources where booking_id = ${r.bookingId} and active order by 1`;
    expect(res.map(x => x.resourceId)).toEqual([s.doctorId, s.deviceId]);
    const cons = await sql`select consent_id from booking_consents where booking_id = ${r.bookingId}`;
    expect(cons).toHaveLength(2);
    const [b] = await sql<{ status: string; service: { durationMin: number; prepayKopecks: number } }[]>`select status, service from bookings where id = ${r.bookingId}`;
    expect(b!.status).toBe("held");
    expect(b!.service.durationMin).toBe(45);
  });

  it("второй на то же время получает slot_taken", async () => {
    const s = await seedClinic(sql);
    const input = { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds };
    await holdSlot(sql, clock, input);
    const other = { ...input, patient: { ...patient, phone: "+79000000002" } };
    await expect(holdSlot(sql, clock, other)).rejects.toMatchObject({ code: "slot_taken" });
  });

  it("аппарат, занятый другой услугой, блокирует УЗИ, но не консультацию", async () => {
    const s = await seedClinic(sql);
    const [doc2] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Петров П. П.', 'эндокринолог') returning id`;
    await sql`insert into service_resources (service_id, resource_id) values (${s.uziId}, ${doc2!.id}), (${s.consultId}, ${doc2!.id})`;
    await holdSlot(sql, clock, { serviceId: s.uziId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    const p2 = { ...patient, phone: "+79000000002" };
    await expect(holdSlot(sql, clock, { serviceId: s.uziId, doctorId: doc2!.id, startsAt: localTime(DAY, 615), patient: p2, consentIds: s.consentIds })).rejects.toMatchObject({ code: "slot_taken" });
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: doc2!.id, startsAt: localTime(DAY, 615), patient: p2, consentIds: s.consentIds })).resolves.toBeTruthy();
  });

  it("вне часов, в прошлом и за горизонтом — понятные коды", async () => {
    const s = await seedClinic(sql);
    const base = { serviceId: s.consultId, doctorId: s.doctorId, patient, consentIds: s.consentIds };
    await expect(holdSlot(sql, clock, { ...base, startsAt: localTime(DAY, 480) })).rejects.toMatchObject({ code: "slot_closed" });
    await expect(holdSlot(sql, clock, { ...base, startsAt: localTime("2026-09-14", 660) })).rejects.toMatchObject({ code: "slot_past" });
    await expect(holdSlot(sql, clock, { ...base, startsAt: localTime("2026-11-10", 600) })).rejects.toMatchObject({ code: "beyond_horizon" });
  });

  it("врач, не оказывающий услугу, — doctor_mismatch; без согласий — consent_missing", async () => {
    const s = await seedClinic(sql);
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.deviceId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds })).rejects.toMatchObject({ code: "doctor_mismatch" });
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: [s.consentIds[0]] })).rejects.toMatchObject({ code: "consent_missing" });
  });

  it("один пациент не может держать две записи на пересекающееся время", async () => {
    const s = await seedClinic(sql);
    const [doc2] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Петров П. П.', 'терапевт') returning id`;
    await sql`insert into service_resources (service_id, resource_id) values (${s.consultId}, ${doc2!.id})`;
    await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: doc2!.id, startsAt: localTime(DAY, 615), patient, consentIds: s.consentIds })).rejects.toMatchObject({ code: "duplicate_booking" });
  });

  it("повторный пациент по телефону и дате рождения не дублируется, имя и почта обновляются", async () => {
    const s = await seedClinic(sql);
    await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 900), patient: { ...patient, email: "new@example.com" }, consentIds: s.consentIds });
    const rows = await sql<{ email: string }[]>`select email from patients`;
    expect(rows).toEqual([{ email: "new@example.com" }]);
  });

  it("при паузе онлайн-записи сайт получает online_paused, администратор — нет", async () => {
    const s = await seedClinic(sql);
    await sql`update settings set online_booking_paused = true where id = 1`;
    const input = { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds };
    await expect(holdSlot(sql, clock, input)).rejects.toMatchObject({ code: "online_paused" });
    await expect(holdSlot(sql, clock, { ...input, source: "admin" })).resolves.toBeTruthy();
  });

  it("UsecaseError — это Error с кодом", () => {
    const e = new UsecaseError("not_found", "нет");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("not_found");
  });
});
```

- [ ] **Step 3: Run** `pnpm test:db tests/db/hold.test.ts` — Expected: FAIL, модуля нет.

- [ ] **Step 4: Реализация** — `src/lib/usecases/hold.ts`:

```ts
// Удержание слота: одна транзакция — пациент, запись held, ресурсы, согласия.
// Двойную продажу отбивает исключающее ограничение базы; код лишь переводит
// её в понятную ошибку.
import { nanoid } from "nanoid";
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { localDay, localTime, addMinutes } from "@/domain/time";
import { isSlotFree, type Rule, type ScheduleException, type Busy } from "@/domain/slots";
import { holdUntil as computeHoldUntil } from "@/domain/cancel";
import { UsecaseError, isExclusionViolation } from "./errors";
import { loadSettings, type Settings } from "./settings";

export type HoldInput = {
  serviceId: number; doctorId: number; startsAt: Date;
  patient: { fullName: string; birthDate: string; phone: string; email: string };
  booker?: { relation: "child" | "relative"; name: string; phone: string; email: string };
  consentIds: number[]; ip?: string; userAgent?: string; source?: "site" | "admin";
};
export type HoldResult = { bookingId: number; token: string; holdUntil: Date; endsAt: Date; prepayKopecks: number };

export type ServiceRow = { id: number; title: string; kind: string; durationMin: number; priceKopecks: number; prepayKopecks: number; prepNote: string | null; active: boolean };
export type SlotContext = { service: ServiceRow; resourceIds: number[]; rules: Rule[]; exceptions: ScheduleException[]; busy: Busy[] };

/** Услуга, её ресурсы для выбранного врача, правила, исключения и занятость на день. */
export async function loadSlotContext(sql: Sql, input: { serviceId: number; doctorId: number; day: string }): Promise<SlotContext> {
  const [service] = await sql<ServiceRow[]>`select id, title, kind, duration_min, price_kopecks, prepay_kopecks, prep_note, active from services where id = ${input.serviceId}`;
  if (!service) throw new UsecaseError("not_found", "услуга не найдена");
  if (!service.active) throw new UsecaseError("service_inactive", "услуга не оказывается");
  const linked = await sql<{ resourceId: number; kind: string; active: boolean }[]>`select r.id as resource_id, r.kind, r.active
    from service_resources sr join resources r on r.id = sr.resource_id where sr.service_id = ${service.id}`;
  const doctor = linked.find(r => r.resourceId === input.doctorId && r.kind === "doctor" && r.active);
  if (!doctor) throw new UsecaseError("doctor_mismatch", "врач не оказывает эту услугу");
  const resourceIds = [input.doctorId, ...linked.filter(r => r.kind !== "doctor" && r.active).map(r => r.resourceId)];
  const rules = await sql<Rule[]>`select resource_id, weekday, from_min, to_min from schedule_rules where resource_id in ${sql(resourceIds)}`;
  const exceptionsRaw = await sql<{ resourceId: number; day: string; kind: "off" | "extra"; fromMin: number | null; toMin: number | null }[]>`
    select resource_id, to_char(day, 'YYYY-MM-DD') as day, kind, from_min, to_min from schedule_exceptions where resource_id in ${sql(resourceIds)} and day = ${input.day}`;
  const dayStart = localTime(input.day, 0);
  const dayEnd = localTime(input.day, 24 * 60);
  const busy = await sql<Busy[]>`select resource_id, starts_at, ends_at from booking_resources
    where active and resource_id in ${sql(resourceIds)} and starts_at < ${dayEnd} and ends_at > ${dayStart}`;
  return { service, resourceIds, rules, exceptions: exceptionsRaw, busy };
}

export function slotSettings(s: Settings) {
  return { stepMin: s.slotStepMin, leadMinutes: s.leadMinutes, horizonDays: s.horizonDays };
}

export async function holdSlot(sql: Sql, clock: Clock, input: HoldInput): Promise<HoldResult> {
  const now = clock.now();
  const settings = await loadSettings(sql);
  if (settings.onlineBookingPaused && (input.source ?? "site") === "site") {
    throw new UsecaseError("online_paused", "онлайн-запись приостановлена");
  }
  const day = localDay(input.startsAt);
  const ctx = await loadSlotContext(sql, { serviceId: input.serviceId, doctorId: input.doctorId, day });
  const check = isSlotFree({ ...ctx, resourceIds: ctx.resourceIds, durationMin: ctx.service.durationMin, startsAt: input.startsAt, now, settings: slotSettings(settings) });
  if (!check.ok) {
    const code = ({ closed: "slot_closed", past: "slot_past", beyond_horizon: "beyond_horizon", taken: "slot_taken" } as const)[check.reason];
    throw new UsecaseError(code, "окно недоступно");
  }
  const consents = await sql<{ id: number; kind: string }[]>`select id, kind from consents where id in ${sql(input.consentIds.length ? input.consentIds : [0])}`;
  const kinds = new Set(consents.map(c => c.kind));
  if (!kinds.has("personal_data") || !kinds.has("prepay_terms")) throw new UsecaseError("consent_missing", "нужны оба согласия");

  const endsAt = addMinutes(input.startsAt, ctx.service.durationMin);
  const holdUntil = computeHoldUntil({ now, startsAt: input.startsAt, settings: { holdMinutes: settings.holdMinutes, leadMinutes: settings.leadMinutes } });
  const token = nanoid(21);
  const snapshot = { title: ctx.service.title, kind: ctx.service.kind, durationMin: ctx.service.durationMin, priceKopecks: ctx.service.priceKopecks, prepayKopecks: ctx.service.prepayKopecks };

  try {
    const bookingId = await sql.begin(async tx => {
      const [p] = await tx<{ id: number }[]>`insert into patients (full_name, birth_date, phone, email)
        values (${input.patient.fullName}, ${input.patient.birthDate}, ${input.patient.phone}, ${input.patient.email})
        on conflict (phone, birth_date) do update set full_name = excluded.full_name, email = excluded.email returning id`;
      const dup = await tx`select 1 from bookings where patient_id = ${p!.id} and status in ('held', 'confirmed')
        and starts_at < ${endsAt} and ends_at > ${input.startsAt} limit 1`;
      if (dup.length > 0) throw new UsecaseError("duplicate_booking", "у пациента уже есть запись на это время");
      const [b] = await tx<{ id: number }[]>`insert into bookings (token, patient_id, service_id, service, resource_id, starts_at, ends_at, status, hold_until, source,
          booker_relation, booker_name, booker_phone, booker_email)
        values (${token}, ${p!.id}, ${ctx.service.id}, ${tx.json(snapshot)}, ${input.doctorId}, ${input.startsAt}, ${endsAt}, 'held', ${holdUntil}, ${input.source ?? "site"},
          ${input.booker?.relation ?? "self"}, ${input.booker?.name ?? null}, ${input.booker?.phone ?? null}, ${input.booker?.email ?? null}) returning id`;
      for (const rid of ctx.resourceIds) {
        await tx`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b!.id}, ${rid}, ${input.startsAt}, ${endsAt})`;
      }
      for (const c of consents) {
        await tx`insert into booking_consents (booking_id, consent_id, ip, user_agent) values (${b!.id}, ${c.id}, ${input.ip ?? null}, ${input.userAgent ?? null})`;
      }
      return b!.id;
    });
    return { bookingId, token, holdUntil, endsAt, prepayKopecks: ctx.service.prepayKopecks };
  } catch (e) {
    if (isExclusionViolation(e)) throw new UsecaseError("slot_taken", "окно только что заняли");
    throw e;
  }
}
```

- [ ] **Step 5: Run** `pnpm test:db tests/db/hold.test.ts` — Expected: PASS, 9 тестов. Частые причины падений: `tx.json` для jsonb; `in ${sql(array)}` для списка; строки с датами — `Date`, не строка.

- [ ] **Step 6: Commit**

```bash
git add src/lib/usecases/errors.ts src/lib/usecases/settings.ts src/lib/usecases/hold.ts tests/db/hold.test.ts
git commit -m "Сценарий: удержание слота с пациентом, ресурсами и согласиями"
```

---

### Task 10: Создание платежа и уведомление об оплате

**Files:**
- Create: `src/lib/usecases/payment.ts`
- Test: `tests/db/payment.test.ts`

**Interfaces:**
- Consumes: `PaymentProvider`, `PaymentNotification` (Task 7); `transition` (Task 4); `canAppend` (Task 6); `UsecaseError`, `loadSettings`.
- Produces: `createPayment(sql, deps: { payment: PaymentProvider; clock: Clock }, input: { token: string; returnUrl: string }): Promise<{ paymentId: number; payUrl: string }>`; `applyPaymentNotification(sql, clock, input: { provider: string; notification: PaymentNotification }): Promise<{ outcome: "confirmed"|"already"|"failed"|"amount_mismatch"|"unknown"|"paid_after_expiry" }>`; `ledgerRows(sql, bookingId): Promise<LedgerRow[]>`.

- [ ] **Step 1: Тест** — `tests/db/payment.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") };
const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };

async function heldBooking() {
  const s = await seedClinic(sql);
  return holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 600), patient, consentIds: s.consentIds });
}

describe("createPayment", () => {
  it("создаёт платёж на сумму предоплаты и отдаёт ссылку; повтор возвращает ту же", async () => {
    const h = await heldBooking();
    const r1 = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    expect(r1.payUrl).toContain("fake-");
    const r2 = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    expect(r2.paymentId).toBe(r1.paymentId);
    const [p] = await sql<{ amountKopecks: number; status: string; externalId: string }[]>`select amount_kopecks, status, external_id from payments`;
    expect(p).toMatchObject({ amountKopecks: 40000, status: "created", externalId: `fake-${r1.paymentId}` });
  });
  it("после истечения удержания платёж не создаётся", async () => {
    const h = await heldBooking();
    const late = { now: () => new Date("2026-09-14T06:20:00Z") };
    await expect(createPayment(sql, { payment, clock: late }, { token: h.token, returnUrl: "http://x/r" })).rejects.toMatchObject({ code: "bad_status" });
  });
});

describe("applyPaymentNotification", () => {
  it("подтверждает запись, пишет аванс, чек и письмо; повтор ничего не меняет", async () => {
    const h = await heldBooking();
    const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    const n = { externalId: `fake-${paymentId}`, status: "paid" as const, amountKopecks: 40000, raw: {} };
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: n })).toEqual({ outcome: "confirmed" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: n })).toEqual({ outcome: "already" });
    const [b] = await sql<{ status: string; paidAt: Date | null; holdUntil: Date | null }[]>`select status, paid_at, hold_until from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("confirmed");
    expect(b!.paidAt?.toISOString()).toBe("2026-09-14T06:00:00.000Z");
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }]);
    const receipts = await sql`select kind, status, email from receipts where booking_id = ${h.bookingId}`;
    expect(receipts).toEqual([{ kind: "advance", status: "pending", email: "ivanov@example.com" }]);
    const mails = await sql`select template, status from notifications where booking_id = ${h.bookingId}`;
    expect(mails).toEqual([{ template: "booking_confirmed", status: "queued" }]);
  });
  it("сумма не сошлась — не зачисляем; неизвестный платёж — unknown; failed — платёж failed", async () => {
    const h = await heldBooking();
    const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 39900, raw: {} } })).toEqual({ outcome: "amount_mismatch" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: "fake-999", status: "paid", amountKopecks: 40000, raw: {} } })).toEqual({ outcome: "unknown" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "failed", amountKopecks: 40000, raw: {} } })).toEqual({ outcome: "failed" });
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("held");
  });
  it("оплата после истечения: платёж paid, аванс записан, запись не восстанавливается", async () => {
    const h = await heldBooking();
    const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    await sql`update bookings set status = 'expired', hold_until = null where id = ${h.bookingId}`;
    await sql`update booking_resources set active = false where booking_id = ${h.bookingId}`;
    const r = await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
    expect(r).toEqual({ outcome: "paid_after_expiry" });
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }]);
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("expired");
  });
});
```

- [ ] **Step 2: Run** `pnpm test:db tests/db/payment.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/lib/usecases/payment.ts`:

```ts
// Платёж: строка payments создаётся до обращения к провайдеру, зачисление —
// только по уведомлению. Повтор уведомления безвреден (12-design-v1.md, 11).
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider, PaymentNotification } from "@/ports/payment";
import { transition, type BookingStatus } from "@/domain/transitions";
import { canAppend, type LedgerRow } from "@/domain/money";
import { UsecaseError } from "./errors";

export async function ledgerRows(sql: Sql, bookingId: number): Promise<LedgerRow[]> {
  return sql<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${bookingId} order by id`;
}

export async function createPayment(sql: Sql, deps: { payment: PaymentProvider; clock: Clock }, input: { token: string; returnUrl: string }): Promise<{ paymentId: number; payUrl: string }> {
  const now = deps.clock.now();
  const [b] = await sql<{ id: number; status: BookingStatus; holdUntil: Date | null; service: { title: string; prepayKopecks: number }; email: string }[]>`
    select b.id, b.status, b.hold_until, b.service, p.email from bookings b join patients p on p.id = b.patient_id where b.token = ${input.token}`;
  if (!b) throw new UsecaseError("not_found", "запись не найдена");
  if (b.status !== "held" || !b.holdUntil || b.holdUntil <= now) throw new UsecaseError("bad_status", "срок удержания истёк или запись уже не ждёт оплаты");
  const [existing] = await sql<{ id: number; payUrl: string | null }[]>`select id, pay_url from payments where booking_id = ${b.id} and status = 'created' and pay_url is not null order by id desc limit 1`;
  if (existing?.payUrl) return { paymentId: existing.id, payUrl: existing.payUrl };
  const amount = b.service.prepayKopecks;
  const [row] = await sql<{ id: number }[]>`insert into payments (booking_id, provider, amount_kopecks) values (${b.id}, ${deps.payment.name}, ${amount}) returning id`;
  try {
    const created = await deps.payment.createPayment({ paymentId: row!.id, amountKopecks: amount, description: `Предоплата: ${b.service.title}`, returnUrl: input.returnUrl, email: b.email });
    await sql`update payments set external_id = ${created.externalId}, pay_url = ${created.payUrl} where id = ${row!.id}`;
    return { paymentId: row!.id, payUrl: created.payUrl };
  } catch (e) {
    await sql`update payments set status = 'failed' where id = ${row!.id} and status = 'created'`;
    throw e;
  }
}

export type NotificationOutcome = "confirmed" | "already" | "failed" | "amount_mismatch" | "unknown" | "paid_after_expiry";

export async function applyPaymentNotification(sql: Sql, clock: Clock, input: { provider: string; notification: PaymentNotification }): Promise<{ outcome: NotificationOutcome }> {
  const now = clock.now();
  const n = input.notification;
  return sql.begin(async tx => {
    const [p] = await tx<{ id: number; bookingId: number; amountKopecks: number; status: string }[]>`
      select id, booking_id, amount_kopecks, status from payments where provider = ${input.provider} and external_id = ${n.externalId} for update`;
    if (!p) return { outcome: "unknown" as const };
    if (p.status === "paid") return { outcome: "already" as const };
    if (n.status === "failed") {
      await tx`update payments set status = 'failed', raw = ${tx.json(n.raw as never)} where id = ${p.id}`;
      return { outcome: "failed" as const };
    }
    if (n.amountKopecks !== p.amountKopecks) return { outcome: "amount_mismatch" as const };
    await tx`update payments set status = 'paid', paid_at = ${now}, raw = ${tx.json(n.raw as never)} where id = ${p.id}`;
    const [b] = await tx<{ id: number; status: BookingStatus; service: { title: string }; email: string }[]>`
      select b.id, b.status, b.service, pt.email from bookings b join patients pt on pt.id = b.patient_id where b.id = ${p.bookingId} for update`;
    const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b!.id} order by id`;
    const adv: LedgerRow = { kind: "advance", amountKopecks: p.amountKopecks };
    const ok = canAppend(rows, adv);
    if (!ok.ok) throw new Error(`журнал записи ${b!.id}: ${ok.reason}`);
    const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, payment_id) values (${b!.id}, 'advance', ${p.amountKopecks}, ${p.id}) returning id`;
    await tx`insert into receipts (booking_id, kind, ledger_id, amount_kopecks, email) values (${b!.id}, 'advance', ${l!.id}, ${p.amountKopecks}, ${b!.email})`;
    const t = transition(b!.status, "pay", "system");
    if (!t.ok) return { outcome: "paid_after_expiry" as const };
    await tx`update bookings set status = ${t.status}, paid_at = ${now}, hold_until = null where id = ${b!.id}`;
    await tx`insert into notifications (booking_id, recipient, template, payload) values (${b!.id}, ${b!.email}, 'booking_confirmed', ${tx.json({ title: b!.service.title })})`;
    return { outcome: "confirmed" as const };
  });
}
```

- [ ] **Step 4: Run** `pnpm test:db tests/db/payment.test.ts` — Expected: PASS, 5 тестов.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usecases/payment.ts tests/db/payment.test.ts
git commit -m "Сценарий: создание платежа и идемпотентное уведомление об оплате"
```

---

### Task 11: Отмена пациентом и клиникой, исполнение возврата

**Files:**
- Create: `src/lib/usecases/cancel.ts`
- Test: `tests/db/cancel.test.ts`

**Interfaces:**
- Consumes: `cancelOutcome`, `hoursBefore` (Task 5); `transition` (Task 4); `canAppend`, `balanceKopecks` (Task 6); `ledgerRows` (Task 10); `PaymentProvider.refund`.
- Produces: `cancelBooking(sql, clock, input: { token?: string; bookingId?: number; actor: "patient"|"clinic"; reason?: string }): Promise<{ outcome: CancelOutcome; refundId: number | null }>`; `executeRefund(sql, payment: PaymentProvider, refundId: number): Promise<{ ok: boolean }>`; `findBooking(sql, { token?, bookingId? }, forUpdate?)`.

Правило: при отмене запись закрывается сразу, ресурсы освобождаются. Возврат — строка `refunds.pending`; деньги и `ledger.refund` появляются в `executeRefund`, когда провайдер подтвердил. Удержание — `ledger.retain` сразу.

- [ ] **Step 1: Тест** — `tests/db/cancel.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { cancelBooking, executeRefund } from "@/lib/usecases/cancel";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const START = localTime("2026-09-17", 600); // чт 10:00 местного = 05:00Z
const at = (iso: string) => ({ now: () => new Date(iso) });

async function paidBooking(clock = at("2026-09-14T06:00:00Z")) {
  const s = await seedClinic(sql);
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return h;
}

describe("cancelBooking", () => {
  it("до порога: запись отменена, ресурсы свободны, возврат в работе; executeRefund пишет ledger и чек", async () => {
    const h = await paidBooking();
    const r = await cancelBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient" });
    expect(r.outcome).toEqual({ kind: "refund", reason: "before_threshold" });
    const [b] = await sql<{ status: string; cancelledBy: string; hoursBeforeCancel: string }[]>`select status, cancelled_by, hours_before_cancel from bookings where id = ${h.bookingId}`;
    expect(b).toMatchObject({ status: "cancelled", cancelledBy: "patient", hoursBeforeCancel: "48.00" });
    const active = await sql`select 1 from booking_resources where booking_id = ${h.bookingId} and active`;
    expect(active).toHaveLength(0);
    const [rf] = await sql<{ status: string; amountKopecks: number }[]>`select status, amount_kopecks from refunds where id = ${r.refundId}`;
    expect(rf).toEqual({ status: "pending", amountKopecks: 40000 });
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }]);

    expect(await executeRefund(sql, payment, r.refundId!)).toEqual({ ok: true });
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "refund", amountKopecks: 40000 }]);
    const receipts = await sql<{ kind: string }[]>`select kind from receipts where booking_id = ${h.bookingId} order by id`;
    expect(receipts.map(x => x.kind)).toEqual(["advance", "refund"]);
    const [rf2] = await sql<{ status: string; externalId: string }[]>`select status, external_id from refunds where id = ${r.refundId}`;
    expect(rf2).toMatchObject({ status: "done", externalId: `refund-fake-${1}` });
    expect(await executeRefund(sql, payment, r.refundId!)).toEqual({ ok: true }); // повтор ничего не дублирует
    expect(await ledgerRows(sql, h.bookingId)).toHaveLength(2);
  });

  it("после порога: удержание в журнале, возврата нет, письмо в очереди", async () => {
    const h = await paidBooking();
    const r = await cancelBooking(sql, at("2026-09-16T20:00:00Z"), { token: h.token, actor: "patient" });
    expect(r.outcome).toEqual({ kind: "retain", reason: "after_threshold" });
    expect(r.refundId).toBeNull();
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "retain", amountKopecks: 40000 }]);
    const mails = await sql<{ template: string }[]>`select template from notifications where booking_id = ${h.bookingId} order by id`;
    expect(mails.map(m => m.template)).toEqual(["booking_confirmed", "booking_cancelled_retained"]);
  });

  it("клиника отменяет впритык — всё равно возврат", async () => {
    const h = await paidBooking();
    const r = await cancelBooking(sql, at("2026-09-17T04:00:00Z"), { bookingId: h.bookingId, actor: "clinic", reason: "врач заболел" });
    expect(r.outcome).toEqual({ kind: "refund", reason: "by_clinic" });
    const [b] = await sql<{ cancelReason: string; cancelledBy: string }[]>`select cancel_reason, cancelled_by from bookings where id = ${h.bookingId}`;
    expect(b).toEqual({ cancelReason: "врач заболел", cancelledBy: "clinic" });
  });

  it("неоплаченное удержание отменяется без денег; второй раз — bad_status", async () => {
    const s = await seedClinic(sql);
    const h = await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
    const r = await cancelBooking(sql, at("2026-09-14T06:05:00Z"), { token: h.token, actor: "patient" });
    expect(r.outcome).toEqual({ kind: "none", reason: "not_paid" });
    await expect(cancelBooking(sql, at("2026-09-14T06:06:00Z"), { token: h.token, actor: "patient" })).rejects.toMatchObject({ code: "bad_status" });
  });
});
```

- [ ] **Step 2: Run** `pnpm test:db tests/db/cancel.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/lib/usecases/cancel.ts`:

```ts
// Отмена: статус и ресурсы — сразу, в транзакции. Деньги: удержание пишется
// сразу, возврат — строкой refunds, а ledger.refund появляется после ответа
// провайдера в executeRefund (вызывает фоновая задача или администратор).
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider } from "@/ports/payment";
import { transition, type BookingStatus } from "@/domain/transitions";
import { cancelOutcome, hoursBefore, type CancelOutcome } from "@/domain/cancel";
import { canAppend, balanceKopecks, type LedgerRow } from "@/domain/money";
import { UsecaseError } from "./errors";
import { loadSettings } from "./settings";

export type BookingRow = {
  id: number; token: string; patientId: number; status: BookingStatus; startsAt: Date; endsAt: Date;
  paidAt: Date | null; resourceId: number; serviceId: number;
  service: { title: string; durationMin: number; prepayKopecks: number }; email: string;
};

export async function findBooking(sql: Sql, ref: { token?: string; bookingId?: number }, forUpdate = false): Promise<BookingRow> {
  const where = ref.token != null ? sql`b.token = ${ref.token}` : sql`b.id = ${ref.bookingId ?? 0}`;
  const rows = await sql<BookingRow[]>`select b.id, b.token, b.patient_id, b.status, b.starts_at, b.ends_at, b.paid_at, b.resource_id, b.service_id, b.service, p.email
    from bookings b join patients p on p.id = b.patient_id where ${where} ${forUpdate ? sql`for update of b` : sql``}`;
  const b = rows[0];
  if (!b) throw new UsecaseError("not_found", "запись не найдена");
  return b;
}

export async function cancelBooking(sql: Sql, clock: Clock, input: { token?: string; bookingId?: number; actor: "patient" | "clinic"; reason?: string }): Promise<{ outcome: CancelOutcome; refundId: number | null }> {
  const now = clock.now();
  const settings = await loadSettings(sql);
  return sql.begin(async tx => {
    const b = await findBooking(tx, input, true);
    const t = transition(b.status, "cancel", input.actor);
    if (!t.ok) throw new UsecaseError("bad_status", t.reason);
    const outcome = cancelOutcome({ now, startsAt: b.startsAt, paidAt: b.paidAt, actor: input.actor, settings });
    await tx`update bookings set status = 'cancelled', cancelled_by = ${input.actor}, cancelled_at = ${now}, cancel_reason = ${input.reason ?? null},
      hours_before_cancel = ${hoursBefore(now, b.startsAt).toFixed(2)}, hold_until = null where id = ${b.id}`;
    await tx`update booking_resources set active = false where booking_id = ${b.id}`;
    await tx`update payments set status = 'expired' where booking_id = ${b.id} and status = 'created'`;
    let refundId: number | null = null;
    if (outcome.kind === "refund") {
      const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
      const amount = balanceKopecks(rows);
      const [pay] = await tx<{ id: number }[]>`select id from payments where booking_id = ${b.id} and status = 'paid' order by id desc limit 1`;
      if (amount > 0 && pay) {
        const [r] = await tx<{ id: number }[]>`insert into refunds (booking_id, payment_id, amount_kopecks) values (${b.id}, ${pay.id}, ${amount}) returning id`;
        refundId = r!.id;
      }
      await tx`insert into notifications (booking_id, recipient, template, payload) values (${b.id}, ${b.email}, 'booking_cancelled_refund', ${tx.json({ title: b.service.title, reason: outcome.reason })})`;
    } else if (outcome.kind === "retain") {
      const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
      const amount = balanceKopecks(rows);
      const ok = canAppend(rows, { kind: "retain", amountKopecks: amount });
      if (!ok.ok) throw new Error(`журнал записи ${b.id}: ${ok.reason}`);
      await tx`insert into ledger (booking_id, kind, amount_kopecks, note) values (${b.id}, 'retain', ${amount}, 'отмена позже порога')`;
      await tx`insert into notifications (booking_id, recipient, template, payload) values (${b.id}, ${b.email}, 'booking_cancelled_retained', ${tx.json({ title: b.service.title })})`;
    } else {
      await tx`insert into notifications (booking_id, recipient, template, payload) values (${b.id}, ${b.email}, 'booking_cancelled_unpaid', ${tx.json({ title: b.service.title })})`;
    }
    return { outcome, refundId };
  });
}

/** Исполнить возврат у провайдера; при успехе — ledger.refund и чек возврата. Повтор безвреден. */
export async function executeRefund(sql: Sql, payment: PaymentProvider, refundId: number): Promise<{ ok: boolean }> {
  const [r] = await sql<{ id: number; bookingId: number; paymentId: number; amountKopecks: number; status: string; externalId: string | null; email: string }[]>`
    select r.id, r.booking_id, r.payment_id, r.amount_kopecks, r.status, p.external_id, pt.email
    from refunds r join payments p on p.id = r.payment_id join bookings b on b.id = r.booking_id join patients pt on pt.id = b.patient_id where r.id = ${refundId}`;
  if (!r) throw new UsecaseError("not_found", "возврат не найден");
  if (r.status === "done") return { ok: true };
  const res = await payment.refund(r.externalId ?? "", r.amountKopecks);
  if (!res.ok) {
    await sql`update refunds set status = 'failed', attempts = attempts + 1, last_error = ${res.error} where id = ${r.id}`;
    return { ok: false };
  }
  await sql.begin(async tx => {
    const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${r.bookingId} order by id`;
    const ok = canAppend(rows, { kind: "refund", amountKopecks: r.amountKopecks });
    if (!ok.ok) throw new Error(`журнал записи ${r.bookingId}: ${ok.reason}`);
    const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, payment_id) values (${r.bookingId}, 'refund', ${r.amountKopecks}, ${r.paymentId}) returning id`;
    await tx`insert into receipts (booking_id, kind, ledger_id, amount_kopecks, email) values (${r.bookingId}, 'refund', ${l!.id}, ${r.amountKopecks}, ${r.email})`;
    await tx`update refunds set status = 'done', external_id = ${res.refundId}, attempts = attempts + 1 where id = ${r.id}`;
  });
  return { ok: true };
}
```

- [ ] **Step 4: Run** `pnpm test:db tests/db/cancel.test.ts` — Expected: PASS, 4 теста. `numeric` из базы приходит строкой, поэтому `"48.00"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usecases/cancel.ts tests/db/cancel.test.ts
git commit -m "Сценарий: отмена с порогом, удержание и исполнение возврата"
```

---

### Task 12: Перенос

**Files:**
- Create: `src/lib/usecases/transfer.ts`
- Test: `tests/db/transfer.test.ts`

**Interfaces:**
- Consumes: `findBooking` (Task 11), `loadSlotContext`, `slotSettings` (Task 9), `canTransfer` (Task 5), `isSlotFree`, `transition`, `canAppend`, `balanceKopecks`.
- Produces: `transferBooking(sql, clock, input: { token?: string; bookingId?: number; actor: "patient"|"clinic"; doctorId: number; startsAt: Date }): Promise<{ newBookingId: number; newToken: string }>`.

- [ ] **Step 1: Тест** — `tests/db/transfer.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { transferBooking } from "@/lib/usecases/transfer";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });
const START = localTime("2026-09-17", 600);

async function paid() {
  const s = await seedClinic(sql);
  const clock = at("2026-09-14T06:00:00Z");
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return { s, h };
}

describe("transferBooking", () => {
  it("до порога: старая закрыта, новая подтверждена, деньги переехали, согласия скопированы", async () => {
    const { s, h } = await paid();
    const r = await transferBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) });
    expect(r.newBookingId).not.toBe(h.bookingId);
    const [oldB] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    const [newB] = await sql<{ status: string; paidAt: Date | null; transferredFromId: number }[]>`select status, paid_at, transferred_from_id from bookings where id = ${r.newBookingId}`;
    expect(oldB!.status).toBe("transferred");
    expect(newB).toMatchObject({ status: "confirmed", transferredFromId: h.bookingId });
    expect(newB!.paidAt).not.toBeNull();
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "transfer_out", amountKopecks: 40000 }]);
    expect(await ledgerRows(sql, r.newBookingId)).toEqual([{ kind: "transfer_in", amountKopecks: 40000 }]);
    const oldActive = await sql`select 1 from booking_resources where booking_id = ${h.bookingId} and active`;
    expect(oldActive).toHaveLength(0);
    const cons = await sql`select 1 from booking_consents where booking_id = ${r.newBookingId}`;
    expect(cons).toHaveLength(2);
    const pays = await sql`select 1 from payments`;
    expect(pays).toHaveLength(1); // нового платежа нет
  });

  it("пациент после порога — transfer_not_allowed; клиника может", async () => {
    const { s, h } = await paid();
    await expect(transferBooking(sql, at("2026-09-16T20:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) })).rejects.toMatchObject({ code: "transfer_not_allowed" });
    await expect(transferBooking(sql, at("2026-09-16T20:00:00Z"), { token: h.token, actor: "clinic", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) })).resolves.toBeTruthy();
  });

  it("на занятое окно — slot_taken, старая запись не тронута", async () => {
    const { s, h } = await paid();
    const other = { ...patient, phone: "+79000000002" };
    await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900), patient: other, consentIds: s.consentIds });
    await expect(transferBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) })).rejects.toMatchObject({ code: "slot_taken" });
    const [oldB] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(oldB!.status).toBe("confirmed");
  });
});
```

- [ ] **Step 2: Run** `pnpm test:db tests/db/transfer.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/lib/usecases/transfer.ts`:

```ts
// Перенос — не отмена: старая запись закрывается, новая создаётся сразу
// подтверждённой, предоплата переезжает без нового платежа и чека.
import { nanoid } from "nanoid";
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { localDay, addMinutes } from "@/domain/time";
import { isSlotFree } from "@/domain/slots";
import { transition } from "@/domain/transitions";
import { canTransfer } from "@/domain/cancel";
import { canAppend, balanceKopecks, type LedgerRow } from "@/domain/money";
import { UsecaseError, isExclusionViolation } from "./errors";
import { loadSettings } from "./settings";
import { loadSlotContext, slotSettings } from "./hold";
import { findBooking } from "./cancel";

export async function transferBooking(sql: Sql, clock: Clock, input: { token?: string; bookingId?: number; actor: "patient" | "clinic"; doctorId: number; startsAt: Date }): Promise<{ newBookingId: number; newToken: string }> {
  const now = clock.now();
  const settings = await loadSettings(sql);
  try {
    return await sql.begin(async tx => {
      const old = await findBooking(tx, input, true);
      const t = transition(old.status, "transfer", input.actor);
      if (!t.ok) throw new UsecaseError("bad_status", t.reason);
      if (!canTransfer({ now, startsAt: old.startsAt, actor: input.actor, settings })) throw new UsecaseError("transfer_not_allowed", "перенос позже порога — через клинику");
      // Сначала освобождаем ресурсы старой записи, потом считаем занятость:
      // перенос на соседнее окно того же врача допустим. Если окно занято,
      // транзакция откатится и старая запись останется как была.
      await tx`update bookings set status = 'transferred', hold_until = null where id = ${old.id}`;
      await tx`update booking_resources set active = false where booking_id = ${old.id}`;
      const ctx = await loadSlotContext(tx, { serviceId: old.serviceId, doctorId: input.doctorId, day: localDay(input.startsAt) });
      const check = isSlotFree({ ...ctx, durationMin: ctx.service.durationMin, startsAt: input.startsAt, now, settings: slotSettings(settings) });
      if (!check.ok) {
        const code = ({ closed: "slot_closed", past: "slot_past", beyond_horizon: "beyond_horizon", taken: "slot_taken" } as const)[check.reason];
        throw new UsecaseError(code, "окно недоступно");
      }
      const endsAt = addMinutes(input.startsAt, ctx.service.durationMin);
      const token = nanoid(21);
      const [nb] = await tx<{ id: number }[]>`insert into bookings (token, patient_id, service_id, service, resource_id, starts_at, ends_at, status, paid_at, transferred_from_id, source,
          booker_relation, booker_name, booker_phone, booker_email)
        select ${token}, patient_id, service_id, service, ${input.doctorId}, ${input.startsAt}, ${endsAt}, 'confirmed', paid_at, id, source,
          booker_relation, booker_name, booker_phone, booker_email from bookings where id = ${old.id} returning id`;
      for (const rid of ctx.resourceIds) {
        await tx`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${nb!.id}, ${rid}, ${input.startsAt}, ${endsAt})`;
      }
      await tx`insert into booking_consents (booking_id, consent_id, accepted_at, ip, user_agent) select ${nb!.id}, consent_id, accepted_at, ip, user_agent from booking_consents where booking_id = ${old.id}`;
      const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${old.id} order by id`;
      const amount = balanceKopecks(rows);
      if (amount > 0) {
        const out = canAppend(rows, { kind: "transfer_out", amountKopecks: amount });
        if (!out.ok) throw new Error(`журнал записи ${old.id}: ${out.reason}`);
        await tx`insert into ledger (booking_id, kind, amount_kopecks, note) values (${old.id}, 'transfer_out', ${amount}, ${`перенос в запись ${nb!.id}`})`;
        await tx`insert into ledger (booking_id, kind, amount_kopecks, note) values (${nb!.id}, 'transfer_in', ${amount}, ${`перенос из записи ${old.id}`})`;
      }
      await tx`insert into notifications (booking_id, recipient, template, payload) values (${nb!.id}, ${old.email}, 'booking_transferred', ${tx.json({ title: old.service.title })})`;
      return { newBookingId: nb!.id, newToken: token };
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new UsecaseError("slot_taken", "окно только что заняли");
    throw e;
  }
}
```

- [ ] **Step 4: Run** `pnpm test:db tests/db/transfer.test.ts` — Expected: PASS, 3 теста.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usecases/transfer.ts tests/db/transfer.test.ts
git commit -m "Сценарий: перенос записи с переездом предоплаты"
```

---

### Task 13: Истечение удержаний

**Files:**
- Create: `src/lib/usecases/expire.ts`
- Test: `tests/db/expire.test.ts`

**Interfaces:**
- Produces: `expireHolds(sql, clock): Promise<number>` — сколько записей снято.

- [ ] **Step 1: Тест** — `tests/db/expire.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment } from "@/lib/usecases/payment";
import { expireHolds } from "@/lib/usecases/expire";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });

describe("expireHolds", () => {
  it("снимает просроченные удержания, освобождает ресурсы и закрывает платёж; свежие не трогает", async () => {
    const s = await seedClinic(sql);
    const clock = at("2026-09-14T06:00:00Z");
    const stale = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 600), patient, consentIds: s.consentIds });
    await createPayment(sql, { payment, clock }, { token: stale.token, returnUrl: "http://x/r" });
    const fresh = await holdSlot(sql, at("2026-09-14T06:14:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 900), patient: { ...patient, phone: "+79000000002" }, consentIds: s.consentIds });
    expect(await expireHolds(sql, at("2026-09-14T06:16:00Z"))).toBe(1);
    const rows = await sql<{ id: number; status: string }[]>`select id, status from bookings order by id`;
    expect(rows).toEqual([{ id: stale.bookingId, status: "expired" }, { id: fresh.bookingId, status: "held" }]);
    const active = await sql<{ bookingId: number }[]>`select booking_id from booking_resources where active`;
    expect(active).toEqual([{ bookingId: fresh.bookingId }]);
    const [p] = await sql<{ status: string }[]>`select status from payments`;
    expect(p!.status).toBe("expired");
    // Освобождённое окно можно занять снова.
    await expect(holdSlot(sql, at("2026-09-14T06:16:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 600), patient: { ...patient, phone: "+79000000003" }, consentIds: s.consentIds })).resolves.toBeTruthy();
    expect(await expireHolds(sql, at("2026-09-14T06:16:00Z"))).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `pnpm test:db tests/db/expire.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/lib/usecases/expire.ts`:

```ts
// Просроченные удержания: раз в минуту из фонового процесса. Оплата, пришедшая
// позже, не теряется — её принимает applyPaymentNotification как paid_after_expiry.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";

export async function expireHolds(sql: Sql, clock: Clock): Promise<number> {
  const now = clock.now();
  return sql.begin(async tx => {
    const rows = await tx<{ id: number }[]>`update bookings set status = 'expired', hold_until = null
      where status = 'held' and hold_until < ${now} returning id`;
    if (rows.length === 0) return 0;
    const ids = rows.map(r => r.id);
    await tx`update booking_resources set active = false where booking_id in ${tx(ids)}`;
    await tx`update payments set status = 'expired' where status = 'created' and booking_id in ${tx(ids)}`;
    return ids.length;
  });
}
```

- [ ] **Step 4: Run** `pnpm test:db` — Expected: PASS, все тесты базы. Затем `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — всё зелёное.

- [ ] **Step 5: Commit и PR**

```bash
git add src/lib/usecases/expire.ts tests/db/expire.test.ts
git commit -m "Сценарий: истечение удержаний"
git push -u origin feat/scaffold
gh pr create --title "Ядро v1: каркас, домен, база, сценарии" --body "Каркас Next 16 с CI и PostgreSQL в docker; чистый домен (время, окна, переходы, порог отмены, деньги) с юнит-тестами; миграция схемы v1; сценарии удержания, платежа, отмены, возврата, переноса, истечения и итога приёма с тестами против базы. По плану docs/13-plan-v1-core.md."
```

---

### Task 14: Итог приёма: состоялся или неявка

**Files:**
- Create: `src/lib/usecases/outcome.ts`
- Test: `tests/db/outcome.test.ts`

**Interfaces:**
- Consumes: `findBooking` (Task 11), `transition`, `canAppend`, `balanceKopecks`.
- Produces: `markDone(sql, clock, bookingId): Promise<void>` — `ledger.settle` на остаток и чек зачёта; `markNoShow(sql, clock, bookingId): Promise<void>` — `ledger.retain`.

- [ ] **Step 1: Тест** — `tests/db/outcome.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { markDone, markNoShow } from "@/lib/usecases/outcome";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });

async function paid() {
  const s = await seedClinic(sql);
  const clock = at("2026-09-14T06:00:00Z");
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600), patient, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return { s, h };
}

describe("итог приёма", () => {
  it("состоялся: зачёт аванса и чек зачёта", async () => {
    const { h } = await paid();
    await markDone(sql, at("2026-09-17T05:40:00Z"), h.bookingId);
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("done");
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "settle", amountKopecks: 40000 }]);
    const receipts = await sql<{ kind: string }[]>`select kind from receipts where booking_id = ${h.bookingId} order by id`;
    expect(receipts.map(r => r.kind)).toEqual(["advance", "settle"]);
  });
  it("неявка: удержание без чека; повторно — bad_status", async () => {
    const { h } = await paid();
    await markNoShow(sql, at("2026-09-17T06:00:00Z"), h.bookingId);
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "retain", amountKopecks: 40000 }]);
    await expect(markDone(sql, at("2026-09-17T06:01:00Z"), h.bookingId)).rejects.toMatchObject({ code: "bad_status" });
  });
  it("неоплаченное удержание отметить нельзя", async () => {
    const s = await seedClinic(sql);
    const h = await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600), patient, consentIds: s.consentIds });
    await expect(markDone(sql, at("2026-09-17T06:00:00Z"), h.bookingId)).rejects.toMatchObject({ code: "bad_status" });
  });
});
```

- [ ] **Step 2: Run** `pnpm test:db tests/db/outcome.test.ts` — Expected: FAIL.

- [ ] **Step 3: Реализация** — `src/lib/usecases/outcome.ts`:

```ts
// Итог приёма ставит администратор. done — зачёт аванса и чек зачёта;
// no_show — удержание, дальше деньги учитывает клиника (09, часть 3).
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { transition } from "@/domain/transitions";
import { canAppend, balanceKopecks, type LedgerRow } from "@/domain/money";
import { UsecaseError } from "./errors";
import { findBooking } from "./cancel";

async function close(sql: Sql, clock: Clock, bookingId: number, event: "done" | "no_show"): Promise<void> {
  void clock.now();
  await sql.begin(async tx => {
    const b = await findBooking(tx, { bookingId }, true);
    const t = transition(b.status, event, "clinic");
    if (!t.ok) throw new UsecaseError("bad_status", t.reason);
    await tx`update bookings set status = ${t.status} where id = ${b.id}`;
    await tx`update booking_resources set active = false where booking_id = ${b.id}`;
    const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
    const amount = balanceKopecks(rows);
    if (amount <= 0) return;
    const kind = event === "done" ? "settle" : "retain";
    const ok = canAppend(rows, { kind, amountKopecks: amount });
    if (!ok.ok) throw new Error(`журнал записи ${b.id}: ${ok.reason}`);
    const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, note) values (${b.id}, ${kind}, ${amount}, ${event === "done" ? "зачёт при оказании" : "неявка"}) returning id`;
    if (event === "done") {
      await tx`insert into receipts (booking_id, kind, ledger_id, amount_kopecks, email) values (${b.id}, 'settle', ${l!.id}, ${amount}, ${b.email})`;
    }
  });
}

export const markDone = (sql: Sql, clock: Clock, bookingId: number) => close(sql, clock, bookingId, "done");
export const markNoShow = (sql: Sql, clock: Clock, bookingId: number) => close(sql, clock, bookingId, "no_show");
```

- [ ] **Step 4: Run** `pnpm test:db` — Expected: PASS. Затем полный прогон: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm build`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usecases/outcome.ts tests/db/outcome.test.ts
git commit -m "Сценарий: итог приёма — зачёт или удержание"
```

---

## Что дальше

Вторая часть плана, `14-plan-v1-ui.md`: фоновый процесс на pg-boss (истечение, возвраты, чеки, письма, напоминания), страницы пациента с заглушкой оплаты, кабинет администратора, включая экран «врач снял приём» и возврат по требованию после неявки, документы. Пишется после того, как эта часть зелёная.
