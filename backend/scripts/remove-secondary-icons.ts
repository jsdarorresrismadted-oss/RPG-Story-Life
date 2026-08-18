import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.skill.updateMany({
    where: { classId: { not: null } },
    data: { iconSecondary: null },
  });
  console.log(`iconSecondary removido de ${result.count} skills`);

  const check = await prisma.skill.findMany({
    where: { iconSecondary: { not: null } },
    select: { name: true, iconSecondary: true },
  });
  if (check.length > 0) {
    console.log('Ainda restam skills com iconSecondary:');
    check.forEach(s => console.log(`  ${s.name}: ${s.iconSecondary}`));
  } else {
    console.log('Todas as skills com iconSecondary = null. OK');
  }
}

main().finally(() => prisma.$disconnect());
