import React, { useState, useEffect, useRef } from 'react';
import { GameEngine } from './engine/GameEngine';
import { Character } from './engine/Character';
import { AbilityPool } from './engine/Abilities';
import { Passives } from './engine/Passives';

const ANIMATION_SPEED = 1500; // ms

function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

const NAMES = [
  'Arthur', 'Gwen', 'Lancelot', 'Merlin', 'Morgana', 'Percival', 'Gawain',
  'Bors', 'Tristan', 'Isolde', 'Galahad', 'Bedivere', 'Vortigern', 'Uther', 'Igraine'
];

const ICONS = {
  shield: '🛡️', haste: '⚡', slow: '⏳', poison: '🧪', burn: '🔥',
  regen: '🔋', weak: '📉', vulnerable: '💔', empower: '💪', noHeal: '🚫'
};

function App() {
  const [engineState, setEngineState] = useState(null);
  const [visualChars, setVisualChars] = useState({});
  const [floatingTexts, setFloatingTexts] = useState({});
  const [banner, setBanner] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isShowingLastTurn, setIsShowingLastTurn] = useState(false);

  const [selectedCharacterId, setSelectedCharacterId] = useState(null);
  const [selectedAbilityId, setSelectedAbilityId] = useState(null);

  const engineRef = useRef(null);
  const floatIdRef = useRef(0);

  useEffect(() => {
    const engine = new GameEngine();
    const passiveList = Object.values(Passives);

    const availableNames = [...NAMES].sort(() => 0.5 - Math.random());

    for (let i = 1; i <= 3; i++) {
      engine.addCharacter(new Character(availableNames.pop() || `P1_Char${i}`, 'P1', 100, getRandomItems(AbilityPool, 4), getRandomItems(passiveList, 2)));
      engine.addCharacter(new Character(availableNames.pop() || `P2_Char${i}`, 'P2', 100, getRandomItems(AbilityPool, 4), getRandomItems(passiveList, 2)));
    }

    const syncState = () => {
      setEngineState({
        turn: engine.turn,
        phase: engine.phase,
        queuedActions: [...engine.queuedActions],
      });
      // Deep copy chars for visual state
      setVisualChars(JSON.parse(JSON.stringify(engine.characters, (k, v) => k === 'engine' ? undefined : v)));
    };

    engine.on('phaseChanged', () => {
      setEngineState(prev => prev ? { ...prev, phase: engine.phase } : null);
    });

    engine.on('actionSubmitted', () => {
      setEngineState(prev => ({ ...prev, queuedActions: [...engine.queuedActions] }));
    });

    engine.on('turnResolvedTimelineReady', async (timeline) => {
      setIsAnimating(true);
      setIsShowingLastTurn(false);
      setSelectedCharacterId(null);
      setSelectedAbilityId(null);

      for (const evt of timeline) {
        await processEvent(evt);
        await new Promise(r => setTimeout(r, evt.type === 'BANNER' ? ANIMATION_SPEED : ANIMATION_SPEED * 0.4));
        if (evt.type === 'BANNER') setBanner(null);
      }

      setBanner(null);
      setFloatingTexts({});
      setIsAnimating(false);
      syncState();

      // AI queue is generated next turn, wait for it
      setTimeout(() => {
        engine.startOfTurn();
        syncState();
      }, 500);
    });

    engineRef.current = engine;
    engine.startGame();
    syncState();
  }, []);

  const processEvent = async (evt) => {
    if (evt.type === 'BANNER') {
      setBanner(evt.text);
    } else if (evt.type === 'FLOATING_TEXT') {
      const id = floatIdRef.current++;
      setFloatingTexts(prev => ({
        ...prev,
        [evt.targetId]: [...(prev[evt.targetId] || []), { id, text: evt.text, color: evt.color }]
      }));
    } else if (evt.type === 'ACTOR_HIGHLIGHT') {
      // Could add visual flair to active actor
    }

    // Synchronize visual state exactly when the event occurs!
    if (evt.stateSnapshot && evt.targetId) {
      setVisualChars(prev => {
        const next = { ...prev };
        next[evt.targetId] = { ...next[evt.targetId], ...evt.stateSnapshot };
        return next;
      });
    }
  };

  const handleFightClick = () => {
    if (isAnimating) return;

    const p1Chars = Object.values(engineRef.current.characters).filter(c => c.teamId === 'P1' && c.hp > 0);
    const missingActions = p1Chars.filter(c => !engineState.queuedActions.some(a => a.casterId === c.id));

    if (missingActions.length > 0) {
      const proceed = window.confirm(`${missingActions.map(c => c.id).join(', ')} have no abilities selected. Proceed anyway?`);
      if (!proceed) return;
    }

    engineRef.current.resolveTurn();
  };

  const toggleLastTurn = () => {
    if (isAnimating || !engineRef.current.lastTurnTimeline.length) return;

    if (isShowingLastTurn) {
      setIsShowingLastTurn(false);
      setFloatingTexts({});
      return;
    }

    setIsShowingLastTurn(true);
    setFloatingTexts({});

    const grouped = [];
    engineRef.current.lastTurnTimeline.forEach(evt => {
      if (evt.type === 'FLOATING_TEXT') grouped.push(evt);
    });

    grouped.forEach(evt => {
      const id = floatIdRef.current++;
      setFloatingTexts(prev => ({
        ...prev,
        [evt.targetId]: [...(prev[evt.targetId] || []), { id, text: evt.text, color: evt.color, isStatic: true }]
      }));
    });
  };

  const charsList = Object.values(visualChars);
  if (!engineState || !charsList.length) return <div>Loading...</div>;

  const p1Chars = charsList.filter(c => c.teamId === 'P1');
  const p2Chars = charsList.filter(c => c.teamId === 'P2');

  const activeChar = selectedCharacterId ? visualChars[selectedCharacterId] : null;

  const handleCharClick = (id) => {
    if (isAnimating) return;
    const char = visualChars[id];

    if (selectedAbilityId) {
      try {
        engineRef.current.submitAction(selectedCharacterId, selectedAbilityId, id);
        setSelectedAbilityId(null);
      } catch (e) { alert(e.message); }
      return;
    }

    if (char.hp > 0) {
      setSelectedCharacterId(id);
    }
  };

  return (
    <div className={`app-container ${isShowingLastTurn ? 'grayscale-mode' : ''}`}>
      {banner && <div className="banner-overlay">{banner}</div>}

      <div className="top-bar glass">
        <button className={`last-turn-btn ${isShowingLastTurn ? 'active' : ''}`} onClick={toggleLastTurn} disabled={isAnimating}>
          <span>↺</span> LAST TURN
        </button>
        <h2>Turn {engineState.turn} - {engineState.phase.replace('_', ' ')}</h2>
      </div>

      <div className="battle-field">
        {/* P2 Row */}
        <div className="team-row">
          {p2Chars.map(c => (
            <CharacterUI
              key={c.id} char={c}
              floats={floatingTexts[c.id]}
              isTargetable={selectedAbilityId && selectedCharacterId !== c.id}
              onClick={() => handleCharClick(c.id)}
            />
          ))}
        </div>

        {/* Selector Row */}
        <div className="selector-row">
          {activeChar ? `👆 Selecting for ${activeChar.id}` : (selectedAbilityId ? '🎯 Select Target!' : '⬇️ Select Character ⬇️')}
        </div>

        {/* P1 Row */}
        <div className="team-row">
          {p1Chars.map(c => (
            <CharacterUI
              key={c.id} char={c}
              floats={floatingTexts[c.id]}
              isActive={c.id === selectedCharacterId}
              hasActed={engineState.queuedActions.some(a => a.casterId === c.id)}
              onClick={() => handleCharClick(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel glass">
        <div className="abilities-section">
          {activeChar ? activeChar.abilities.map(a => (
            <button
              key={a.id}
              className={`ability-btn ${selectedAbilityId === a.id ? 'selected' : ''}`}
              disabled={a.cdCounter > 0 || isAnimating || activeChar.teamId !== 'P1'}
              onClick={() => setSelectedAbilityId(a.id)}
            >
              <div style={{ fontWeight: 'bold' }}>{a.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent-hover)' }}>CD: {a.baseCD} {a.cdCounter > 0 && `(${a.cdCounter})`} | SP: {a.baseSP}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{a.description}</div>
            </button>
          )) : (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-secondary)' }}>Select a character to view abilities</div>
          )}
        </div>

        <div className="passives-section">
          {activeChar && activeChar.passives.map(p => (
            <div key={p.id} className="passive-circle" title={p.description}>
              {p.name}
            </div>
          ))}
        </div>

        <div className="fight-section">
          <div style={{ position: 'relative' }}>
            <button
              className="fight-btn"
              onClick={handleFightClick}
              disabled={isAnimating || engineState.phase !== 'ACTION_SELECTION'}
            />
            <div className="fight-text">FIGHT!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CharacterUI({ char, floats, isActive, isTargetable, hasActed, onClick }) {
  const hpPercent = (char.hp / char.maxHp) * 100;

  return (
    <div className={`character-wrapper ${char.hp <= 0 ? 'dead' : ''} ${isTargetable ? 'targetable' : ''}`} onClick={onClick}>
      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isActive ? 'var(--accent-hover)' : 'inherit' }}>
        {char.id} {hasActed && '✓'}
      </div>

      <div className="character-layout">
        <div className="state-changes-left">
          {floats && floats.map(f => (
            <div key={f.id} className={f.isStatic ? 'floating-text-static' : 'floating-text-item'} style={{ color: f.color }}>{f.text}</div>
          ))}
        </div>

        <div className="stick-figure">
          {char.hp > 0 ? '🧍' : '💀'}
        </div>

        <div className="status-right">
          {Object.entries(char.counters).map(([key, val]) => {
            if (val > 0) return <div key={key} className="status-badge">{ICONS[key]} {val}</div>;
            return null;
          })}
        </div>
      </div>

      <div className="hp-bar-container">
        <div className="hp-bar" style={{ width: `${hpPercent}%` }}></div>
        <div className="hp-text">{char.hp}/{char.maxHp} ❤️</div>
      </div>
    </div>
  );
}

export default App;
