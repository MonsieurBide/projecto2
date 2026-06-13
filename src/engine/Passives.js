export const Passives = {
  P_HEAL_TURN: {
    id: 'P_HEAL_TURN',
    name: 'Regenerative',
    description: 'At the start of each turn, heal 3 HP.',
    onStartOfTurn: ({ caster }) => {
      const healed = caster.heal(3, caster);
      if (healed > 0) return { log: `Regenerative healed ${caster.id} for 3 HP.` };
    }
  },
  P_LOW_HP_SHIELD: {
    id: 'P_LOW_HP_SHIELD',
    name: 'Desperation Guard',
    description: 'At the start of each turn, if your HP is 30 or less, gain 10 Shield.',
    onStartOfTurn: ({ caster }) => {
      if (caster.hp <= 30) {
        caster.addCounter('shield', 10);
        return { log: `Desperation Guard granted 10 Shield to ${caster.id}.` };
      }
    }
  },
  P_PERIODIC_EMPOWER: {
    id: 'P_PERIODIC_EMPOWER',
    name: 'Rhythmic Power',
    description: 'Every 3rd turn, gain Empower 5.',
    onStartOfTurn: ({ caster, passiveState }) => {
      passiveState.turnCount = (passiveState.turnCount || 0) + 1;
      if (passiveState.turnCount % 3 === 0) {
        caster.addCounter('empower', 5);
        return { log: `Rhythmic Power granted Empower 5 to ${caster.id}.` };
      }
    }
  },
  P_REDUCE_ABILITY_DMG: {
    id: 'P_REDUCE_ABILITY_DMG',
    name: 'Thick Skin',
    description: 'Reduce all incoming active ability HP damage by 3.',
    onBeforeDamageTaken: ({ incomingDamage, isAbilityDamage }) => {
      if (isAbilityDamage) {
        return Math.max(0, incomingDamage - 3);
      }
      return incomingDamage;
    }
  },
  P_LIFESTEAL: {
    id: 'P_LIFESTEAL',
    name: 'Vampirism',
    description: 'Whenever you deal ability damage to the opponent, heal for 25% of the damage dealt.',
    onDamageDealt: ({ amount, caster }) => {
      const healAmt = Math.round(amount * 0.25);
      if (healAmt > 0) {
        caster.heal(healAmt, caster);
      }
    }
  },
  P_DAMAGE_REFLECT: {
    id: 'P_DAMAGE_REFLECT',
    name: 'Spiked Armor',
    description: 'Whenever you take damage, deal 4 damage back to the source.',
    onDamageTaken: ({ source, caster }) => {
      if (source && source !== caster && source.hp > 0) {
        source.takeDamage(4, caster, false);
      }
    }
  },
  P_BURN_ON_HIT: {
    id: 'P_BURN_ON_HIT',
    name: 'Searing Blood',
    description: 'Whenever you take ability damage, inflict Burn 2 on the opponent.',
    onDamageTaken: ({ source, isAbilityDamage }) => {
      if (isAbilityDamage && source && source.hp > 0) {
        source.addCounter('burn', 2);
      }
    }
  },
  P_BONUS_DMG_DOT: {
    id: 'P_BONUS_DMG_DOT',
    name: 'Opportunist',
    description: 'Your abilities deal +4 damage if the opponent has Poison or Burn.',
    onCalculateDamageDealt: ({ baseDamage, target }) => {
      if (target && (target.counters.poison > 0 || target.counters.burn > 0)) {
        return baseDamage + 4;
      }
      return baseDamage;
    }
  },
  P_SURVIVE_DEFEAT: {
    id: 'P_SURVIVE_DEFEAT',
    name: 'Tenacity',
    description: 'Once per battle, when you would be defeated, instead survive with 20 HP.',
    onFatalDamage: ({ incomingDamage, caster, passiveState }) => {
      if (!passiveState.used) {
        passiveState.used = true;
        const damageToLeaveAt20 = caster.hp - 20;
        return Math.min(incomingDamage, damageToLeaveAt20);
      }
      return incomingDamage;
    }
  },
  P_DEATH_EXPLOSION: {
    id: 'P_DEATH_EXPLOSION',
    name: 'Martyr',
    description: 'When you are defeated, deal 20 damage each opponent.',
    onDeath: ({ engine, caster }) => {
      const enemies = engine.getAliveEnemies(caster.teamId);
      enemies.forEach(e => e.takeDamage(20, caster, false));
    }
  },
  P_REDUCE_DEBUFFS: {
    id: 'P_REDUCE_DEBUFFS',
    name: 'Purify',
    description: 'At the start of each turn, reduce all negative status counters on you by an additional 1.',
    onStartOfTurn: ({ caster }) => {
      if (caster.counters.poison > 0) caster.counters.poison--;
      if (caster.counters.burn > 0) caster.counters.burn--;
      if (caster.counters.weak > 0) caster.counters.weak--;
      if (caster.counters.vulnerable > 0) caster.counters.vulnerable--;
      if (caster.counters.noHeal > 0) caster.counters.noHeal--;
      if (caster.counters.slow > 0) caster.counters.slow--;
    }
  },
  P_IMMUNE_SLOW: {
    id: 'P_IMMUNE_SLOW',
    name: 'Unstoppable',
    description: 'You are immune to Slow.',
    onBeforeAddCounter: ({ counterType }) => {
      if (counterType === 'slow') return false;
    }
  },
  P_IMMUNE_POISON: {
    id: 'P_IMMUNE_POISON',
    name: 'Antidote',
    description: 'You are immune to Poison.',
    onBeforeAddCounter: ({ counterType }) => {
      if (counterType === 'poison') return false;
    }
  },
  P_IMMUNE_BURN: {
    id: 'P_IMMUNE_BURN',
    name: 'Fireproof',
    description: 'You are immune to Burn.',
    onBeforeAddCounter: ({ counterType }) => {
      if (counterType === 'burn') return false;
    }
  },
  P_IMMUNE_WEAK: {
    id: 'P_IMMUNE_WEAK',
    name: 'Relentless',
    description: 'You are immune to Weak.',
    onBeforeAddCounter: ({ counterType }) => {
      if (counterType === 'weak') return false;
    }
  },
  P_HALF_DOT_DMG: {
    id: 'P_HALF_DOT_DMG',
    name: 'Resilience',
    description: 'Reduce all incoming Poison and Burn damage by 50% (rounded up).',
    onDoTDamage: ({ amount, type }) => {
      if (type === 'poison' || type === 'burn') {
        return Math.ceil(amount * 0.5);
      }
      return amount;
    }
  },
  P_CD_REDUCTION: {
    id: 'P_CD_REDUCTION',
    name: 'Quick Thinker',
    description: 'At the start of each turn, reduce all your active abilities\' current cooldowns by an additional 1.',
    onStartOfTurn: ({ caster }) => {
      caster.abilities.forEach(a => {
        if (a.cdCounter > 0) a.cdCounter--;
      });
    }
  },
  P_DEATH_POISON: {
    id: 'P_DEATH_POISON',
    name: 'Toxic Bloom',
    description: 'When you are defeated, inflict Poison 10 each opponent.',
    onDeath: ({ engine, caster }) => {
      const enemies = engine.getAliveEnemies(caster.teamId);
      enemies.forEach(e => e.addCounter('poison', 10));
    }
  },
  P_HEAL_SHIELD: {
    id: 'P_HEAL_SHIELD',
    name: 'Overheal',
    description: 'Whenever you heal HP, gain Shield equal to 50% of the heal amount.',
    onHeal: ({ amount, caster }) => {
      const shieldAmt = Math.round(amount * 0.5);
      if (shieldAmt > 0) caster.addCounter('shield', shieldAmt);
    }
  },
  P_MISSING_HP_DMG: {
    id: 'P_MISSING_HP_DMG',
    name: 'Berserker',
    description: 'Your abilities deal +1 damage for every 10 missing HP.',
    onCalculateDamageDealt: ({ baseDamage, caster }) => {
      const missing = Math.max(0, caster.maxHp - caster.hp);
      const bonus = Math.floor(missing / 10);
      return baseDamage + bonus;
    }
  },
  P_DMG_TO_SHIELD: {
    id: 'P_DMG_TO_SHIELD',
    name: 'Kinetic Barrier',
    description: 'Whenever you take ability damage, gain Shield equal to 50% of the HP lost.',
    onDamageTaken: ({ amount, isAbilityDamage, caster }) => {
      if (isAbilityDamage) {
        const shieldAmt = Math.round(amount * 0.5);
        if (shieldAmt > 0) caster.addCounter('shield', shieldAmt);
      }
    }
  },
  P_BURN_HEAL: {
    id: 'P_BURN_HEAL',
    name: 'Cauterize',
    description: 'Whenever you deal ability damage to a burning opponent, heal 2 HP.',
    onDamageDealt: ({ target, caster }) => {
      if (target && target.counters.burn > 0) {
        caster.heal(2, caster);
      }
    }
  },
  P_POISON_COMBO: {
    id: 'P_POISON_COMBO',
    name: 'Catalyst',
    description: 'Whenever you deal ability damage to a Poisoned opponent, inflict Burn 1 on them.',
    onDamageDealt: ({ target }) => {
      if (target && target.counters.poison > 0) {
        target.addCounter('burn', 1);
      }
    }
  }
};
