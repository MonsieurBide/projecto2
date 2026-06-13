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

const CHARACTER_COORDINATES = {
  P1: {
    warrior: { left: 550, top: 320 },
    rogue: { left: 350, top: 400 },
    mage: { left: 150, top: 480 }
  },
  P2: {
    warrior: { left: 1150, top: 300 },
    rogue: { left: 1350, top: 220 },
    mage: { left: 1550, top: 140 }
  }
};

function App() {
  const [engineState, setEngineState] = useState(null);
  const [visualChars, setVisualChars] = useState({});
  const [floatingTexts, setFloatingTexts] = useState({});
  const [banner, setBanner] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isShowingLastTurn, setIsShowingLastTurn] = useState(false);
  const [shakingChars, setShakingChars] = useState({});

  const [selectedCharacterId, setSelectedCharacterId] = useState(null);
  const [selectedAbilityId, setSelectedAbilityId] = useState(null);
  const [theme, setTheme] = useState('fantasy');
  const [scale, setScale] = useState(1);

  const engineRef = useRef(null);
  const floatIdRef = useRef(0);

  // Responsive Scaling Logic (fit 1920x1080 canvas inside window)
  useEffect(() => {
    const handleResize = () => {
      const wScale = window.innerWidth / 1920;
      const hScale = window.innerHeight / 1080;
      setScale(Math.min(wScale, hScale));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const engine = new GameEngine();
    const passiveList = Object.values(Passives);

    const availableNames = [...NAMES].sort(() => 0.5 - Math.random());

    // Allocate characters and assign Warrior/Mage/Rogue classes symmetrically
    for (let i = 1; i <= 3; i++) {
      const charClass = i === 1 ? 'warrior' : (i === 2 ? 'mage' : 'rogue');

      const p1Char = new Character(availableNames.pop() || `P1_Char${i}`, 'P1', 100, getRandomItems(AbilityPool, 4), getRandomItems(passiveList, 2));
      p1Char.charClass = charClass;
      engine.addCharacter(p1Char);

      const p2Char = new Character(availableNames.pop() || `P2_Char${i}`, 'P2', 100, getRandomItems(AbilityPool, 4), getRandomItems(passiveList, 2));
      p2Char.charClass = charClass;
      engine.addCharacter(p2Char);
    }

    const syncState = () => {
      setEngineState({
        turn: engine.turn,
        phase: engine.phase,
        queuedActions: [...engine.queuedActions],
      });
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

      // Trigger shake animation for damage
      if (evt.text.includes('-') && evt.text.includes('HP')) {
        setShakingChars(prev => ({ ...prev, [evt.targetId]: 'shake' }));
        setTimeout(() => {
          setShakingChars(prev => ({ ...prev, [evt.targetId]: null }));
        }, 500);
      }
      // Trigger pulse/glow for heals/shields
      if (evt.text.includes('+') || evt.text.includes('Shield')) {
        setShakingChars(prev => ({ ...prev, [evt.targetId]: 'heal-pulse' }));
        setTimeout(() => {
          setShakingChars(prev => ({ ...prev, [evt.targetId]: null }));
        }, 500);
      }
    }

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
  if (!engineState || !charsList.length) return <div className="loading-screen">Loading Battle...</div>;

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

    // Allow selecting any alive character (ally or enemy) to inspect them
    if (char.hp > 0) {
      setSelectedCharacterId(id);
    }
  };

  // Render a list of pending/completed commands for the bottom dashboard when no character is selected
  const renderHUDOverview = () => {
    const p1Alives = p1Chars.filter(c => c.hp > 0);
    return (
      <div className="hud-overview">
        <div className="hud-overview-title">TACTICAL COMMAND OVERVIEW</div>
        <div className="hud-overview-grid">
          {p1Alives.map(c => {
            const queued = engineState.queuedActions.find(a => a.casterId === c.id);
            return (
              <div key={c.id} className="hud-overview-item" onClick={() => handleCharClick(c.id)}>
                <span className="overview-name">{c.id}</span>
                <span className="overview-class">({c.charClass.toUpperCase()})</span>
                <span className={`overview-status ${queued ? 'ready' : 'pending'}`}>
                  {queued ? `Queued: ${queued.abilityId}` : 'Awaiting Commands...'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="hud-overview-help">
          Click on any character to assign actions or inspect their abilities & passives.
        </div>
      </div>
    );
  };

  return (
    <div className="game-viewport-wrapper">
      <div className="game-viewport" data-theme={theme} style={{ transform: `scale(${scale})` }}>

        {/* TOP BAR BAR */}
        <div className="top-hud-bar">
          <button
            className={`last-turn-btn-neon ${isShowingLastTurn ? 'active' : ''}`}
            onClick={toggleLastTurn}
            disabled={isAnimating}
          >
            <span>↺</span> LAST TURN EFFECTS
          </button>

          <div className="turn-indicator">
            <div className="phase-text">{engineState.phase.replace('_', ' ')}</div>
            <div className="turn-count">TURN {engineState.turn}</div>
          </div>

          <div className="theme-toggle-container">
            <span className="theme-label">THEME</span>
            <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="neon">Minimalist Neon</option>
              <option value="cyberpunk">Cyberpunk HUD</option>
              <option value="fantasy">Dark Fantasy RPG</option>
            </select>
          </div>
        </div>

        {/* COMBAT BANNER */}
        {banner && <div className="game-banner">{banner}</div>}

        {/* BATTLEFIELD - Absolute Placement Diagonal Lineup */}
        <div className="battle-arena">
          {/* P2 Opponents */}
          {p2Chars.map(c => {
            const coords = CHARACTER_COORDINATES.P2[c.charClass];
            return (
              <CharacterUI
                key={c.id}
                char={c}
                coords={coords}
                floats={floatingTexts[c.id]}
                isTargetable={selectedAbilityId && selectedCharacterId !== c.id}
                isActive={c.id === selectedCharacterId}
                shakeState={shakingChars[c.id]}
                onClick={() => handleCharClick(c.id)}
              />
            );
          })}

          {/* P1 Allies */}
          {p1Chars.map(c => {
            const coords = CHARACTER_COORDINATES.P1[c.charClass];
            return (
              <CharacterUI
                key={c.id}
                char={c}
                coords={coords}
                floats={floatingTexts[c.id]}
                isActive={c.id === selectedCharacterId}
                shakeState={shakingChars[c.id]}
                hasActed={engineState.queuedActions.some(a => a.casterId === c.id)}
                onClick={() => handleCharClick(c.id)}
              />
            );
          })}

          {/* SELECTOR / TARGETING PROMPT */}
          {!banner && (
            <div className="instruction-hud">
              {activeChar ? (
                activeChar.teamId === 'P1' ? (
                  <span>👇 Commanding <strong>{activeChar.id}</strong> (Select an ability below)</span>
                ) : (
                  <span>🔍 Inspecting Opponent: <strong>{activeChar.id}</strong></span>
                )
              ) : (
                selectedAbilityId ? (
                  <span className="targeting-pulse">🎯 CHOOSE A TARGET ON THE BATTLEFIELD</span>
                ) : (
                  <span>⚡ CHOOSE A CHARACTER TO COMMENCE TURN</span>
                )
              )}
            </div>
          )}
        </div>

        {/* CONTROL HUD DECK */}
        <div className="control-hud-deck">
          {activeChar ? (
            <>
              {/* Profile Card Summary */}
              <div className="hud-char-profile">
                <div className={`class-badge ${activeChar.charClass}`}>{activeChar.charClass.toUpperCase()}</div>
                <div className="hud-char-name">{activeChar.id}</div>
                <div className="hud-char-team">{activeChar.teamId === 'P1' ? 'Ally Unit' : 'Enemy Unit'}</div>
                <button className="hud-deselect-btn" onClick={() => setSelectedCharacterId(null)}>Back to Overview</button>
              </div>

              {/* Abilities Row */}
              <div className="hud-abilities-row">
                {activeChar.abilities.map(a => {
                  const isQueued = engineState.queuedActions.some(qa => qa.casterId === activeChar.id && qa.abilityId === a.id);
                  return (
                    <button
                      key={a.id}
                      className={`hud-ability-card ${selectedAbilityId === a.id ? 'selected' : ''} ${isQueued ? 'queued' : ''}`}
                      disabled={a.cdCounter > 0 || isAnimating || activeChar.teamId !== 'P1'}
                      onClick={() => setSelectedAbilityId(a.id)}
                    >
                      <div className="ability-card-header">
                        <span className="ability-name">{a.name}</span>
                        {isQueued && <span className="queued-tag">QUEUED</span>}
                      </div>
                      <div className="ability-card-stats">
                        <span className="stat-cd">CD: {a.baseCD} {a.cdCounter > 0 && `(${a.cdCounter} Turn)`}</span>
                        <span className="stat-sp">SP: {a.baseSP}</span>
                      </div>
                      <div className="ability-card-desc">{a.description}</div>
                    </button>
                  );
                })}
              </div>

              {/* Passives Section */}
              <div className="hud-passives-deck">
                <div className="hud-section-header">PASSIVES</div>
                <div className="hud-passives-list">
                  {activeChar.passives.map(p => (
                    <div key={p.id} className="hud-passive-rune" title={p.description}>
                      <span className="passive-icon">⚙️</span>
                      <span className="passive-tooltip">{p.name}: {p.description}</span>
                      <span className="passive-name-label">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            renderHUDOverview()
          )}

          {/* Fight Control Button */}
          <div className="hud-fight-deck">
            <button
              className="fight-action-btn"
              onClick={handleFightClick}
              disabled={isAnimating || engineState.phase !== 'ACTION_SELECTION'}
            >
              <div className="fight-btn-content">
                <span className="fight-icon">⚔️</span>
                <span className="fight-label">RESOLVE TURN</span>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function CharacterUI({ char, coords, floats, isActive, isTargetable, hasActed, shakeState, onClick }) {
  const hpPercent = (char.hp / char.maxHp) * 100;
  const shieldVal = char.counters.shield || 0;
  // Represent shield visually as an extension or overlay
  const shieldPercent = Math.min((shieldVal / char.maxHp) * 100, 100);
  const isP2 = char.teamId === 'P2';

  return (
    <div
      className={`character-card-absolute ${char.hp <= 0 ? 'dead' : ''} ${isActive ? 'selected-unit' : ''} ${isTargetable ? 'targetable-unit' : ''} ${shakeState || ''}`}
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      onClick={onClick}
    >
      {/* Floating Indicators Container */}
      <div className={`floating-text-viewport ${isP2 ? 'bottom-float' : ''}`}>
        {floats && floats.map(f => (
          <div
            key={f.id}
            className={f.isStatic ? 'floating-text-static-hud' : 'floating-text-dynamic-hud'}
            style={{ color: f.color }}
          >
            {f.text}
          </div>
        ))}
      </div>

      {/* Header Info */}
      <div className="unit-header">
        <span className="unit-name">{char.id}</span>
        {hasActed && <span className="acted-check">✓ READY</span>}
      </div>

      {/* Visual Avatar Portrait */}
      <div className="unit-avatar-frame">
        {char.hp > 0 ? (
          <img
            className="unit-avatar-image"
            src={`/${char.charClass}.png`}
            alt={char.charClass}
          />
        ) : (
          <div className="unit-dead-overlay">💀 DEFEATED</div>
        )}
      </div>

      {/* HP & Shield Bars */}
      <div className="hud-bars-container">
        {/* HP Bar */}
        <div className="hud-bar-hp-bg">
          <div className="hud-bar-hp-fill" style={{ width: `${hpPercent}%` }} />
          {shieldVal > 0 && (
            <div className="hud-bar-shield-fill" style={{ width: `${shieldPercent}%` }} />
          )}
        </div>
        {/* Label */}
        <div className="hud-bars-text">
          HP {char.hp}/{char.maxHp} {shieldVal > 0 && `(SHIELD +${shieldVal})`}
        </div>
      </div>

      {/* Status Indicators list */}
      <div className="hud-unit-statuses">
        {Object.entries(char.counters).map(([key, val]) => {
          if (val > 0 && key !== 'shield') {
            return (
              <div key={key} className="hud-status-badge" title={`${key.toUpperCase()}: ${val}`}>
                <span className="hud-status-icon">{ICONS[key]}</span>
                <span className="hud-status-value">{val}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export default App;
