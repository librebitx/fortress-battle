<template>
  <div class="splash-screen" @click="finishSplash">
    <div class="advice-container">
      <h3>《健康游戏忠告》</h3>
      <p>抵制不良游戏，拒绝盗版游戏。</p>
      <p>注意自我保护，谨防受骗上当。</p>
      <p>适度游戏益脑，沉迷游戏伤身。</p>
      <p>合理安排时间，享受健康生活。</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

const emit = defineEmits(['done']);

let timeoutId = null;

const finishSplash = () => {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  emit('done');
};

onMounted(() => {
  // Show the splash screen for 3 seconds, then emit done
  timeoutId = setTimeout(() => {
    finishSplash();
  }, 3000);
});

onUnmounted(() => {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
});
</script>

<style scoped>
.splash-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #1a1a1a;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  cursor: pointer;
  user-select: none;
}

.advice-container {
  text-align: center;
  padding: 2rem;
  font-family: monospace;
  font-size: 1.2rem;
  line-height: 2;
  color: #a0a0a0;
  animation: fadeIn 1s ease-in-out;
}

.advice-container p {
  margin: 0.5rem 0;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
