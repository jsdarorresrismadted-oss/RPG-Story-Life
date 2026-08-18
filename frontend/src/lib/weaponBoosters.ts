export const WEAPON_BOOSTER_LABELS: Record<string, string> = {
  damagePercent: "Dano Geral",
  physicalDamagePercent: "Dano Físico",
  magicalDamagePercent: "Dano Mágico",
  pvpDamagePercent: "Dano PvP",
  pveDamagePercent: "Dano PvE",
  bossDamagePercent: "Dano contra Chefes",
  critChance: "Chance Crítica",
  critDamage: "Dano Crítico",
  penetration: "Penetração",
  hitChance: "Precisão",
  dodge: "Esquiva",
  lifestealPercent: "Roubo de Vida",
  manaStealPercent: "Roubo de Mana",
  doubleStrikeChance: "Golpe Duplo",
  attackSpeedPercent: "Velocidade de Ataque",
  cooldownReduction: "Redução de Cooldown",
  dotPercent: "Dano Contínuo (DOT)",
  healingPercent: "Cura",
  executionPercent: "Golpe de Execução",
  fullHpDamagePercent: "Emboscada (HP cheio)",
  damageTakenReduction: "Redução de Dano Recebido",
  thornsPercent: "Espinhos (Reflexo)",
};

export function weaponBoosterLabel(kind: string): string {
  return WEAPON_BOOSTER_LABELS[kind] ?? kind;
}