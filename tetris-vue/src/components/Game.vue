<template>
  <div class="game-container">
    <!-- Top 70%: Board Zone -->
    <div class="board-zone">
      <div v-if="gameState.config?.winner" class="overlay">
        <div class="overlay-card">
          <h2 v-if="gameState.config.winner === 'Draw'">🤝 平局！</h2>
          <h2 v-else>{{ gameState.config.winner === 'Red' ? '🔴 红方' : '🔵 蓝方' }} 获胜！</h2>
          <p class="final-score">{{ gameState.stats.redScore }} - {{ gameState.stats.blueScore }}</p>
          
          <!-- Restart Status -->
          <div class="restart-status-row">
             <div class="status-pill red" :class="{ ready: isRedReady }">
                 <span class="dot"></span> {{ isRedReady ? '红方就绪' : '红方等待' }}
             </div>
             <div class="status-pill blue" :class="{ ready: isBlueReady }">
                 <span class="dot"></span> {{ isBlueReady ? '蓝方就绪' : '蓝方等待' }}
             </div>
          </div>

          
          <!-- Unified Restart Button for both Host and Guest -->
          <div class="restart-actions">
            <!-- Host View -->
            <button v-if="isHost" class="restart-btn" @click="handleRestartClick" :disabled="amIReady" :class="{ disabled: amIReady, 'pulse-green': isBlueReady && !amIReady }">
                {{ amIReady ? '已就绪 - 等待蓝方' : (isBlueReady ? '蓝方已就绪 - 再来一局' : '再来一局') }}
            </button>
            
            <!-- Guest View -->
            <button v-else class="restart-btn" @click="handleRestartClick" :disabled="amIReady" :class="{ disabled: amIReady, 'pulse-green': isRedReady && !amIReady }">
                 {{ amIReady ? '已就绪 - 等待红方' : (isRedReady ? '红方已就绪 - 再来一局' : '再来一局') }}
            </button>
          </div>
      
      <!-- Custom Leave Confirmation Modal -->
      <div v-if="showLeaveConfirm" class="modal-overlay">
        <div class="confirm-card">
          <h3>确定退出房间？</h3>
          <div class="confirm-actions">
            <button class="secondary-btn" @click="showLeaveConfirm = false">取消</button>
            <button class="primary-btn" @click="confirmLeave">确定</button>
          </div>
        </div>
      </div>
          <button class="leave-btn" @click="handleLeave">退出房间</button>
        </div>
      </div>

      <div class="hud">
        <div class="status-text">{{ statusText }}</div>
        <div class="territory-bar-container">
          <div class="bar red" :style="{ width: redPct + '%' }"></div>
          <div class="bar blue" :style="{ width: bluePct + '%' }"></div>
        </div>
        <div class="territory-text">
          <span class="score-red">红方 {{ gameState.stats.redScore || 0 }}</span>
          <span class="score-divider">·</span>
          <span class="score-blue">蓝方 {{ gameState.stats.blueScore || 0 }}</span>
        </div>
      </div>

      <!-- Surrender button -->
      <button v-if="gameState.config?.active && playerColor" class="surrender-btn" @click="handleSurrender">认输</button>

      <canvas ref="canvasRef" :width="canvasPixels" :height="canvasPixels"></canvas>
    </div>

    <!-- Bottom 30%: Control Zone -->
    <div class="control-zone">
      <!-- Mobile controls: D-pad layout with only ↑↓←→ -->
      <div class="mobile-controls">
        <button class="d-btn d-up" @pointerdown.prevent="handleMobileDir('up')">▲</button>
        <button class="d-btn d-left" @pointerdown.prevent="handleMobileDir('left')">◀</button>
        <button class="d-btn d-right" @pointerdown.prevent="handleMobileDir('right')">▶</button>
        <button class="d-btn d-down" @pointerdown.prevent="handleMobileDir('down')">▼</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useSocket } from '../composables/useSocket';

const { gameState, sendAction, playerColor, controlSize, surrender, leaveRoom, resetToLobby, isHost, restartStatus, requestRestart, currentRoom } = useSocket();
const canvasRef = ref(null);

const emits = defineEmits(['restart']);

const isRedReady = computed(() => restartStatus.value && restartStatus.value.includes('red'));
const isBlueReady = computed(() => restartStatus.value && restartStatus.value.includes('blue'));
const amIReady = computed(() => restartStatus.value && restartStatus.value.includes(playerColor.value));

const handleRestartClick = () => {
    if (!amIReady.value) requestRestart();
};


// Live countdown ticker - updates every second
const currentTime = ref(Date.now());
let countdownInterval = null;

// Get current player's piece gravity direction
const myPieceDir = computed(() => {
    if (!gameState.players || !playerColor.value) return 2;
    const me = Object.values(gameState.players).find(p => p.color === playerColor.value);
    return me?.piece?.dir ?? 2;
});

// Map absolute direction button press to server action based on gravity
const handleMobileDir = (absoluteDir) => {
    const gDir = myPieceDir.value;
    const dirMap = { up: 0, right: 1, down: 2, left: 3 };
    const pressed = dirMap[absoluteDir];
    const opposite = (gDir + 2) % 4;

    if (pressed === gDir) {
        sendAction('forward');
    } else if (pressed === opposite) {
        sendAction('rotate');
    } else {
        sendAction(absoluteDir);
    }
};

// Responsive scaling
const resizeBoard = () => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    
    const baseW = canvas.width;
    const baseH = canvas.height;
    
    // Board zone is 70% of screen height
    const availableW = window.innerWidth;
    const availableH = window.innerHeight * 0.7; 
    
    // Scale to fit, but keep some padding
    const scale = Math.min((availableW * 0.96) / baseW, (availableH * 0.96) / baseH);
    
    canvas.style.width = `${baseW * scale}px`;
    canvas.style.height = `${baseH * scale}px`;
    canvas.style.transform = 'none'; 
    canvas.style.marginTop = '0';
};

const controlStyle = computed(() => ({
  transform: `scale(${controlSize.value / 100})`,
  transformOrigin: 'center center'
}));

// Dynamic board dimensions from server data
const BLOCK_SIZE = 30;
const boardRows = computed(() => gameState.board?.length || 40);
const boardCols = computed(() => gameState.board?.[0]?.length || 40);
const canvasPixels = computed(() => boardRows.value * BLOCK_SIZE);

// Stats
const totalTerritory = computed(() => (gameState.stats.red + gameState.stats.blue) || 1);
const redPct = computed(() => (gameState.stats.red / totalTerritory.value) * 100);
const bluePct = computed(() => (gameState.stats.blue / totalTerritory.value) * 100);

const statusText = computed(() => {
  if (!gameState.config) return '等待中...';
  if (gameState.config.winner) return '游戏结束';
  
  if (gameState.config.mode === 'time') {
    const elapsed = Math.floor((currentTime.value - gameState.config.startTime) / 1000);
    const remaining = Math.max(0, gameState.config.value - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `⏱ ${mins}:${secs < 10 ? '0' : ''}${secs}`;
  } else {
    return `获胜目标 ${gameState.config.value}`;
  }
});




const handleSurrender = () => {
  if (confirm('确定认输？')) {
    surrender();
  }
};

const showLeaveConfirm = ref(false);

const handleLeave = () => {
    showLeaveConfirm.value = true;
};

const confirmLeave = () => {
    showLeaveConfirm.value = false;
    leaveRoom();
    // Force reload to ensure a clean state and return to lobby
    window.location.reload();
};

// Drawing
const draw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Clear
  ctx.fillStyle = '#08080e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const cols = boardCols.value;
  const rows = boardRows.value;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK_SIZE, 0);
    ctx.lineTo(c * BLOCK_SIZE, canvas.height);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK_SIZE);
    ctx.lineTo(canvas.width, r * BLOCK_SIZE);
    ctx.stroke();
  }

  // Draw Spawn Zone Highlight (Center 4x4)
  const zoneStart = Math.floor(cols / 2) - 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fillRect(zoneStart * BLOCK_SIZE, zoneStart * BLOCK_SIZE, 4 * BLOCK_SIZE, 4 * BLOCK_SIZE);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(zoneStart * BLOCK_SIZE, zoneStart * BLOCK_SIZE, 4 * BLOCK_SIZE, 4 * BLOCK_SIZE);
  ctx.setLineDash([]);

  // Draw Board
  if (gameState.board && gameState.board.length > 0) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = gameState.board[r][c];
            if (val) {
                ctx.fillStyle = val === 1 ? '#cc2233' : '#2244cc';
                ctx.fillRect(c * BLOCK_SIZE + 1, r * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            }
        }
    }
  }

  // Draw Players
  if (gameState.players) {
    Object.values(gameState.players).forEach(player => {
        if (!player.piece) return;
        const isRed = player.color === 'red';
        ctx.fillStyle = isRed ? '#ff4466' : '#4488ff';
        ctx.shadowColor = isRed ? 'rgba(255, 68, 102, 0.6)' : 'rgba(68, 136, 255, 0.6)';
        ctx.shadowBlur = 8;
        const shape = player.piece.shape;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    const x = (player.piece.x + c) * BLOCK_SIZE;
                    const y = (player.piece.y + r) * BLOCK_SIZE;
                    ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                }
            }
        }
        ctx.shadowBlur = 0;
    });
  }
};

// Watch for state changes to redraw
watch(() => gameState.board, draw, { deep: true });
watch(() => gameState.players, draw, { deep: true });

// Re-scale when board dimensions change
watch(boardRows, () => {
  nextTick(() => {
    resizeBoard();
    draw();
  });
});

onMounted(() => {
  window.addEventListener('resize', resizeBoard);
  resizeBoard();
  draw();

  countdownInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  window.removeEventListener('resize', resizeBoard);
  if (countdownInterval) clearInterval(countdownInterval);
});
</script>

<style scoped>
/* CSS Update for ChatGPT Dark Mode + 70/30 Split */
.game-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  touch-action: none;
  background: #171717; /* Canvas/Board background */
}

/* --- Top 70% Board Zone --- */
.board-zone {
  flex: 7;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: hidden;
}

/* HUD */
.hud {
  margin-bottom: 10px;
  z-index: 10;
}

.status-text {
  font-size: 1.1em;
  font-weight: 600;
  margin-bottom: 6px;
  color: #ececec;
  text-align: center;
}

.territory-bar-container {
  width: 500px;
  max-width: 80%;
  height: 12px;
  background: #2f2f2f;
  margin: 0 auto 8px;
  display: flex;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 0 15px rgba(0,0,0,0.5);
  border: 1px solid #444;
}
.bar { height: 100%; transition: width 0.5s ease; }
.red { background: #ff6b6b; }
.blue { background: #4dabf7; }

.territory-text {
  font-size: 0.85em;
  color: #b4b4b4;
  display: flex;
  justify-content: center;
  align-items: center;
}
.score-red { color: #ff6b6b; font-size: 1.3em; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.6); }
.score-blue { color: #4dabf7; font-size: 1.3em; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.6); }
.score-divider { margin: 0 12px; color: #777; font-weight: bold; }

canvas {
  /* Ensure canvas fits within the board zone */
  max-width: 96%;
  max-height: 80%;
  object-fit: contain;
  border: 1px solid #333;
  background: #000;
  border-radius: 4px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

/* Game Over Overlay */
.overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.overlay-card {
  background: #2f2f2f;
  border: 1px solid #424242;
  border-radius: 12px;
  padding: 32px 48px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.overlay-card h2 {
  font-size: 1.5em;
  margin: 0 0 12px;
  color: #ececec;
}
.final-score {
  font-size: 2em;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin: 0 0 24px;
  color: #b4b4b4;
}
.restart-btn {
  padding: 10px 28px;
  font-size: 1.1em;
  border-radius: 6px;
  background: #10a37f;
  border: none;
  color: white;
  cursor: pointer;
  width: 100%;
  margin-bottom: 10px;
}
.waiting-text {
  color: #888;
  margin-bottom: 16px;
  font-size: 0.9em;
  animation: pulse 2s infinite;
}
.restart-btn:hover {
  background: #1a7f64;
}
.leave-btn {
  padding: 8px 20px;
  font-size: 0.95em;
  border-radius: 6px;
  background: transparent;
  border: 1px solid #555;
  color: #b4b4b4;
  cursor: pointer;
  width: 100%;
}
.leave-btn:hover {
  background: #3a3a3a;
  color: #ececec;
}

/* Surrender */
.surrender-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 6px 16px;
  font-size: 0.85em;
  border-radius: 6px;
  background: rgba(42, 26, 26, 0.9);
  border: 1px solid #533;
  color: #ff8888;
  cursor: pointer;
  z-index: 200;
}
.surrender-btn:hover {
  background: #502020;
  color: #ffaaaa;
}

/* Modal Overlay */
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  backdrop-filter: blur(4px);
}
.confirm-card {
  background: #2f2f2f;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #424242;
  text-align: center;
  width: 280px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
.confirm-card h3 {
  margin: 0 0 20px;
  color: #ececec;
  font-size: 1.1em;
}
.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.confirm-actions button {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  font-size: 1em;
  cursor: pointer;
}
.confirm-actions .secondary-btn {
  background: #424242;
  color: #b4b4b4;
}
.confirm-actions .primary-btn {
  background: #10a37f;
  color: white;
}

/* --- Bottom 30% Control Zone --- */
.control-zone {
  flex: 3;
  background: #212121; /* Darker control area */
  border-top: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 50;
}

/* Mobile Controls - No longer fixed, centered in zone */
.mobile-controls {
  position: relative;
  display: block;
  width: 220px; /* Slightly larger area for spacing */
  height: 220px;
  pointer-events: none;
}

/* D-pad buttons */
.d-btn {
  position: absolute;
  width: 68px; /* Larger hit targets */
  height: 68px;
  border-radius: 12px;
  background: #2f2f2f;
  border: 1px solid #444;
  color: #ececec;
  font-size: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  padding: 0;
  margin: 0;
  pointer-events: auto;
  box-shadow: 0 4px 0 #1a1a1a;
}

.d-btn:active {
  background: #3a3a3a;
  color: #10a37f;
  border-color: #10a37f;
}

/* Position buttons in Inverted T pattern (Laptop/Keyboard style) */
/* Container is relative 220x220, centered in control-zone */
/* Up is at the top center of the T */
.d-up    { top: 15px;   left: 50%; transform: translateX(-50%); }
/* Down is below Up */
.d-down  { top: 95px;  left: 50%; transform: translateX(-50%); }
/* Left is to the left of Down */
.d-left  { top: 95px;  left: 50%; transform: translateX(-160%); } /* 50% - ~75px */
/* Right is to the right of Down */
.d-right { top: 95px;  left: 50%; transform: translateX(60%); }  /* 50% + ~40px */
</style>

<style scoped>
.restart-status-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 16px 0;
}
.status-pill {
  background: #333;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.9em;
  color: #888;
  border: 1px solid #444;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.3s ease;
}
.status-pill .dot {
  width: 8px; height: 8px; border-radius: 50%; background: #666;
}
.status-pill.ready {
  border-color: #10a37f;
  color: #ececec;
  background: rgba(16, 163, 127, 0.1);
}
.status-pill.ready .dot { background: #10a37f; box-shadow: 0 0 5px #10a37f; }
.status-pill.red.ready { border-color: #ff6b6b; background: rgba(255,107,107,0.1); }
.status-pill.red.ready .dot { background: #ff6b6b; box-shadow: 0 0 5px #ff6b6b; }
.status-pill.blue.ready { border-color: #4dabf7; background: rgba(77,171,247,0.1); }
.status-pill.blue.ready .dot { background: #4dabf7; box-shadow: 0 0 5px #4dabf7; }

.restart-btn.disabled {
  background: #444;
  cursor: not-allowed;
  color: #aaa;
}
.pulse-green {
  animation: pulse-green 2s infinite;
}
@keyframes pulse-green {
  0% { box-shadow: 0 0 0 0 rgba(16, 163, 127, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(16, 163, 127, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 163, 127, 0); }
}
</style>
