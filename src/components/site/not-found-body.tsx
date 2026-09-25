// Содержимое «Страница не найдена»: одно для ненайденных адресов (с рамкой
// сайта) и для notFound() внутри страниц сайта (рамку даёт layout).
import Link from "next/link";
import { Main } from "@/components/site/stepper";

export function NotFoundBody() {
  return (
    <Main>
      <section style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
        <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Ошибка 404</span>
        <h2 style={{ margin: 0, fontSize: "var(--h2-size)", lineHeight: 1.05, letterSpacing: "-0.025em" }}>Такой страницы нет</h2>
        <p style={{ margin: 0, fontSize: 16, color: "var(--color-neutral-800)", textWrap: "pretty" }}>Возможно, ссылка устарела или в ней опечатка. Если вы открывали свою запись из СМС, проверьте ссылку целиком или войдите в личный кабинет.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <Link href="/" className="btn btn-primary" style={{ padding: "14px 22px", fontSize: 15 }}>Записаться к врачу →</Link>
          <Link href="/kabinet" className="btn btn-secondary" style={{ padding: "14px 22px", fontSize: 15 }}>Личный кабинет</Link>
        </div>
      </section>
    </Main>
  );
}
