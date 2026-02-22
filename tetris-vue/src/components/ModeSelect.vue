<template>
  <div class="mode-select-container">
    <div class="title-section">
      <h1 class="main-title">Tetris Fortress Battle</h1>
      <p class="subtitle">选择游戏模式</p>
    </div>

    <div class="modes-wrapper">
      <div class="mode-card single-player" @click="selectSinglePlayer">
        <div class="card-icon">👤</div>
        <h2 class="card-title">单人模式</h2>
        <p class="card-desc">独自挑战限时赛</p>
      </div>

      <div class="mode-card multiplayer" @click="selectMultiplayer">
        <div class="card-icon">🌐</div>
        <h2 class="card-title">联机模式</h2>
        <p class="card-desc">与好友在线对战</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useSocket } from '../composables/useSocket';

const emit = defineEmits(['selectMode']);
const { showToast } = useSocket();

const selectSinglePlayer = () => {
  emit('selectMode', 'singleplayer');
};

const selectMultiplayer = () => {
  emit('selectMode', 'multiplayer');
};
</script>

<style scoped>
.mode-select-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #121212;
  color: white;
  padding: 2rem;
  font-family: 'Inter', system-ui, Avenir, Helvetica, Arial, sans-serif;
}

.title-section {
  text-align: center;
  margin-bottom: 4rem;
  animation: fadeInDown 0.8s ease-out;
}

.main-title {
  font-size: 3rem;
  margin: 0;
  background: linear-gradient(45deg, #4ade80, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
}

.subtitle {
  font-size: 1.2rem;
  color: #a0a0a0;
  margin-top: 0.5rem;
}

.modes-wrapper {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  justify-content: center;
}

.mode-card {
  position: relative;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 16px;
  width: 260px;
  padding: 2.5rem 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: hidden;
  animation: fadeInUp 0.8s ease-out;
}

.mode-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%);
  z-index: 1;
  pointer-events: none;
}

.mode-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
  border-color: #555;
}

.mode-card:active {
  transform: translateY(-2px);
}

.card-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  position: relative;
  z-index: 2;
}

.card-title {
  font-size: 1.5rem;
  margin: 0 0 0.5rem 0;
  color: #fff;
  position: relative;
  z-index: 2;
}

.card-desc {
  font-size: 0.9rem;
  color: #888;
  margin: 0;
  position: relative;
  z-index: 2;
}

/* Specific Card Styles */
.multiplayer:hover {
  border-color: #3b82f6;
  box-shadow: 0 12px 30px rgba(59, 130, 246, 0.2);
}

.single-player:hover {
  border-color: #4ade80;
  box-shadow: 0 12px 30px rgba(74, 222, 128, 0.2);
}

.coming-soon-badge {
  position: absolute;
  top: 1.5rem;
  right: -2rem;
  background-color: #dc2626;
  color: white;
  font-size: 0.75rem;
  font-weight: bold;
  padding: 0.25rem 2.5rem;
  transform: rotate(45deg);
  z-index: 3;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

/* Animations */
@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive */
@media (max-width: 600px) {
  .modes-wrapper {
    flex-direction: column;
  }
  
  .mode-card {
    width: 240px;
    padding: 2rem 1rem;
  }

  .main-title {
    font-size: 2.2rem;
  }
}
</style>
