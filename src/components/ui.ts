// Общие классы оформления. Страниц немного, поэтому без библиотеки
// компонентов: одинаковые элементы выглядят одинаково за счёт этих строк.
export const ui = {
  page: "mx-auto w-full max-w-3xl px-4",
  card: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
  h1: "text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl",
  h2: "text-lg font-semibold text-slate-900",
  muted: "text-sm text-slate-500",
  link: "text-teal-700 underline-offset-2 hover:underline",
  btn: "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50",
  primary: "bg-teal-700 text-white hover:bg-teal-800",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  input: "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 aria-[invalid=true]:border-red-500",
  label: "block text-sm font-medium text-slate-700",
  error: "mt-1 text-sm text-red-700",
  chip: "inline-flex min-w-[4.5rem] items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition",
} as const;

export const KIND_LABEL: Record<string, string> = {
  consultation: "Консультации",
  ultrasound: "УЗИ",
  diagnostics: "Диагностика",
  analysis: "Анализы",
};

/** Первое значение параметра запроса. */
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Целое положительное число из параметра или null. */
export function positiveInt(v: string | undefined): number | null {
  if (!v || !/^\d{1,12}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}
