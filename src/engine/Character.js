import { EventEmitter } from './EventEmitter';

export class Character extends EventEmitter {
  constructor(id, teamId, maxHp, abilities = [], passives = []) {
    super();
    this.id = id;
    this.teamId = teamId;
    this.maxHp = maxHp;
    this.hp = maxHp;
    
    // Status effects
    this.counters = {
      haste: 0, slow: 0, shield: 0, poison: 0, burn: 0,
      regen: 0, weak: 0, vulnerable: 0, empower: 0, noHeal: 0,
    };

    this.flags = {
      tookDamageThisTurn: false,
    };

    this.abilities = abilities.map(ability => ({ ...ability, cdCounter: 0, state: {} }));
    this.passives = passives.map(passive => ({ ...passive, state: {} }));
    this.engine = null; 
  }

  getSnapshot() {
    return { hp: this.hp, maxHp: this.maxHp, counters: { ...this.counters }, flags: { ...this.flags } };
  }

  onGameStart(engine) {
    this.engine = engine;
    this.triggerPassives('onGameStart', { engine, caster: this });
  }

  triggerPassives(hookName, context) {
    this.passives.forEach(passive => {
      if (passive[hookName]) {
        const result = passive[hookName]({ ...context, passiveState: passive.state });
        if (result && result.log && this.engine) {
          this.engine.log(`[Passive] ${result.log}`);
          this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: passive.name, color: '#fcd34d', stateSnapshot: this.getSnapshot() });
        }
      }
    });
  }

  calculateDamageDealt(baseDamage, target) {
    let finalDamage = baseDamage;
    if (this.bonusDamage) finalDamage += this.bonusDamage;
    if (this.counters.empower > 0) finalDamage += this.counters.empower;
    if (this.counters.weak > 0) finalDamage = Math.floor(finalDamage * 0.5);

    // Let passives modify damage
    this.passives.forEach(passive => {
      if (passive.onCalculateDamageDealt) {
        finalDamage = passive.onCalculateDamageDealt({ baseDamage: finalDamage, caster: this, target, passiveState: passive.state });
      }
    });

    return finalDamage;
  }

  takeDamage(amount, source = null, isAbilityDamage = false) {
    if (this.hp <= 0 || amount <= 0) return 0;
    
    let damageToApply = amount;

    // Passives modify incoming damage
    this.passives.forEach(passive => {
      if (passive.onBeforeDamageTaken) {
        damageToApply = passive.onBeforeDamageTaken({ incomingDamage: damageToApply, caster: this, source, isAbilityDamage, passiveState: passive.state });
      }
    });

    if (isAbilityDamage && this.counters.vulnerable > 0 && damageToApply > 0) {
      damageToApply *= 2;
      this.counters.vulnerable--;
      if (this.engine) this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: '-1 Vuln', color: '#9ca3af', stateSnapshot: this.getSnapshot() });
    }
    
    if (this.counters.shield > 0 && damageToApply > 0) {
      if (damageToApply <= this.counters.shield) {
        this.counters.shield -= damageToApply;
        if (this.engine) this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: `-${damageToApply} Shield`, color: '#60a5fa', stateSnapshot: this.getSnapshot() });
        damageToApply = 0;
      } else {
        damageToApply -= this.counters.shield;
        if (this.engine) this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: `-${this.counters.shield} Shield`, color: '#60a5fa', stateSnapshot: this.getSnapshot() });
        this.counters.shield = 0;
      }
    }

    if (damageToApply > 0) {
      // Survive hook
      if (this.hp - damageToApply <= 0) {
        this.passives.forEach(passive => {
          if (passive.onFatalDamage) {
            damageToApply = passive.onFatalDamage({ incomingDamage: damageToApply, caster: this, source, passiveState: passive.state });
          }
        });
      }

      this.hp = Math.max(0, this.hp - damageToApply);
      this.flags.tookDamageThisTurn = true;
      this.emit('damageTaken', { amount: damageToApply, source, isAbilityDamage });
      
      if (this.engine) {
        this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: `-${damageToApply} HP`, color: '#ef4444', stateSnapshot: this.getSnapshot() });
      }

      // Trigger taken hooks
      this.triggerPassives('onDamageTaken', { amount: damageToApply, source, isAbilityDamage, caster: this, engine: this.engine });

      if (source && source !== this && isAbilityDamage) {
        source.triggerPassives('onDamageDealt', { amount: damageToApply, target: this, engine: this.engine, caster: source });
      }

      if (this.hp <= 0) {
        if (this.engine) this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: `DEFEATED`, color: '#7f1d1d', stateSnapshot: this.getSnapshot() });
        this.triggerPassives('onDeath', { source, caster: this, engine: this.engine });
      }
    }

    return damageToApply;
  }

  heal(amount, source = null) {
    if (this.counters.noHeal > 0 || this.hp <= 0) return 0;

    const actualHeal = Math.min(this.maxHp - this.hp, amount);
    if (actualHeal > 0) {
      this.hp += actualHeal;
      if (this.engine) {
        this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: `+${actualHeal} HP`, color: '#22c55e', stateSnapshot: this.getSnapshot() });
      }
      this.triggerPassives('onHeal', { amount: actualHeal, source, caster: this, engine: this.engine });
    }
    return actualHeal;
  }

  addCounter(type, amount) {
    let block = false;
    this.passives.forEach(p => {
      if (p.onBeforeAddCounter) {
        if (p.onBeforeAddCounter({ counterType: type, amount, caster: this, passiveState: p.state }) === false) {
          block = true;
        }
      }
    });

    if (block) {
      if (this.engine) this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: `Immune`, color: '#9ca3af', stateSnapshot: this.getSnapshot() });
      return;
    }

    if (this.counters[type] !== undefined) {
      this.counters[type] += amount;
      if (this.engine) {
        let color = '#3b82f6';
        if (['poison', 'burn', 'weak', 'slow', 'vulnerable', 'noHeal'].includes(type)) color = '#d946ef';
        this.engine.pushEvent({ type: 'FLOATING_TEXT', targetId: this.id, text: `+${amount} ${type}`, color, stateSnapshot: this.getSnapshot() });
      }
    }
  }

  resetTurnFlags() {
    this.flags.tookDamageThisTurn = false;
  }

  onStartOfTurn(engine) {
    if (this.counters.haste > 0) this.counters.haste--;
    if (this.counters.slow > 0) this.counters.slow--;
    if (this.counters.weak > 0) this.counters.weak--;
    if (this.counters.empower > 0) this.counters.empower--;
    if (this.counters.noHeal > 0) this.counters.noHeal--;
    if (this.counters.vulnerable > 0) this.counters.vulnerable--;
    
    this.abilities.forEach(ability => {
      if (ability.cdCounter > 0) ability.cdCounter--;
    });

    this.resetTurnFlags();
    this.triggerPassives('onStartOfTurn', { engine, caster: this });
  }

  onEndOfTurn(engine) {
    if (this.counters.poison > 0 && this.hp > 0) {
      let dmg = this.counters.poison;
      this.passives.forEach(p => { if (p.onDoTDamage) dmg = p.onDoTDamage({ amount: dmg, type: 'poison', caster: this, passiveState: p.state }); });
      if (dmg > 0) {
        this.takeDamage(dmg, null, false);
        engine.log(`${this.id} took ${dmg} Poison damage.`);
      }
      this.counters.poison--;
    }

    if (this.counters.burn > 0 && this.hp > 0) {
      let dmg = this.counters.burn;
      this.passives.forEach(p => { if (p.onDoTDamage) dmg = p.onDoTDamage({ amount: dmg, type: 'burn', caster: this, passiveState: p.state }); });
      if (dmg > 0) {
        this.takeDamage(dmg, null, false);
        engine.log(`${this.id} took ${dmg} Burn damage.`);
      }
      this.counters.burn--;
    }

    if (this.counters.regen > 0 && this.hp > 0) {
      const healAmt = this.counters.regen;
      const actual = this.heal(healAmt, this);
      if (actual > 0) {
        engine.log(`${this.id} regenerated ${actual} HP.`);
      }
      this.counters.regen--;
    }

    this.counters.shield = 0;
  }
}
