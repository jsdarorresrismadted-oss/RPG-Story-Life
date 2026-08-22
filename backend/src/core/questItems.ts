import { prisma } from "./database";

// Marca como temporários os itens referenciados em objetivos de coleta ("collect")
// de uma quest. Itens temporários somem do inventário ao deslogar / ao concluir a quest.
export async function markCollectItemsTemporary(
  db: any,
  objectives: any
): Promise<void> {
  let list: any[] = [];
  if (typeof objectives === "string") {
    try {
      list = JSON.parse(objectives);
    } catch {
      list = [];
    }
  } else if (Array.isArray(objectives)) {
    list = objectives;
  }
  if (!Array.isArray(list)) return;

  const names = list
    .filter((o: any) => o && o.type === "collect" && (typeof o.itemName === "string" || typeof o.target === "string"))
    .map((o: any) => String(o.itemName ?? o.target).toLowerCase());

  if (names.length === 0) return;

  try {
    await (db ?? prisma).item.updateMany({
      where: { name: { in: names, mode: "insensitive" } },
      data: { isTemporary: true },
    });
  } catch {
    /* item pode não existir ainda — ignorado */
  }
}
