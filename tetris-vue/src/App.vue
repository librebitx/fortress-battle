<template>
  <Splash v-if="currentView === 'splash'" @done="currentView = 'modeSelect'" />
  <ModeSelect v-else-if="currentView === 'modeSelect'" @selectMode="handleModeSelect" />
  <template v-else>
    <Lobby v-if="currentView === 'multiplayer' && !showGame" @back="currentView = 'modeSelect'" />
    <SinglePlayerLobby v-else-if="currentView === 'singleplayer' && !showGame" @back="currentView = 'modeSelect'" />
    <Game v-else />
  </template>

  <!-- Global Toast Notification -->
  <Transition name="toast-fade">
    <div v-if="toastMessage" class="global-toast">
      {{ toastMessage }}
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Splash from './components/Splash.vue';
import ModeSelect from './components/ModeSelect.vue';
import Lobby from './components/Lobby.vue';
import SinglePlayerLobby from './components/SinglePlayerLobby.vue';
import Game from './components/Game.vue';
import { useSocket } from './composables/useSocket';

const currentView = ref('splash'); // 'splash', 'modeSelect', 'multiplayer'

const handleModeSelect = (mode) => {
  currentView.value = mode;
};

const { initSocket, gameState, currentRoom, toastMessage } = useSocket();

onMounted(() => {
  initSocket();
});

const showGame = computed(() => {
  return currentRoom.value && gameState.config && (gameState.config.active || gameState.config.winner);
});
</script>

<style>
/* Global Toast Styles */
.global-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(33, 33, 33, 0.95);
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 1rem;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  border: 1px solid #4ade80;
  pointer-events: none;
}

/* Toast Transitions */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
