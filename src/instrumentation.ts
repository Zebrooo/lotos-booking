// Next вызывает register один раз при старте сервера. Здесь запускается
// фоновый цикл: снятие просроченных удержаний, чеки, письма, возвраты.
// Не во время сборки и не в edge-среде; выключается JOBS_DISABLED=1.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.JOBS_DISABLED === "1") return;
  const { startAppRunner } = await import("./lib/jobs/start");
  startAppRunner();
}
