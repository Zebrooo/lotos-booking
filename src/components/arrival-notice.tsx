/** Крупное красное предупреждение о приходе: пожелание владельца клиники. */
export function ArrivalNotice({ minutes }: { minutes: number }) {
  return (
    <div role="note" className="rounded-2xl border-2 border-red-600 bg-red-50 p-4 text-red-800">
      <p className="text-lg font-bold uppercase tracking-wide">Приходите за {minutes} минут до приёма</p>
      <p className="mt-1 font-semibold">Возьмите с собой паспорт: перед приёмом нужно подписать документы. Остаток стоимости можно оплатить картой или наличными.</p>
    </div>
  );
}
