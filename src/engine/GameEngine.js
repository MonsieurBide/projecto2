import { EventEmitter } from './EventEmitter';

export class GameEngine extends EventEmitter {
  constructor() {
    super();
    this.characters = {};
    this.turn = 0;
    this.phase = 'INIT'; // INIT, ACTION_SELECTION, RESOLUTION, GAME_OVER
    this.queuedActions = [];
    this.logs = [];
    
    // Timeline animation events
    this.currentTimeline = [];
    this.lastTurnTimeline = [];
  }

  addCharacter(character) {
    this.characters[character.id] = character;
  }

  getAliveEnemies(myTeamId) {
    return Object.values(this.characters).filter(c => c.teamId !== myTeamId && c.hp > 0);
  }

  startGame() {
    this.turn = 1;
    this.log(`--- Match Started ---`);
    this.currentTimeline = [];
    
    Object.values(this.characters).forEach(char => {
      char.onGameStart(this);
    });

    this.startOfTurn();
  }

  log(message) {
    this.logs.push({ turn: this.turn, message });
    this.emit('log', message);
  }

  pushEvent(evt) {
    if (this.phase === 'RESOLUTION' || this.phase === 'START_OF_TURN') {
      this.currentTimeline.push(evt);
    }
  }

  startOfTurn() {
    this.phase = 'START_OF_TURN';
    this.log(`--- Turn ${this.turn} Starts ---`);
    this.currentTimeline = [];

    this.pushEvent({ type: 'BANNER', text: `Turn ${this.turn}` });

    Object.values(this.characters).forEach(char => {
      if (char.hp > 0) {
        char.onStartOfTurn(this);
      }
    });

    if (this.checkGameOver()) return;

    this.queuedActions = [];
    this.phase = 'ACTION_SELECTION';
    this.emit('phaseChanged', this.phase);

    // AI selects actions immediately, but we wait for user to hit FIGHT
    this.handleAITurn();
    
    // We notify UI that we need to collect actions. Auto skip is handled by the UI checking CD.
  }

  handleAITurn() {
    Object.values(this.characters).forEach(char => {
      if (char.hp <= 0 || char.teamId !== 'P2') return;
      if (this.queuedActions.some(a => a.casterId === char.id)) return;

      const playable = char.abilities.filter(a => a.cdCounter === 0);
      if (playable.length > 0) {
        const ability = playable[Math.floor(Math.random() * playable.length)];
        const enemies = this.getAliveEnemies('P2');
        if (enemies.length > 0) {
          const target = enemies[Math.floor(Math.random() * enemies.length)];
          this.submitAction(char.id, ability.id, target.id);
        }
      }
    });
  }

  checkGameOver() {
    const aliveTeams = new Set();
    Object.values(this.characters).forEach(char => {
      if (char.hp > 0) aliveTeams.add(char.teamId);
    });

    if (aliveTeams.size <= 1) {
      this.phase = 'GAME_OVER';
      this.log('Game Over!');
      this.emit('phaseChanged', this.phase);
      return true;
    }
    return false;
  }

  submitAction(casterId, abilityId, targetId) {
    if (this.phase !== 'ACTION_SELECTION') throw new Error("Not in action selection phase");
    
    const caster = this.characters[casterId];
    if (caster.hp <= 0) throw new Error("Character is dead");

    const ability = caster.abilities.find(a => a.id === abilityId);
    if (!ability) throw new Error("Ability not found");
    if (ability.cdCounter > 0) throw new Error("Ability is on cooldown");

    const existingIndex = this.queuedActions.findIndex(a => a.casterId === casterId);
    if (existingIndex !== -1) {
      // Overwrite action
      this.queuedActions[existingIndex] = { casterId, abilityId, targetId };
    } else {
      this.queuedActions.push({ casterId, abilityId, targetId });
    }
    
    this.emit('actionSubmitted', { casterId });
  }

  calculateEffectiveSP(action) {
    const caster = this.characters[action.casterId];
    const ability = caster.abilities.find(a => a.id === action.abilityId);
    let sp = ability.baseSP;

    if (caster.counters.haste > 0) sp = sp / 2;
    if (caster.counters.slow > 0) sp = sp * 2;

    return { ...action, effectiveSP: sp };
  }

  // Called explicitly by UI (FIGHT button)
  resolveTurn() {
    if (this.phase !== 'ACTION_SELECTION') return;
    this.phase = 'RESOLUTION';
    this.emit('phaseChanged', this.phase);
    
    this.currentTimeline = []; // clear timeline for the resolution block
    
    let actionsToResolve = this.queuedActions.map(a => this.calculateEffectiveSP(a));
    actionsToResolve.sort((a, b) => a.effectiveSP - b.effectiveSP);

    actionsToResolve.forEach(action => {
      const caster = this.characters[action.casterId];
      if (caster.hp <= 0) return; 

      const ability = caster.abilities.find(a => a.id === action.abilityId);
      const target = this.characters[action.targetId];

      ability.cdCounter = ability.baseCD;

      this.pushEvent({ type: 'BANNER', text: `${caster.id} uses ${ability.name}` });
      this.pushEvent({ type: 'ACTOR_HIGHLIGHT', targetId: caster.id });

      if (ability.execute) {
        const result = ability.execute({
          engine: this,
          caster,
          target,
          abilityState: ability.state
        });

        if (result && result.log) {
          this.log(`[SP:${action.effectiveSP}] ${result.log}`);
        }
      }
    });

    if (!this.checkGameOver()) {
      // End of turn effects
      this.pushEvent({ type: 'BANNER', text: `End of Turn Effects` });
      
      actionsToResolve.forEach(action => {
        const caster = this.characters[action.casterId];
        if (caster.hp <= 0) return;
        const ability = caster.abilities.find(a => a.id === action.abilityId);
        if (ability.onEndOfTurn) {
          ability.onEndOfTurn({ engine: this, caster, abilityState: ability.state });
        }
      });

      Object.values(this.characters).forEach(char => {
        if (char.hp > 0) char.onEndOfTurn(this);
      });
      this.checkGameOver();
    }

    this.pushEvent({ type: 'TURN_END' });
    this.lastTurnTimeline = [...this.currentTimeline];
    
    // UI will play animation and call startOfTurn when done
    this.emit('turnResolvedTimelineReady', this.lastTurnTimeline);
  }
}
