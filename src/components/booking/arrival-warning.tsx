// Красный блок «Приходите за 10 минут» — пожелание владельца клиники,
// в дизайне v2 он на экране «Готово».
export function ArrivalWarning({ minutes, restLabel }: { minutes: number; restLabel: string }) {
  return (
    <div style={{ background: "var(--color-danger)", color: "#fff", padding: "var(--warn-pad)", borderRadius: 28, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontWeight: 800, fontSize: "var(--warn-size)", lineHeight: 1.05, letterSpacing: "-0.02em", textTransform: "uppercase" }}>Приходите за {minutes} минут до приёма</span>
      <span style={{ fontWeight: 800, fontSize: "var(--warn-size2)", lineHeight: 1.15, textTransform: "uppercase" }}>Возьмите паспорт и деньги на оплату приёма — {restLabel}</span>
      <span style={{ fontSize: 15 }}>Перед приёмом в регистратуре нужно подписать документы.</span>
    </div>
  );
}
