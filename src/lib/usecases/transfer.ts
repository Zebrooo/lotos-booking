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
