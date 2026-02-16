<template>
  <div class="lobby-container">
    <h1>俄罗斯方块据点争夺战</h1>

    
    <!-- Room Entry Step -->
    <div v-if="!currentRoom" class="lobby-card">
        <h3>输入房间号</h3>
        <input 
            type="text" 
            v-model="roomInput" 
            maxlength="6" 
            placeholder="创建或输入6位房间号"
            class="room-input"
        >
        <button class="primary-btn" @click="handleJoin" :disabled="roomInput.length !== 6">加入房间</button>

        <!-- Game Rules on entry -->
        <div class="rules-section">
          <h3>游戏规则</h3>
          <ul class="rules-list">
            <li>双方各控制一组方块，从四个方向落下</li>
            <li>方块落在棋盘边缘得 <b>5分</b>，其他位置得 <b>1分</b></li>
            <li>限时模式：时间到后分高者胜</li>
            <li>积分模式：先达目标分者胜</li>
            <li>若一组的刷新区被堵塞，则按照当前分数判输赢</li>
          </ul>
        </div>

        <!-- Match History on entry -->
        <div v-if="matchHistory.length" class="history-section">
          <div class="history-header-row">
            <h3>历史对局</h3>
            <button v-if="matchHistory.length > 4" class="history-toggle-text" @click="historyExpanded = !historyExpanded">
                {{ historyExpanded ? '收起' : '查看全部' }}
            </button>
          </div>
          <div class="history-list">
            <div v-for="(m, i) in visibleHistory" :key="i" class="history-card">
               <div class="h-top">
                   <span class="h-time">{{ formatTime(m.time) }}</span>
                   <span class="h-mode-tag">{{ m.mode === 'time' ? '限时' : '积分' }}</span>
                   <span class="h-winner-tag" :class="m.winner === 'Red' ? 't-red' : (m.winner === 'Blue' ? 't-blue' : 't-draw')">
                       {{ m.winner === 'Red' ? '红胜' : (m.winner === 'Blue' ? '蓝胜' : '平局') }}
                   </span>
               </div>
               <div class="h-main">
                   <div class="h-p-row" :class="{ 'is-win': m.winner === 'Red' }">
                       <span class="h-dot red"></span>
                       <span class="h-name">{{ m.redPlayer }}</span>
                       <span class="h-score-num">{{ m.redScore }}</span>
                   </div>
                   <div class="h-p-row" :class="{ 'is-win': m.winner === 'Blue' }">
                       <span class="h-dot blue"></span>
                       <span class="h-name">{{ m.bluePlayer }}</span>
                       <span class="h-score-num">{{ m.blueScore }}</span>
                   </div>
               </div>
            </div>
          </div>
        </div>
    </div>

    <!-- Lobby Step (Room matched) -->
    <div v-else class="lobby-card">
      <div class="lobby-header">
        <button class="back-btn" @click="handleLeaveConfirm">← 返回</button>
        <h2 class="room-title">房间 <span class="room-code">{{ currentRoom }}</span></h2>
      </div>

      <p class="role-tag" :class="isHost ? 'role-red' : 'role-blue'">
        {{ isHost ? '🔴 红方（房主）' : '🔵 蓝方（访客）' }}
        <span class="player-name">{{ playerName }}</span>
      </p>

      <!-- Game Rules REMOVED from room view -->

      <div v-if="isHost" class="settings-section">
          
          <div class="setting-group">
            <label class="radio-label">
              <input type="radio" value="time" v-model="mode" @change="syncSettings"> 
              限时
            </label>
            <select v-model.number="timeValue" :disabled="mode !== 'time'" @change="syncSettings" class="select-input">
              <option :value="1">1 分钟</option>
              <option :value="2">2 分钟</option>
              <option :value="3">3 分钟</option>
              <option :value="4">4 分钟</option>
              <option :value="5">5 分钟</option>
            </select>
          </div>

          <div class="setting-group">
            <label class="radio-label">
              <input type="radio" value="score" v-model="mode" @change="syncSettings"> 
              积分
            </label>
            <select v-model.number="scoreValue" :disabled="mode !== 'score'" @change="syncSettings" class="select-input">
              <option :value="50">50 分</option>
              <option :value="100">100 分</option>
              <option :value="150">150 分</option>
              <option :value="200">200 分</option>
              <option :value="250">250 分</option>
              <option :value="300">300 分</option>
              <option :value="350">350 分</option>
              <option :value="400">400 分</option>
              <option :value="450">450 分</option>
              <option :value="500">500 分</option>
            </select>
          </div>

          <div class="setting-group speed-group">
            <span class="speed-label">速度</span>
            <div class="speed-options">
              <label class="speed-chip" :class="{ active: speedValue === 1 }">
                <input type="radio" :value="1" v-model.number="speedValue" @change="syncSettings"> 1×
              </label>
              <label class="speed-chip" :class="{ active: speedValue === 1.5 }">
                <input type="radio" :value="1.5" v-model.number="speedValue" @change="syncSettings"> 1.5×
              </label>
              <label class="speed-chip" :class="{ active: speedValue === 2 }">
                <input type="radio" :value="2" v-model.number="speedValue" @change="syncSettings"> 2×
              </label>
            </div>
          </div>

          <p class="board-size-hint">棋盘: {{ computedBoardSize }}×{{ computedBoardSize }}</p>

          <p v-if="gameState.playerCount < 2" class="waiting-hint">
              等待对手加入... ({{ gameState.playerCount }}/2)
          </p>
          <button class="primary-btn" @click="handleStart" :disabled="gameState.playerCount < 2">开始游戏</button>
      </div>

      <div v-else class="waiting-card">
        <h3>等待房主开始...</h3>
        <div class="config-preview">
          <p>模式: {{ mode === 'time' ? '限时' : '积分' }}</p>
          <p>目标: {{ mode === 'time' ? timeValue + ' 分钟' : scoreValue + ' 分' }}</p>
          <p>速度: {{ gameState.config?.speed || 1 }}×</p>
          <p>棋盘: {{ computedBoardSize }}×{{ computedBoardSize }}</p>
          <p>玩家: {{ gameState.playerCount }}/2</p>
        </div>
      </div>



      <!-- Quick Chat -->
      <div class="quick-chat-inline">
        <button class="chat-btn" @click="sendQuickChat('准备')">准备</button>
        <button class="chat-btn" @click="sendQuickChat('开始咯')">开始咯</button>
      </div>

      <!-- Chat Messages -->
      <div v-if="chatMessages.length" class="chat-log">
        <div v-for="(msg, i) in recentChats" :key="i" class="chat-item">
          <span class="chat-time">{{ formatChatTime(msg.time) }}</span>
          <span :class="getChatColorClass(msg.color)">{{ msg.name }}</span>:
          <span :class="{ 'system-text': msg.color === 'system' }">{{ msg.text }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useSocket } from '../composables/useSocket';

const { startGame, joinRoom, updateSettings, controlSize, currentRoom, isHost, gameState, playerName, sendQuickChat, chatMessages, matchHistory, leaveRoom } = useSocket();

const roomInput = ref('');
const historyExpanded = ref(false);

const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
};

const formatChatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${min}`;
};

const getChatColorClass = (color) => {
    if (color === 'red') return 'h-red';
    if (color === 'blue') return 'h-blue';
    return 'h-system';
};

const visibleHistory = computed(() => {
    if (historyExpanded.value) return matchHistory.value;
    return matchHistory.value.slice(0, 4);
});
const mode = ref('score');
const timeValue = ref(3);
const scoreValue = ref(200);
const speedValue = ref(1);

// Show last 5 chat messages
const recentChats = computed(() => chatMessages.slice(-5));

// D-pad preview: scale only (toolbar handles centering)

// Computed board size indicator
const computedBoardSize = computed(() => {
  if (mode.value === 'time' && timeValue.value <= 3) return 20;
  if (mode.value === 'score' && scoreValue.value < 200) return 20;
  return 40;
});

// Sync local state with remote config if Guest
watch(() => gameState.config, (newConfig) => {
    if (newConfig && !isHost.value) {
        mode.value = newConfig.mode;
        if (newConfig.mode === 'time') {
            timeValue.value = Math.floor(newConfig.value / 60) || 1;
        } else {
            scoreValue.value = newConfig.value;
        }
    }
}, { deep: true });

const handleJoin = () => {
    if (roomInput.value.length === 6) {
        joinRoom(roomInput.value);
    }
};

const syncSettings = () => {
    if (isHost.value) {
        const value = mode.value === 'time' ? timeValue.value * 60 : scoreValue.value;
        updateSettings({ mode: mode.value, value, speed: speedValue.value });
    }
};

const handleStart = () => {
  const value = mode.value === 'time' ? timeValue.value * 60 : scoreValue.value;
  startGame({ mode: mode.value, value, speed: speedValue.value });
};

const handleLeaveConfirm = () => {
    if (confirm('确定要退出房间吗？')) {
        leaveRoom();
    }
};
</script>

<style scoped>
/* CSS Update for ChatGPT Dark Mode */
.lobby-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  color: #ececec;
  background: #212121;
  overflow-y: auto;
  overflow-y: auto;
  padding: 20px 0 40px;
  box-sizing: border-box;
  justify-content: center;
}

h1 {
  color: #ececec;
  margin-bottom: 24px;
  font-size: 1.2em;
  font-weight: 700;
}

.lobby-card {
  background: #2f2f2f;
  border: 1px solid #424242;
  padding: 16px;
  border-radius: 12px;
  text-align: center;
  width: 90%;
  max-width: 420px;
  box-sizing: border-box;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.lobby-header {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 8px;
}

.back-btn {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #b4b4b4;
  font-size: 1.1em; /* Increased font */
  padding: 12px 16px; /* Increased hit area */
  cursor: pointer;
  z-index: 10;
}
.back-btn:hover {
  color: #ececec;
  background: rgba(255,255,255,0.1);
  border-radius: 4px;
}
.back-btn:active {
  transform: translateY(-50%) scale(0.95);
  color: #10a37f;
}

.room-title {
  font-weight: 500;
  font-size: 1.1em;
  color: #b4b4b4;
  margin: 0;
}
.room-code {
  font-weight: 700;
  font-size: 1.2em;
  letter-spacing: 0.05em;
  color: #ececec;
}

.role-tag {
  font-size: 0.9em;
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #424242;
}
.role-red { color: #ff6b6b; }
.role-blue { color: #4dabf7; }

.player-name {
  color: #ececec;
  font-weight: 600;
  margin-left: 6px;
}

.room-input {
  font-size: 1.5em;
  padding: 12px;
  width: 100%;
  text-align: center;
  letter-spacing: 0.2em;
  margin-bottom: 20px;
  background: #212121;
  border: 1px solid #424242;
  border-radius: 8px;
  color: #ececec;
  box-sizing: border-box;
}
.room-input:focus {
  outline: 2px solid #10a37f;
  border-color: #10a37f;
}

.primary-btn {
  width: 100%;
  padding: 12px;
  font-size: 1.1em;
  background: #10a37f;
  border: none;
  font-weight: 600;
  color: white;
  border-radius: 8px;
}
.primary-btn:hover {
  background: #1a7f64;
}
.primary-btn:disabled {
  background: #424242;
  color: #888;
}

.rules-section {
  text-align: left;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #424242;
}
.rules-section h3 {
  font-size: 1em;
  margin: 0 0 10px;
  color: #b4b4b4;
}
.rules-list {
  padding-left: 20px;
  margin: 0;
  color: #d1d1d1;
  font-size: 0.9em;
  line-height: 1.6;
}
.rules-list b {
  color: #10a37f;
}

/* Settings */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.setting-group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #212121;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #424242;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #ececec;
}
.select-input {
  background: #2f2f2f;
  border: 1px solid #555;
  color: #ececec;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.95em;
}

/* Speed Options */
.speed-group {
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.speed-label {
  font-size: 0.9em;
  color: #b4b4b4;
}
.speed-options {
  display: flex;
  width: 100%;
  gap: 10px;
}
.speed-chip {
  flex: 1;
  text-align: center;
  padding: 8px;
  background: #2f2f2f;
  border: 1px solid #424242;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
  color: #b4b4b4;
  transition: all 0.2s;
}
.speed-chip.active {
  background: #2a4b40;
  border-color: #10a37f;
  color: #10a37f;
  font-weight: 600;
}
.speed-chip input { display: none; }

.wait-hint {
  color: #10a37f;
  font-size: 0.95em;
  margin: 8px 0;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

.waiting-card {
  background: #181818;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
}
.waiting-card h3 {
  color: #b4b4b4;
  font-weight: 500;
}
.config-preview p {
  color: #ececec;
  font-size: 0.9em;
  margin: 4px 0;
}
.board-size-hint {
  color: #10a37f;
  font-size: 0.8em;
  margin-top: 8px;
}

/* Bottom Toolbar */
.bottom-toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 12px 20px;
  z-index: 200;
  background: rgba(33,33,33,0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid #424242;
}
.toolbar-slider {
  display: flex;
  align-items: center;
  gap: 10px;
}
.toolbar-slider .slider-label {
  color: #b4b4b4;
  min-width: 36px;
  font-size: 0.8em;
}
.slider-h {
  accent-color: #10a37f;
  width: 100px;
}


.quick-chat-inline {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 10px;
}
.chat-btn {
  background: #212121;
  border: 1px solid #424242;
  color: #b4b4b4;
  font-size: 0.9em;
  padding: 6px 16px;
  border-radius: 6px;
}
.chat-btn:hover {
  background: #333;
  color: #ececec;
  border-color: #666;
}

/* Chat Log */
.chat-log {
  border-top: 1px solid #424242;
  margin-top: 10px;
  padding-top: 8px;
  text-align: left;
}
.chat-item {
  color: #b4b4b4;
  font-size: 0.85em;
  margin: 4px 0;
}
.chat-item {
  color: #b4b4b4;
  font-size: 0.85em;
  margin: 4px 0;
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.chat-time {
  color: #666;
  font-size: 0.9em;
  font-family: monospace;
}
.system-text {
  color: #888;
}
.h-system {
    color: #888;
    font-weight: bold;
}
.history-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.history-toggle-text {
  background: none;
  border: none;
  color: #10a37f;
  cursor: pointer;
  font-size: 0.9em;
}
.history-card {
  background: #3a3a3a;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.h-top {
  display: flex;
  justify-content: space-between;
  font-size: 0.8em;
  color: #888;
}
.h-mode-tag {
  background: #444;
  padding: 1px 4px;
  border-radius: 3px;
}
.h-winner-tag { font-weight: bold; }
.t-red { color: #ff6b6b; }
.t-blue { color: #4dabf7; }
.t-draw { color: #888; }

.h-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.h-p-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.95em;
  color: #ccc;
}
.h-p-row.is-win {
  color: #fff;
  font-weight: 600;
}
.h-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}
.h-name { flex: 1; text-align: left; }
.h-score-num { font-family: monospace; }
.h-dot.red { background: #ff6b6b; }
.h-dot.blue { background: #4dabf7; }
.h-vs { color: #555; margin: 0 4px; }
</style>
