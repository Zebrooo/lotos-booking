import Link from "next/link";
import { ui } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className={ui.h1}>Страница не найдена</h1>
      <p className="text-slate-600">Возможно, ссылка устарела или в ней опечатка. Если вы открывали свою запись, проверьте ссылку в письме.</p>
      <Link href="/" className={`${ui.btn} ${ui.primary}`}>К записи на приём</Link>
    </div>
  );
}
