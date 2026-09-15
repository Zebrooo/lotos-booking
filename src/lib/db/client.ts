import postgres, { type Sql, type TransactionSql } from "postgres";

export type { Sql, TransactionSql };
/** Подключение или транзакция: для функций, которые не открывают транзакцию сами. */
export type Db = Sql | TransactionSql;

// bigint (int8) из базы — числом: идентификаторы и копейки далеки от 2^53.
const bigintAsNumber = { to: 20, from: [20], serialize: (x: number | bigint) => x.toString(), parse: (x: string) => Number(x) };

export function createDb(url: string, max = 10): Sql {
  return postgres(url, { max, transform: postgres.camel, types: { bigint: bigintAsNumber }, onnotice: () => {} });
}

let shared: Sql | undefined;
/** Общее подключение приложения по DATABASE_URL. */
export function db(): Sql {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL не задан");
    shared = createDb(url);
  }
  return shared;
}
