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
const lobbyStats = reactive({
    onlinePlayers: 0,
    idleRooms: []
});
const playerId = ref(null);
const playerColor = ref(null);
const playerName = ref('');
const controlSize = ref(100); // Percentage 50-200
const chatMessages = reactive([]);
const matchHistory = reactive([]);
const restartStatus = ref([]);

const toastMessage = ref('');
let toastTimeout = null;

const showToast = (msg, duration = 3000) => {
    toastMessage.value = msg;
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(() => {
        toastMessage.value = '';
    }, duration);
};

const isHost = ref(false);
const currentRoom = ref(null);

export function useSocket() {
    const initSocket = () => {
        if (socket.value) return;

        // Connect to the same origin (relative path)
        // In dev, Vite proxy handles forwarding to localhost:3000
        // In prod, Nginx handles forwarding to localhost:3000
        socket.value = io();

        socket.value.on('connect', () => {
            isConnected.value = true;
            console.log('Connected to server');
        });

        socket.value.on('disconnect', () => {
            isConnected.value = false;
            console.log('Disconnected');
        });

        socket.value.on('roomUpdate', (room) => {
            console.log('Room updated:', room);
            // Check if player was promoted to host
            if (room.host === socket.value.id && !isHost.value) {
                isHost.value = true;
                playerColor.value = 'red'; // Host is always red
                showToast('房主已离开，您已成为新房主（红方）');
            }
            // Check if an opponent left
            if (Object.keys(room.players).length < 2 && gameState.playerCount === 2) {
                showToast('蓝方已离开，等待对手加入');
            }
            gameState.players = room.players;
            gameState.playerCount = Object.keys(room.players).length;
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
            // Limit removed for scrollable history
            if (chatMessages.length > 50) chatMessages.shift(); // Keep reasonable limit
        });

        socket.value.on('matchHistory', (history) => {
            matchHistory.splice(0, matchHistory.length, ...history);
        });

        socket.value.on('restartStatus', (status) => {
            restartStatus.value = status;
        });

        socket.value.on('lobbyStats', (stats) => {
            lobbyStats.onlinePlayers = stats.onlinePlayers;
            lobbyStats.idleRooms = stats.idleRooms;
        });

        socket.value.on('singlePlayerRoomCreated', (code) => {
            socket.value.emit('joinRoom', code);
        });

        socket.value.on('error', (msg) => {
            console.error('Socket error:', msg);
            showToast(msg);
        });
    };

    const joinRoom = (code) => {
        if (socket.value && code.length === 6) {
            socket.value.emit('joinRoom', code);
        }
    };

    const joinSinglePlayer = () => {
        if (socket.value) {
            socket.value.emit('joinSinglePlayer');
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
        console.log('useSocket: leaveRoom() invoked');
        try {
            if (socket.value) {
                console.log('useSocket: emitting leaveRoom');
                socket.value.emit('leaveRoom');
            }
        } catch (e) {
            console.error("Error emitting leaveRoom:", e);
        }

        // Always reset state
        console.log('useSocket: Resetting local state...');
        currentRoom.value = null;
        playerColor.value = null;
        isHost.value = false;

        // Deep reset gameState
        gameState.config = null;
        gameState.board = [];
        gameState.players = {};
        gameState.playerCount = 0;
        gameState.stats = { red: 0, blue: 0 };

        chatMessages.splice(0);
        restartStatus.value = [];
        console.log('useSocket: Local state reset. currentRoom:', currentRoom.value);
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

    const toggleReady = () => {
        if (socket.value) {
            socket.value.emit('toggleReady');
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
        lobbyStats,
        restartStatus,
        requestRestart,
        toggleReady,
        joinSinglePlayer,
        toastMessage,
        showToast
    };
}
