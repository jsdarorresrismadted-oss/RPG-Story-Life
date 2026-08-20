const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const cls = await prisma.gameClass.findFirst({ where: { slug: 'guardiao-de-bronze' } });
  if (!cls) { console.log('Classe nao encontrada'); return; }
  const skills = await prisma.skill.findMany({ where: { gameClassId: cls.id }, orderBy: { sortOrder: 'asc' } });
  console.log('Skills de ' + cls.name + ':');
  for (const s of skills) {
    console.log('  ' + s.sortOrder + '. ' + s.name + ' (' + s.kind + ') - ' + (s.description || '').slice(0, 100));
  }
  await prisma.$disconnect();
})();
