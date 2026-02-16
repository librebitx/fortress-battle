import { ref, reactive } from 'vue';
import { io } from 'socket.io-client';

const socket = ref(null);
const isConnected = ref(false);
const gameState = reactive({
    config: null,
    board: [],
    players: {},
    playerCount: 0,
    stats: { red: 0, blue: 0 }
});
const playerId = ref(null);
const playerColor = ref(null);
const playerName = ref('');
const controlSize = ref(100); // Percentage 50-200
const chatMessages = reactive([]);
const matchHistory = reactive([]);
const restartStatus = ref([]);

const isHost = ref(false);
const currentRoom = ref(null);

export function useSocket() {
    const initSocket = () => {
        if (socket.value) return;

        // Use current hostname to allow mobile devices to connect via IP
        const backendUrl = `http://${window.location.hostname}:3000`;
        socket.value = io(backendUrl);

        socket.value.on('connect', () => {
            isConnected.value = true;
            console.log('Connected to server');
        });

        socket.value.on('disconnect', () => {
            isConnected.value = false;
            console.log('Disconnected');
        });

        socket.value.on('init', (data) => {
            playerId.value = data.id;
            playerColor.value = data.color;
            isHost.value = data.isHost;
            currentRoom.value = data.roomCode;
            playerName.value = data.name || '';
        });

        socket.value.on('roomState', (state) => {
            gameState.config = state.config;
            gameState.players = state.players;
            gameState.playerCount = state.playerCount || Object.keys(state.players).length;
        });

        socket.value.on('state', (state) => {
            gameState.config = state.config;
            gameState.board = state.board;
            gameState.players = state.players;
            gameState.stats = state.stats;
        });

        socket.value.on('chatMessage', (msg) => {
            chatMessages.push(msg);
            if (chatMessages.length > 5) chatMessages.shift();
        });

        socket.value.on('matchHistory', (history) => {
            matchHistory.splice(0, matchHistory.length, ...history);
        });

        socket.value.on('restartStatus', (status) => {
            restartStatus.value = status;
        });
    };

    const joinRoom = (code) => {
        if (socket.value && code.length === 6) {
            socket.value.emit('joinRoom', code);
        }
    };

    const updateSettings = (config) => {
        if (socket.value) {
            socket.value.emit('updateSettings', config);
        }
    };

    const startGame = (config) => {
        if (socket.value) {
            socket.value.emit('startGame', config);
            chatMessages.splice(0); // Clear chat on new game start
        }
    };

    const sendAction = (action) => {
        if (socket.value) {
            socket.value.emit('action', action);
        }
    };

    const surrender = () => {
        if (socket.value) {
            socket.value.emit('surrender');
        }
    };

    const sendQuickChat = (msg) => {
        if (socket.value) {
            socket.value.emit('quickChat', msg);
        }
    };

    const leaveRoom = () => {
        if (socket.value) {
            socket.value.emit('leaveRoom');
        }
        // Always reset state
        currentRoom.value = null;
        playerColor.value = null;
        isHost.value = false;
        gameState.config = null;
        gameState.board = [];
        gameState.players = {};
        gameState.playerCount = 0;
        chatMessages.splice(0);
    };

    const resetToLobby = () => {
        if (socket.value) {
            socket.value.emit('resetToLobby');
        }
    };

    const requestRestart = () => {
        if (socket.value) {
            socket.value.emit('requestRestart');
        }
    };

    return {
        socket,
        isConnected,
        gameState,
        playerId,
        playerColor,
        playerName,
        isHost,
        currentRoom,
        initSocket,
        joinRoom,
        updateSettings,
        startGame,
        sendAction,
        surrender,
        sendQuickChat,
        leaveRoom,
        resetToLobby,
        controlSize,
        chatMessages,
        matchHistory,
        restartStatus,
        requestRestart
    };
}
