import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const users = await p.user.findMany({ select: { id: true, username: true, displayName: true, email: true, role: true, createdAt: true, vipUntil: true } });
    console.table(users.map((u) => ({ id: u.id.slice(0, 8), username: u.username, displayName: u.displayName, email: u.email, role: u.role, criadaEm: u.createdAt.toISOString().slice(0, 10) })));
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});