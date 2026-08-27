import React, { useEffect, useRef, useState, useCallback } from 'react';

// ============================================================================
// LIGHTEND - Lightning Interception Game
// ============================================================================

const LIGHTEND = () => {
  const canvasRef = useRef(null);
  const gameStateRef = useRef(null);
  const animationIdRef = useRef(null);
  const audioContextRef = useRef(null);
  const soundsRef = useRef({});

  // UI State
  const [screen, setScreen] = useState('menu'); // menu, game, pause, gameOver
  const [gameMode, setGameMode] = useState('survival'); // survival, sixtySecond
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [gridHealth, setGridHealth] = useState(100);
  const [time, setTime] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [bestScore, setBestScore] = useState(() => {
    const saved = localStorage.getItem('lightend_bestScore');
    return saved ? parseInt(saved) : 0;
  });

  // Initialize Web Audio API
  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    // Pre-create sound functions
    soundsRef.current = {
      streamerAppear: () => playTone(audioContext, 400, 0.05, 0.1),
      intercept: () => playTone(audioContext, 800, 0.1, 0.15),
      perfectIntercept: () => playTone(audioContext, 1200, 0.15, 0.2),
      strike: () => playThunder(audioContext),
      thunder: () => playThunder(audioContext, 0.05),
    };
  }, []);

  const playTone = (audioContext, frequency, volume, duration) => {
    if (!soundEnabled || !audioContext) return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      osc.start(audioContext.currentTime);
      osc.stop(audioContext.currentTime + duration);
    } catch (e) {
      // Audio context errors are non-critical
    }
  };

  const playThunder = (audioContext, volume = 0.3) => {
    if (!soundEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const gain = audioContext.createGain();
      gain.connect(audioContext.destination);
      
      for (let i = 0; i < 3; i++) {
        const osc = audioContext.createOscillator();
        osc.connect(gain);
        osc.frequency.value = Math.random() * 100 + 50;
        osc.start(now + i * 0.02);
        osc.stop(now + i * 0.02 + 0.1);
      }
      
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    } catch (e) {
      // Audio context errors are non-critical
    }
  };

  const triggerHaptic = (pattern = 'medium') => {
    if (!hapticsEnabled) return;
    if (!navigator.vibrate) return;
    
    const patterns = {
      small: [10],
      medium: [30],
      strong: [60],
      perfect: [50, 30, 50],
    };
    
    navigator.vibrate(patterns[pattern] || patterns.medium);
  };

  // Game System
  const createGameState = (mode) => {
    return {
      mode,
      score: 0,
      combo: 0,
      gridHealth: 100,
      time: 0,
      startTime: Date.now(),
      isPaused: false,
      isGameOver: false,
      
      // Interception system
      interceptionActive: false,
      interceptionPosition: null,
      interceptionStartTime: null,
      interceptionCooldown: 0,
      
      // Lightning and streamers
      lightning: [],
      streamers: [],
      strikeTargets: generateStrikeTargets(),
      
      // Particles
      particles: [],
      
      // Storm intensity
      stormIntensity: 0,
      intensityRamp: 0.3,
    };
  };

  const generateStrikeTargets = () => {
    const targets = [
      { id: 'tree1', x: 0.15, y: 0.7, type: 'tree', health: 100, damagePct: 3 },
      { id: 'tree2', x: 0.85, y: 0.75, type: 'tree', health: 100, damagePct: 3 },
      { id: 'pole1', x: 0.35, y: 0.65, type: 'pole', health: 100, damagePct: 10 },
      { id: 'pole2', x: 0.65, y: 0.68, type: 'pole', health: 100, damagePct: 10 },
      { id: 'house1', x: 0.25, y: 0.65, type: 'house', health: 100, damagePct: 5 },
      { id: 'house2', x: 0.75, y: 0.62, type: 'house', health: 100, damagePct: 5 },
      { id: 'tower', x: 0.5, y: 0.3, type: 'tower', health: 100, damagePct: 15 },
    ];
    return targets;
  };

  const generateLightningStrike = (gameState, elapsed) => {
    const intensity = Math.min(gameState.stormIntensity, 1);
    const frequency = 2 + intensity * 8; // Strikes per minute
    
    // Probabilistic strike generation
    if (Math.random() > (frequency / 60 / 60)) return; // Per-frame probability

    const leader = {
      id: Math.random(),
      startTime: elapsed,
      x: 0.3 + Math.random() * 0.4,
      y: -0.2,
      targetStreamerIndex: Math.floor(Math.random() * gameState.streamers.length),
      branches: [],
      isActive: true,
      interceptionSucceeded: false,
    };

    // Generate branches along the path
    const target = gameState.streamers[leader.targetStreamerIndex];
    if (target) {
      for (let i = 0; i < 5; i++) {
        leader.branches.push({
          startX: leader.x,
          startY: leader.y + (i / 4) * target.targetObject.y * 0.7,
          offsetX: (Math.random() - 0.5) * 0.15,
          depth: i,
        });
      }
    }

    gameState.lightning.push(leader);
  };

  const generateStreamers = (gameState) => {
    gameState.streamers = gameState.strikeTargets
      .filter(() => Math.random() > 0.4)
      .map((target, idx) => ({
        id: idx,
        targetObject: target,
        strength: Math.random() * 0.8 + 0.2,
        startTime: gameState.time,
        isActive: true,
        branches: generateStreamerBranches(15),
      }));
  };

  const generateStreamerBranches = (count) => {
    const branches = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const length = Math.random() * 0.08 + 0.02;
      branches.push({
        angle,
        length,
        x: Math.cos(angle) * length,
        y: Math.sin(angle) * length,
      });
    }
    return branches;
  };

  const updateGameLogic = useCallback((gameState, elapsed, deltaTime) => {
    if (gameState.isPaused || gameState.isGameOver) return;

    // Update time
    gameState.time = elapsed;

    // Mode-specific logic
    if (gameState.mode === 'sixtySecond') {
      gameState.time = Math.floor((Date.now() - gameState.startTime) / 1000);
      if (gameState.time >= 60) {
        gameState.isGameOver = true;
      }
    }

    // Increase storm intensity
    gameState.stormIntensity = Math.min(
      gameState.stormIntensity + gameState.intensityRamp * deltaTime / 1000,
      1
    );

    // Generate new streamers periodically
    if (gameState.streamers.length < 3 || Math.random() > 0.98) {
      const newStreamer = gameState.strikeTargets
        .filter(() => Math.random() > 0.6)
        .map((target, idx) => ({
          id: Math.random(),
          targetObject: target,
          strength: Math.random() * 0.8 + 0.2,
          startTime: gameState.time,
          isActive: true,
          branches: generateStreamerBranches(15),
        }));
      gameState.streamers.push(...newStreamer);
    }

    // Generate lightning
    generateLightningStrike(gameState, elapsed);

    // Update lightning
    gameState.lightning = gameState.lightning.filter((leader) => {
      const age = gameState.time - leader.startTime;
      const maxDuration = 2 / (1 + gameState.stormIntensity * 2);

      if (age > maxDuration) {
        if (!leader.interceptionSucceeded && leader.targetStreamerIndex < gameState.streamers.length) {
          // Strike hit
          triggerHaptic('strong');
          soundsRef.current.strike?.();
          
          const streamer = gameState.streamers[leader.targetStreamerIndex];
          if (streamer) {
            const damage = streamer.targetObject.damagePct;
            gameState.gridHealth = Math.max(0, gameState.gridHealth - damage);
            gameState.combo = 0;
            
            // Particle explosion
            for (let i = 0; i < 20; i++) {
              gameState.particles.push({
                x: streamer.targetObject.x,
                y: streamer.targetObject.y,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3 - 0.1,
                life: 0.8,
                maxLife: 0.8,
              });
            }
          }
        }
        return false;
      }

      // Check interceptions
      if (gameState.interceptionActive && !leader.interceptionSucceeded) {
        const dist = Math.hypot(
          leader.x - gameState.interceptionPosition.x,
          (leader.y + age * 0.5) - gameState.interceptionPosition.y
        );

        if (dist < 0.08) {
          leader.interceptionSucceeded = true;
          const timing = Math.min(1, age / (2 / (1 + gameState.stormIntensity * 2)));
          let points = 100;
          let tier = 'early';

          if (timing > 0.85) {
            points = 300;
            tier = 'perfect';
            triggerHaptic('perfect');
            soundsRef.current.perfectIntercept?.();
          } else if (timing > 0.7) {
            points = 200;
            tier = 'close';
            triggerHaptic('strong');
            soundsRef.current.intercept?.();
          } else if (timing > 0.5) {
            points = 150;
            tier = 'danger';
            triggerHaptic('medium');
            soundsRef.current.intercept?.();
          } else {
            triggerHaptic('medium');
            soundsRef.current.intercept?.();
          }

          gameState.score += points * (1 + gameState.combo * 0.5);
          gameState.combo += 1;

          // Particles
          for (let i = 0; i < 30; i++) {
            gameState.particles.push({
              x: gameState.interceptionPosition.x,
              y: gameState.interceptionPosition.y,
              vx: (Math.random() - 0.5) * 0.4,
              vy: (Math.random() - 0.5) * 0.4,
              life: 0.6,
              maxLife: 0.6,
            });
          }
        }
      }

      return true;
    });

    // Update particles
    gameState.particles = gameState.particles
      .map((p) => ({
        ...p,
        x: p.x + p.vx * deltaTime / 1000,
        y: p.y + p.vy * deltaTime / 1000,
        vy: p.vy + 0.2 * deltaTime / 1000,
        life: p.life - deltaTime / 1000,
      }))
      .filter((p) => p.life > 0);

    // Interception cooldown
    if (gameState.interceptionCooldown > 0) {
      gameState.interceptionCooldown -= deltaTime / 1000;
    }

    // Grid health check
    if (gameState.gridHealth <= 0) {
      gameState.isGameOver = true;
    }
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (!gameStateRef.current || screen !== 'game') return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const gameState = gameStateRef.current;
    if (gameState.interceptionCooldown <= 0 && !gameState.isGameOver && !gameState.isPaused) {
      gameState.interceptionActive = true;
      gameState.interceptionPosition = { x, y };
      gameState.interceptionStartTime = gameState.time;
      gameState.interceptionCooldown = 0.4;
      triggerHaptic('small');
      soundsRef.current.intercept?.();
    }
  }, [screen]);

  const handleTouchStart = useCallback((e) => {
    if (!gameStateRef.current || screen !== 'game') return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    const gameState = gameStateRef.current;
    if (gameState.interceptionCooldown <= 0 && !gameState.isGameOver && !gameState.isPaused) {
      gameState.interceptionActive = true;
      gameState.interceptionPosition = { x, y };
      gameState.interceptionStartTime = gameState.time;
      gameState.interceptionCooldown = 0.4;
      triggerHaptic('small');
      soundsRef.current.intercept?.();
    }
  }, [screen]);

  // Render storm and game visuals
  const renderFrame = useCallback((gameState) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Base storm sky
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Cloud layers
    ctx.fillStyle = 'rgba(40, 40, 60, 0.3)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(0, (height / 3) * i, width, height / 3);
    }

    // Rain
    ctx.strokeStyle = `rgba(150, 170, 180, ${0.1 + gameState.stormIntensity * 0.2})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 100 + gameState.stormIntensity * 50; i++) {
      const x = (Math.sin(i) * width + (gameState.time * 30) % width) % width;
      const y = ((i * 7 + gameState.time * 100) % height);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 8);
      ctx.stroke();
    }

    // Draw strike targets (silhouettes)
    ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
    gameState.strikeTargets.forEach((target) => {
      const x = target.x * width;
      const y = target.y * height;

      if (target.type === 'tree') {
        ctx.beginPath();
        ctx.ellipse(x, y - 20, 15, 30, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (target.type === 'pole') {
        ctx.fillRect(x - 2, y - 40, 4, 40);
      } else if (target.type === 'house') {
        ctx.fillRect(x - 20, y - 20, 40, 20);
        ctx.beginPath();
        ctx.moveTo(x - 20, y - 20);
        ctx.lineTo(x, y - 35);
        ctx.lineTo(x + 20, y - 20);
        ctx.closePath();
        ctx.fill();
      } else if (target.type === 'tower') {
        ctx.fillRect(x - 3, y - 80, 6, 80);
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(x - 15, y - 60 + i * 20, 30, 2);
        }
      }
    });

    // Draw streamers
    gameState.streamers.forEach((streamer) => {
      const x = streamer.targetObject.x * width;
      const y = streamer.targetObject.y * height;
      const age = gameState.time - streamer.startTime;
      const visibility = Math.min(1, age * 2) * streamer.strength;

      ctx.strokeStyle = `rgba(100, 150, 255, ${visibility * 0.6})`;
      ctx.lineWidth = 1;

      streamer.branches.forEach((branch) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + branch.x * width, y - branch.length * height);
        ctx.stroke();
      });

      // Glow
      ctx.fillStyle = `rgba(100, 150, 255, ${visibility * 0.1})`;
      ctx.beginPath();
      ctx.arc(x, y, 10 * visibility, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw lightning leaders
    gameState.lightning.forEach((leader) => {
      const age = gameState.time - leader.startTime;
      const maxDuration = 2 / (1 + gameState.stormIntensity * 2);
      const progress = Math.min(1, age / maxDuration);

      ctx.strokeStyle = `rgba(180, 200, 255, ${1 - progress * 0.5})`;
      ctx.lineWidth = 2 + Math.random() * 1;
      ctx.lineCap = 'round';

      leader.branches.forEach((branch) => {
        const branchProgress = Math.min(1, progress * (1 + branch.depth * 0.3));
        if (branchProgress === 0) return;

        const target = gameState.streamers[leader.targetStreamerIndex];
        if (!target) return;

        const targetY = target.targetObject.y;
        const currentY = leader.y + branchProgress * (targetY - leader.y) * 0.8;

        ctx.beginPath();
        ctx.moveTo(branch.startX * width, branch.startY * height);
        ctx.lineTo(
          (branch.startX + branch.offsetX * branchProgress) * width,
          currentY * height
        );
        ctx.stroke();
      });

      // Lightning flash
      if (progress > 0.8 && !leader.interceptionSucceeded) {
        ctx.fillStyle = `rgba(200, 220, 255, ${(1 - progress) * 0.2})`;
        ctx.fillRect(0, 0, width, height);
      }
    });

    // Draw interception zone
    if (gameState.interceptionActive) {
      const age = gameState.time - gameState.interceptionStartTime;
      const maxDuration = 0.5;
      const radius = 40 * (1 - age / maxDuration);
      
      ctx.strokeStyle = `rgba(100, 200, 255, ${1 - age / maxDuration})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        gameState.interceptionPosition.x * width,
        gameState.interceptionPosition.y * height,
        radius,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      if (age > maxDuration) {
        gameState.interceptionActive = false;
      }
    }

    // Draw particles
    ctx.fillStyle = 'rgba(100, 150, 255, 0.6)';
    gameState.particles.forEach((p) => {
      const opacity = p.life / p.maxLife;
      ctx.fillStyle = `rgba(100, 150, 255, ${opacity * 0.6})`;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ambient storm glow
    const ambientGlow = 0.1 + gameState.stormIntensity * 0.15;
    ctx.fillStyle = `rgba(100, 120, 180, ${ambientGlow})`;
    ctx.fillRect(0, 0, width, height);
  }, []);

  // Main game loop
  const gameLoop = useCallback(() => {
    const gameState = gameStateRef.current;
    if (!gameState) return;

    const now = Date.now();
    const deltaTime = (now - (gameState.lastFrameTime || now));
    gameState.lastFrameTime = now;

    const elapsed = (now - gameState.startTime) / 1000;

    updateGameLogic(gameState, elapsed, deltaTime);
    renderFrame(gameState);

    // Update UI state
    setScore(Math.floor(gameState.score));
    setCombo(gameState.combo);
    setGridHealth(Math.max(0, Math.floor(gameState.gridHealth)));
    if (gameState.mode === 'sixtySecond') {
      setTime(gameState.time);
    }

    if (gameState.isGameOver) {
      setBestScore(Math.max(bestScore, gameState.score));
      localStorage.setItem('lightend_bestScore', Math.max(bestScore, gameState.score).toString());
      setScreen('gameOver');
      return;
    }

    animationIdRef.current = requestAnimationFrame(gameLoop);
  }, [updateGameLogic, renderFrame, bestScore]);

  // Start game
  const startGame = useCallback((mode) => {
    initAudio();
    setScreen('game');
    setGameMode(mode);
    
    const gameState = createGameState(mode);
    gameState.startTime = Date.now();
    gameState.lastFrameTime = Date.now();
    gameStateRef.current = gameState;

    // Initial streamers
    generateStreamers(gameState);

    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
    gameLoop();
  }, [gameLoop, initAudio]);

  const pauseGame = useCallback(() => {
    if (gameStateRef.current) {
      gameStateRef.current.isPaused = true;
      setScreen('pause');
    }
  }, []);

  const resumeGame = useCallback(() => {
    if (gameStateRef.current) {
      gameStateRef.current.isPaused = false;
      gameStateRef.current.lastFrameTime = Date.now();
      setScreen('game');
      gameLoop();
    }
  }, [gameLoop]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && screen === 'game') {
        pauseGame();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, pauseGame]);

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={styles.container}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onClick={handleCanvasClick}
        onTouchStart={handleTouchStart}
      />

      {/* HUD */}
      {screen === 'game' && (
        <div style={styles.hud}>
          <div style={styles.hudTop}>
            <div style={styles.hudItem}>SCORE {score}</div>
            <div style={styles.hudItem}>COMBO {combo}x</div>
            <div style={styles.hudItem}>GRID {gridHealth}%</div>
          </div>
          {gameMode === 'sixtySecond' && (
            <div style={styles.hudBottom}>
              {60 - time}s
            </div>
          )}
          <button style={styles.pauseButton} onClick={pauseGame}>
            ⏸
          </button>
        </div>
      )}

      {/* Menu */}
      {screen === 'menu' && (
        <div style={styles.overlay}>
          <div style={styles.menuContent}>
            <h1 style={styles.title}>LIGHTEND</h1>
            <p style={styles.tagline}>Catch the strike before it connects</p>
            <div style={styles.menuButtons}>
              <button style={styles.button} onClick={() => startGame('survival')}>
                SURVIVAL
              </button>
              <button style={styles.button} onClick={() => startGame('sixtySecond')}>
                60 SECOND STORM
              </button>
            </div>
            <div style={styles.settings}>
              <label style={styles.settingLabel}>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                />
                Sound
              </label>
              <label style={styles.settingLabel}>
                <input
                  type="checkbox"
                  checked={hapticsEnabled}
                  onChange={(e) => setHapticsEnabled(e.target.checked)}
                />
                Haptics
              </label>
            </div>
            {bestScore > 0 && (
              <p style={styles.bestScore}>Best Score: {bestScore}</p>
            )}
          </div>
        </div>
      )}

      {/* Pause */}
      {screen === 'pause' && (
        <div style={styles.overlay}>
          <div style={styles.menuContent}>
            <h1 style={styles.title}>PAUSED</h1>
            <div style={styles.menuButtons}>
              <button style={styles.button} onClick={resumeGame}>
                RESUME
              </button>
              <button style={styles.button} onClick={() => {
                cancelAnimationFrame(animationIdRef.current);
                setScreen('menu');
              }}>
                MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over */}
      {screen === 'gameOver' && (
        <div style={styles.overlay}>
          <div style={styles.menuContent}>
            <h1 style={styles.title}>GAME OVER</h1>
            <p style={styles.scoreDisplay}>Score: {score}</p>
            {score > bestScore && (
              <p style={styles.newRecord}>NEW RECORD!</p>
            )}
            <div style={styles.menuButtons}>
              <button style={styles.button} onClick={() => startGame(gameMode)}>
                TRY AGAIN
              </button>
              <button style={styles.button} onClick={() => {
                cancelAnimationFrame(animationIdRef.current);
                setScreen('menu');
              }}>
                MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    fontFamily: '"Courier New", monospace',
    backgroundColor: '#000',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    touchAction: 'none',
  },
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '20px',
    boxSizing: 'border-box',
  },
  hudTop: {
    display: 'flex',
    justifyContent: 'space-around',
    color: '#6fa3ff',
    fontSize: '14px',
    fontWeight: 'bold',
    textShadow: '0 0 10px rgba(100, 150, 255, 0.5)',
    pointerEvents: 'none',
  },
  hudItem: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid rgba(100, 150, 255, 0.3)',
  },
  hudBottom: {
    textAlign: 'center',
    color: '#6fa3ff',
    fontSize: '48px',
    fontWeight: 'bold',
    textShadow: '0 0 20px rgba(100, 150, 255, 0.6)',
    pointerEvents: 'none',
  },
  pauseButton: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    width: '50px',
    height: '50px',
    fontSize: '24px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    border: '2px solid rgba(100, 150, 255, 0.5)',
    color: '#6fa3ff',
    cursor: 'pointer',
    borderRadius: '4px',
    pointerEvents: 'auto',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  menuContent: {
    textAlign: 'center',
    color: '#6fa3ff',
  },
  title: {
    fontSize: '48px',
    fontWeight: 'bold',
    margin: '0 0 10px 0',
    textShadow: '0 0 20px rgba(100, 150, 255, 0.8)',
    letterSpacing: '3px',
  },
  tagline: {
    fontSize: '14px',
    margin: '0 0 30px 0',
    opacity: 0.7,
  },
  menuButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '30px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    backgroundColor: 'rgba(100, 150, 255, 0.1)',
    border: '2px solid #6fa3ff',
    color: '#6fa3ff',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'all 0.3s',
  },
  settings: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    fontSize: '14px',
    marginBottom: '20px',
  },
  settingLabel: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  bestScore: {
    fontSize: '12px',
    opacity: 0.6,
    margin: '0',
  },
  scoreDisplay: {
    fontSize: '32px',
    fontWeight: 'bold',
    margin: '20px 0',
    textShadow: '0 0 10px rgba(100, 150, 255, 0.5)',
  },
  newRecord: {
    fontSize: '20px',
    color: '#ffcc00',
    fontWeight: 'bold',
    textShadow: '0 0 10px rgba(255, 200, 0, 0.6)',
    margin: '10px 0 20px 0',
  },
};

export default LIGHTEND;
