# План v1, часть 2: путь пациента и фоновая работа

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** пациент на сайте находит врача или услугу, выбирает окно, заполняет данные, платит через заглушку и получает подтверждение; видит свою запись, отменяет и переносит её; фоновая работа снимает просроченные удержания, исполняет возвраты, отправляет чеки, письма и напоминания.

**Architecture:** запросы чтения — `src/lib/queries`, сценарии — `src/lib/usecases`, фоновые проходы — `src/lib/jobs`. Страницы — серверные компоненты; формы — серверные действия, которые только проверяют ввод, зовут сценарий и делают `redirect`. Клиентский код — формы с ошибками (`useActionState`) и автообновление страницы записи, пока ждём оплату.

**Tech Stack:** как в части 1, плюс `nodemailer` для почты. `pg-boss` убран, см. ниже.

## Отличия от дизайна v1, принятые в этой части

1. **Без pg-boss.** Побочные эффекты уже лежат строками со статусом и счётчиком попыток: `receipts`, `refunds`, `notifications`, `payments`. Эти таблицы и есть очередь. Фоновый цикл раз в 30 секунд берёт `pg_try_advisory_lock` и проходит по ним. Цикл запускается из `src/instrumentation.ts` при старте сервера Next; при нескольких экземплярах работает один, остальные не получают блокировку.
2. **Удержание создаётся при отправке формы данных**, а не при выборе окна: запись в схеме всегда имеет пациента. Таймер удержания покрывает оплату.
3. **Маршруты пациента:** `/`, `/zapis/[serviceId]`, `/zapis/[serviceId]/dannye`, `/moya-zapis/[token]`, `/moya-zapis/[token]/perenos`, `/dokumenty/[slug]`, служебный `/dev/oplata/[externalId]` только при заглушке платежей.

## Global Constraints

- Всё из части 1 (`13-plan-v1-core.md`), включая запрет коммитов в `main` и стопку PR.
- `params`, `searchParams`, `cookies()` в Next 16 только асинхронные. Типы страниц — `PageProps<'/путь'>` из `next typegen`; `typecheck` запускает `next typegen` перед `tsc`.
- Каждое серверное действие проверяет ввод через zod и не доверяет скрытым полям: идентификаторы записи берутся из токена в URL и перечитываются из базы.
- В текстах для пациента нет слов «не возвращается»; вместо них «удерживается в счёт фактически понесённых расходов». Это проверяет тест.
- Код тестов — в файлах тестов, написанных до реализации; план фиксирует поведение, которое они проверяют.

## Задачи

### Task 1: Свободные окна на диапазон дней
**Files:** `src/lib/queries/availability.ts`, изменить `src/lib/usecases/hold.ts`, тест `tests/db/availability.test.ts`.
**Produces:** `loadSlotRange(sql: Db, { serviceId, doctorId, fromDay, toDay }): Promise<SlotContext>` — правила, исключения и занятость за диапазон одним набором запросов; `availableSlots(sql, clock, { serviceId, doctorId, fromDay, days }): Promise<{ day: IsoDay; slots: Slot[] }[]>`. `loadSlotContext` становится вызовом `loadSlotRange` с одним днём.
**Поведение:** окна по дням в пределах горизонта; занятость одного дня не влияет на другой; исключение `off` снимает только свой день; выходные дни возвращаются с пустым списком; прошлое и ближайший час не предлагаются.

### Task 2: Каталог и поиск
**Files:** `src/lib/queries/catalog.ts`, тест `tests/db/catalog.test.ts`.
**Produces:** `listCatalog(sql, q?: string): Promise<{ services: CatalogService[]; doctors: CatalogDoctor[] }>`, `CatalogService { id, title, kind, durationMin, priceKopecks, prepayKopecks, prepNote, doctors: { id, title, specialty }[] }`, `CatalogDoctor { id, title, specialty, services: { id, title }[] }`; `getServiceWithDoctors(sql, serviceId)`.
**Поведение:** только активные услуги и врачи; услуга без активного врача не показывается; поиск без учёта регистра по фамилии, специальности и названию услуги («кардиолог», «Жаворонкова», «узи»); пустой запрос — всё.

### Task 3: Представление записи для пациента
**Files:** `src/lib/queries/booking-view.ts`, тест `tests/db/booking-view.test.ts`.
**Produces:** `getBookingView(sql, clock, token): Promise<BookingView | null>` с полями `token, status, service, doctor, startsAt, endsAt, holdUntil, money: MoneyState, prepayKopecks, canPay, canCancel, cancelPreview: CancelOutcome, canTransfer, receiptsSent: number, patientName, emailMasked`.
**Поведение:** `canPay` только у `held` с неистёкшим удержанием; `cancelPreview` считает последствие отмены пациентом на текущий момент; после порога `canTransfer = false`; почта маскируется; неизвестный токен — `null`.

### Task 4: Форма записи: проверка и нормализация
**Files:** `src/lib/forms/booking-form.ts`, тест `src/lib/forms/booking-form.test.ts`.
**Produces:** `normalizePhone(raw): string | null` (к виду `+7XXXXXXXXXX`), `parseBookingForm(input: Record<string, unknown>, now: Date): { ok: true; value: BookingFormValue } | { ok: false; errors: Record<string, string> }`.
**Поведение:** телефон `8 (912) 345-67-89` → `+79123456789`, чужие коды и короткие номера — ошибка; дата рождения существует, не в будущем, не старше 120 лет; для `child` пациенту меньше 18 лет; при `child` и `relative` обязательны имя, телефон и почта того, кто записывает; оба согласия обязательны; ошибки по-русски, по полю.

### Task 5: Тексты и форматирование
**Files:** `src/lib/texts.ts`, тест `src/lib/texts.test.ts`, тест-страж `src/lib/wording.test.ts`.
**Produces:** `formatRub(kopecks)`, `formatDateTime(at)` («чт, 17 сентября, 10:00» по часам клиники), `formatDay(day)`, `cancelOutcomeText(outcome, settings)`, `RETAIN_WORDING`.
**Поведение:** рубли без копеек, если их нет; день недели и месяц по-русски; текст удержания содержит «удерживается в счёт фактически понесённых расходов»; страж проходит по `src/**/*.{ts,tsx}` и падает, если где-то встречается «не возвращается».

### Task 6: Письма
**Files:** `src/lib/email/render.ts`, тест `src/lib/email/render.test.ts`.
**Produces:** `renderEmail(template: EmailTemplate, ctx: EmailContext): { subject; text }`, шаблоны `booking_confirmed`, `booking_cancelled_refund`, `booking_cancelled_retained`, `booking_cancelled_unpaid`, `booking_transferred`, `booking_reminder`.
**Поведение:** в каждом письме ссылка «Моя запись» с токеном, услуга, врач, дата и время по часам клиники, телефон клиники; в подтверждении и напоминании — прийти за N минут, взять паспорт, остаток можно оплатить картой или наличными; в письме об удержании — `RETAIN_WORDING`; неизвестный шаблон — ошибка.

### Task 7: Почта через SMTP
**Files:** `src/adapters/notify-smtp.ts`, изменить `src/adapters/index.ts`, тесты `src/adapters/notify-smtp.test.ts`, `src/adapters/index.test.ts`.
**Produces:** `createSmtpNotifier({ transport, from })`; `NOTIFIER=smtp` требует `SMTP_URL` и `MAIL_FROM`.
**Поведение:** письмо уходит с нужными полями (проверка через `jsonTransport` nodemailer); ошибка транспорта превращается в `{ ok: false, error }`; `NOTIFIER=smtp` без `SMTP_URL` — ошибка при загрузке.

### Task 8: Фоновые проходы
**Files:** `src/lib/jobs/sweeps.ts`, тест `tests/db/sweeps.test.ts`.
**Produces:** `sendPendingReceipts(sql, fiscal, limit)`, `sendQueuedNotifications(sql, notifier, ctx, limit)`, `retryRefunds(sql, payment, limit)`, `queueReminders(sql, clock)`, `pollPendingPayments(sql, payment, clock)`; каждая возвращает число обработанных строк; `MAX_ATTEMPTS = 5`.
**Поведение:** чек `pending` → `sent` с `external_id`; сбой — `attempts + 1`, после пятой попытки `failed`; письмо рендерится по актуальным данным записи в момент отправки; возвраты `pending` и `failed` с попытками меньше пяти исполняются; напоминание ставится один раз для подтверждённой записи, до которой осталось меньше `reminder_hours_before` часов и больше `lead_minutes`; платёж `created` старше двух минут у записи `held` опрашивается у провайдера, `paid` проводится как уведомление.

### Task 9: Цикл фоновой работы
**Files:** `src/lib/jobs/runner.ts`, `src/instrumentation.ts`, тест `tests/db/runner.test.ts`.
**Produces:** `runOnce(deps): Promise<Record<string, number>>` — под `pg_try_advisory_lock`; `startRunner(deps, intervalMs)`.
**Поведение:** один проход вызывает все проходы задачи 8 и `expireHolds`; второй одновременный проход при занятой блокировке ничего не делает и возвращает `{ skipped: 1 }`; ошибка одного прохода не мешает остальным. Цикл не запускается при `JOBS_DISABLED=1` и вне среды `nodejs`.

### Task 10: Приём уведомлений об оплате
**Files:** `src/lib/usecases/receive-notification.ts`, `src/app/api/pay/[provider]/notify/route.ts`, тест `tests/db/receive-notification.test.ts`.
**Produces:** `receiveNotification(sql, clock, payment, providerName, req): Promise<{ status: number; body: string }>`.
**Поведение:** чужое имя провайдера — 404; неверная подпись — 403; неизвестный платёж — 404; сумма не сошлась — 400; `confirmed`, `already`, `failed`, `paid_after_expiry` — 200.

### Task 11: Запись и переход к оплате
**Files:** `src/lib/usecases/book.ts`, тест `tests/db/book.test.ts`.
**Produces:** `bookAndPay(sql, deps, { serviceId, doctorId, startsAt, form, ip, userAgent, siteUrl }): Promise<{ ok: true; token; payUrl } | { ok: false; errors: Record<string, string> }>`.
**Поведение:** ошибки формы возвращаются по полям; `slot_taken` и прочие ошибки сценария — понятный текст в поле `_form`; согласия берутся последних редакций из базы; успешный путь создаёт удержание и платёж и отдаёт ссылку на оплату.

### Task 12: Демо-клиника
**Files:** `scripts/seed-demo.sql`, `scripts/seed.ts`, тест `tests/db/seed.test.ts`.
**Поведение:** на пустой базе появляются 12 вымышленных врачей восьми специальностей, аппарат УЗИ, услуги с длительностями и ценами, графики, два согласия с пометкой «черновик, текст утверждает юрист клиники»; повторный запуск ничего не дублирует; у кардиолога есть свободные окна в ближайший будний день.

### Task 13: Страницы пациента
**Files:** `src/lib/app.ts`, `src/app/page.tsx`, `src/app/zapis/[serviceId]/page.tsx`, `src/app/zapis/[serviceId]/dannye/{page.tsx,form.tsx,actions.ts}`, `src/app/moya-zapis/[token]/{page.tsx,actions.ts,refresh.tsx}`, `src/app/moya-zapis/[token]/perenos/page.tsx`, `src/app/dev/oplata/[externalId]/{page.tsx,actions.ts}`, `src/app/dokumenty/[slug]/page.tsx`, `src/app/globals.css`.
**Проверка:** `pnpm build` без ошибок; ручной проход в браузере на демо-клинике: поиск «кардиолог» → услуга → окно → форма с ошибкой → исправленная форма → заглушка оплаты → «Подтверждена» → отмена до порога с текстом о возврате. Скриншоты ключевых экранов.

### Task 14: Уборка и документы
**Files:** `package.json`, `tech/versions.md`, `docs/12-design-v1.md`, `README.md`.
**Поведение:** `pg-boss` удалён из зависимостей; `typecheck` вызывает `next typegen`; дизайн отражает три отличия выше; README описывает локальный запуск: база, миграции, демо-данные, `pnpm dev`, заглушка оплаты.
