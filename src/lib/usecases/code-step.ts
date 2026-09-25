// Шаг «Подтвердите телефон»: что показать на странице кода и как отпустить
// удержание, если пациент решил поменять номер.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { BookingStatus } from "@/domain/transitions";
import { maskPhone, type Who } from "@/lib/forms/booking-v2";
import { RESEND_SECONDS } from "./sms-codes";

export type CodeStep = {
  token: string; status: BookingStatus; payMode: "online" | "reserve"; verified: boolean; holdUntil: Date | null;
  phoneMasked: string; resendAt: Date; doctorId: number; serviceId: number; startsAt: Date;
  prefill: { who: Who; payChoice: "online" | "reserve"; form: { fio: string; dob: string; phone: string; repFio: string; phone2: string } };
};

const dobRu = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export async function codeStep(sql: Sql, clock: Clock, token: string): Promise<CodeStep | null> {
  if (!/^[A-Za-z0-9_-]{21}$/.test(token)) return null;
  const [b] = await sql<{
    id: number; status: BookingStatus; payMode: "online" | "reserve"; phoneVerifiedAt: Date | null; holdUntil: Date | null;
    resourceId: number; serviceId: number; startsAt: Date; bookerRelation: "self" | "child" | "relative"; bookerName: string | null;
    bookerPhone: string | null; fullName: string; birthDate: string; patientPhone: string;
  }[]>`select b.id, b.status, b.pay_mode, b.phone_verified_at, b.hold_until, b.resource_id, b.service_id, b.starts_at,
      b.booker_relation, b.booker_name, b.booker_phone, p.full_name, to_char(p.birth_date, 'YYYY-MM-DD') as birth_date, p.phone as patient_phone
    from bookings b join patients p on p.id = b.patient_id where b.token = ${token}`;
  if (!b) return null;
  const contact = b.bookerPhone ?? b.patientPhone;
  const [last] = await sql<{ createdAt: Date }[]>`select created_at from sms_codes where booking_id = ${b.id} order by created_at desc limit 1`;
  const who: Who = b.bookerRelation === "child" ? "child" : b.bookerRelation === "relative" ? "other" : "self";
  return {
    token, status: b.status, payMode: b.payMode, verified: b.phoneVerifiedAt != null, holdUntil: b.holdUntil,
    phoneMasked: maskPhone(contact), resendAt: new Date((last?.createdAt ?? clock.now()).getTime() + RESEND_SECONDS * 1000),
    doctorId: b.resourceId, serviceId: b.serviceId, startsAt: b.startsAt,
    prefill: { who, payChoice: b.payMode, form: {
      fio: b.fullName, dob: dobRu(b.birthDate), phone: maskPhone(contact),
      repFio: who === "child" ? b.bookerName ?? "" : "", phone2: who === "other" ? maskPhone(b.patientPhone) : "",
    } },
  };
}

/** Отпустить неподтверждённое удержание: окно свободно, уведомлений нет. */
export async function abandonHold(sql: Sql, token: string): Promise<boolean> {
  return sql.begin(async tx => {
    const rows = await tx<{ id: number }[]>`update bookings set status = 'expired', hold_until = null
      where token = ${token} and status = 'held' and phone_verified_at is null returning id`;
    if (rows.length === 0) return false;
    await tx`update booking_resources set active = false where booking_id = ${rows[0]!.id}`;
    return true;
  });
}
