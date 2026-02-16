<template>
  <Lobby v-if="!showGame" />
  <Game v-else />
</template>

<script setup>
import { computed, onMounted } from 'vue';
import Lobby from './components/Lobby.vue';
import Game from './components/Game.vue';
import { useSocket } from './composables/useSocket';

const { initSocket, gameState } = useSocket();

onMounted(() => {
  initSocket();
});

const showGame = computed(() => {
  return gameState.config && (gameState.config.active || gameState.config.winner);
});
</script>

<style>

</style>
