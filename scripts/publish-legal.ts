import postgres from "postgres";
import { LEGAL_EDITION, PERSONAL_DATA_CONSENT, PREPAY_OFFER } from "../src/lib/legal/documents.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const documents = [
    { kind: "personal_data", body: PERSONAL_DATA_CONSENT },
    { kind: "prepay_terms", body: PREPAY_OFFER },
  ];
  for (const document of documents) {
    await sql`insert into consents (kind, version, body, published_at)
      values (${document.kind}, ${LEGAL_EDITION.version}, ${document.body}, ${LEGAL_EDITION.isoDate})
      on conflict (kind, version) do nothing`;
  }
  console.log(`Юридические документы опубликованы: редакция ${LEGAL_EDITION.version} от ${LEGAL_EDITION.date}`);
} finally {
  await sql.end();
}
