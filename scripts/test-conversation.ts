import { handleConversation } from "../src/lib/conversation-agent";

async function main() {
  const query = process.argv[2] || "конструктор лего";
  const reply = await handleConversation(999999999, query, (e) => console.log(`EVENT ${e.type} ${(e as any).source ?? ""}`));
  console.log(`REPLY: ${reply.text}`);
  console.log(`RESULTS: ${reply.results?.length ?? 0}`);
  for (const r of reply.results?.slice(0, 3) ?? []) console.log(`  ${r.price}₽ ${String(r.title).slice(0, 50)} [${r.source}]`);
}

main();
