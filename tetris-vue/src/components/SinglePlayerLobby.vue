<template>
  <div class="lobby-container">
    <h1>单人模式</h1>

    <div class="lobby-card">
      <div class="lobby-header">
        <button class="back-btn" @click="$emit('back')">← 返回</button>
        <h3 class="room-title">游戏准备</h3>
      </div>

      <div class="rules-section">
        <h3>游戏规则</h3>
        <ul class="rules-list">
          <li>控制方块由刷新区边线随机向四个方向前进。</li>
          <li><b>限时赛</b>：5分钟倒计时结束，挑战最高分！</li>
          <li>若方块堵塞刷新区，游戏提前结束。</li>
          <li>方块落在棋盘边缘得 <b>5 分</b>。</li>
          <li>填满背景中的 <b>8、10、12、16</b> 格矩形区域，额外获得 <b>10、15、20、30 分</b>。</li>
        </ul>
      </div>

      <div class="action-section">
        <button class="primary-btn" @click="handleStart">开始游戏</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue';
import { useSocket } from '../composables/useSocket';

const emit = defineEmits(['back']);
const { joinSinglePlayer, startGame, currentRoom, gameState } = useSocket();

onMounted(() => {
  joinSinglePlayer();
});

const handleStart = () => {
  // 5 minutes = 300 seconds
  startGame({ mode: 'time', value: 300, speed: 1 });
};

// If room code is lost or socket disconnects, we might want to handle it, 
// but for now joinSinglePlayer on mount is enough.
</script>

<style scoped>
.lobby-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  color: #ececec;
  background: #212121;
  padding: 20px 0 40px;
  box-sizing: border-box;
  justify-content: center;
}

h1 {
  color: #ececec;
  margin-bottom: 24px;
  font-size: 1.5rem;
  font-weight: 700;
}

.lobby-card {
  background: #2f2f2f;
  border: 1px solid #424242;
  padding: 24px;
  border-radius: 16px;
  text-align: center;
  width: 90%;
  max-width: 420px;
  box-sizing: border-box;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.lobby-header {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 24px;
}

.back-btn {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #b4b4b4;
  font-size: 1.1em;
  padding: 8px;
  cursor: pointer;
}

.back-btn:hover {
  color: #ececec;
}

.room-title {
  font-weight: 600;
  font-size: 1.2em;
  color: #ececec;
  margin: 0;
}

.rules-section {
  text-align: left;
  margin-bottom: 32px;
  padding: 16px;
  background: #252525;
  border-radius: 12px;
  border: 1px solid #333;
}

.rules-section h3 {
  font-size: 1.1em;
  margin: 0 0 12px;
  color: #4ade80;
}

.rules-list {
  padding-left: 1.2rem;
  margin: 0;
  color: #d1d1d1;
  font-size: 0.95em;
  line-height: 1.6;
}

.rules-list li {
  margin-bottom: 8px;
}

.rules-list b {
  color: #4ade80;
}

.primary-btn {
  width: 100%;
  padding: 14px;
  font-size: 1.2em;
  background: #10a37f;
  border: none;
  font-weight: 600;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-btn:hover {
  background: #1a7f64;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 163, 127, 0.3);
}

.primary-btn:active {
  transform: translateY(0);
}
</style>
