// Живость процесса для healthcheck контейнера: без базы и сессии.
export function GET() {
  return Response.json({ ok: true });
}
