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
