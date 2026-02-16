const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for now
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

// Game Constants
const DEFAULT_SIZE = 40;
const TICK_RATE = 500; // ms

// Tetromino Definitions
const SHAPES = [
    [[1, 1, 1, 1]], // I (cyan)
    [[1, 1], [1, 1]], // O (yellow)
    [[0, 1, 0], [1, 1, 1]], // T (purple)
    [[1, 0, 0], [1, 1, 1]], // L (orange)
    [[0, 0, 1], [1, 1, 1]], // J (blue)
    [[0, 1, 1], [1, 1, 0]], // S (green)
    [[1, 1, 0], [0, 1, 1]]  // Z (red)
];

// Room Management
const rooms = {}; // roomCode -> Room Instance
const matchHistory = []; // Global recent match records (max 50)
const MAX_HISTORY = 50;

function generateRandomLetters(n) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < n; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}

class Room {
    constructor(code) {
        this.code = code;
        this.rows = DEFAULT_SIZE;
        this.cols = DEFAULT_SIZE;
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.players = {}; // socket.id -> { id, color, piece, name }
        this.playerBags = {};
        this.gameInterval = null;
        this.chatMessages = []; // Quick chat messages
        this.gameConfig = {
            mode: 'score', // Default
            value: 500,    // Default
            startTime: 0,
            active: false,
            winner: null
        };
        this.restartRequests = new Set(); // Initialize here
    }

    getNextPiece(playerId) {
        if (!this.playerBags[playerId] || this.playerBags[playerId].length === 0) {
            let bag = [0, 1, 2, 3, 4, 5, 6];
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
            this.playerBags[playerId] = bag;
        }
        return this.playerBags[playerId].pop();
    }

    spawnPiece(playerColor, playerId) {
        let shapeIdx;
        if (playerId) {
            shapeIdx = this.getNextPiece(playerId);
        } else {
            shapeIdx = Math.floor(Math.random() * SHAPES.length);
        }

        const shape = SHAPES[shapeIdx];

        // Omni-Directional Gravity
        const activeDirs = Object.values(this.players)
            .filter(p => p.piece && p.id !== playerId)
            .map(p => p.piece.dir)
            .filter(d => d !== undefined);

        // 0: Up (y--), 1: Right (x++), 2: Down (y++), 3: Left (x--)
        let availableDirs = [0, 1, 2, 3].filter(d => !activeDirs.includes(d));
        if (availableDirs.length === 0) availableDirs = [0, 1, 2, 3];

        const dir = availableDirs[Math.floor(Math.random() * availableDirs.length)];
        let dx = 0, dy = 0;
        if (dir === 0) dy = -1;      // Fall Up
        else if (dir === 1) dx = 1;  // Fall Right
        else if (dir === 2) dy = 1;  // Fall Down
        else if (dir === 3) dx = -1; // Fall Left

        // Consistent spawn position: align leading edge to center zone boundary
        const centerX = Math.floor(this.cols / 2);
        const centerY = Math.floor(this.rows / 2);
        const zoneStart = centerX - 2; // center zone start
        const zoneEnd = centerX + 2;   // center zone end
        const shapeW = shape[0].length;
        const shapeH = shape.length;

        let spawnX, spawnY;
        if (dir === 2) {
            spawnX = centerX - Math.floor(shapeW / 2);
            spawnY = zoneStart;
        } else if (dir === 0) {
            spawnX = centerX - Math.floor(shapeW / 2);
            spawnY = zoneEnd - shapeH;
        } else if (dir === 1) {
            spawnX = zoneStart;
            spawnY = centerY - Math.floor(shapeH / 2);
        } else {
            spawnX = zoneEnd - shapeW;
            spawnY = centerY - Math.floor(shapeH / 2);
        }

        return {
            shape: shape,
            x: spawnX,
            y: spawnY,
            colorIdx: playerColor === 'red' ? 1 : 2,
            dir: dir,
            gravDx: dx,
            gravDy: dy
        };
    }

    isValidMove(piece, dx, dy, newShape) {
        const shape = newShape || piece.shape;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    const newX = piece.x + c + dx;
                    const newY = piece.y + r + dy;
                    if (newX < 0 || newX >= this.cols || newY < 0 || newY >= this.rows) return false;
                    if (this.board[newY][newX]) return false;
                }
            }
        }
        return true;
    }

    rotateMatrix(matrix) {
        return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
    }

    lockPiece(player) {
        const piece = player.piece;
        if (!piece) return;

        for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[r].length; c++) {
                if (piece.shape[r][c]) {
                    const boardY = piece.y + r;
                    const boardX = piece.x + c;
                    if (boardY >= 0 && boardY < this.rows && boardX >= 0 && boardX < this.cols) {
                        this.board[boardY][boardX] = player.color === 'red' ? 1 : 2;
                    }
                }
            }
        }

        // Clear Rows
        for (let r = this.rows - 1; r >= 0; r--) {
            if (this.board[r].every(cell => cell !== 0)) {
                for (let c = 0; c < this.cols; c++) this.board[r][c] = 0;
            }
        }
        // Clear Cols
        for (let c = 0; c < this.cols; c++) {
            let full = true;
            for (let r = 0; r < this.rows; r++) {
                if (this.board[r][c] === 0) { full = false; break; }
            }
            if (full) {
                for (let r = 0; r < this.rows; r++) {
                    this.board[r][c] = 0;
                }
            }
        }

        // Respawn — check if spawn zone is blocked
        const newPiece = this.spawnPiece(player.color, player.id);
        if (this.isValidMove(newPiece, 0, 0)) {
            player.piece = newPiece;
        } else {
            // Spawn zone blocked → end game, judge by score
            player.piece = null;
            const stats = this.calculateStats();
            this.gameConfig.active = false;
            this.gameConfig.winner = stats.redScore > stats.blueScore ? 'Red'
                : (stats.blueScore > stats.redScore ? 'Blue' : 'Draw');
        }
    }

    calculateStats() {
        let redCount = 0;
        let blueCount = 0;
        let total = 0;
        let redScore = 0;
        let blueScore = 0;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const val = this.board[r][c];
                if (val !== 0) {
                    total++;
                    if (val === 1) redCount++;
                    else if (val === 2) blueCount++;

                    // Perimeter Scoring
                    if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
                        if (val === 1) redScore += 5;
                        else if (val === 2) blueScore += 5;
                    }
                }
            }
        }
        return { red: redCount, blue: blueCount, total: total, redScore, blueScore };
    }

    startGameLoop() {
        if (this.gameInterval) return;
        const tickRate = Math.round(TICK_RATE / (this.gameConfig.speed || 1));
        this.gameInterval = setInterval(() => {
            const playerIds = Object.keys(this.players);
            if (playerIds.length === 0) { // Should check active players in THIS room
                clearInterval(this.gameInterval);
                this.gameInterval = null;
                return;
            }

            if (this.gameConfig.active) {
                const stats = this.calculateStats();

                if (this.gameConfig.mode === 'time') {
                    const elapsed = (Date.now() - this.gameConfig.startTime) / 1000;
                    if (elapsed >= this.gameConfig.value) {
                        this.gameConfig.active = false;
                        this.gameConfig.winner = stats.redScore > stats.blueScore ? 'Red' : (stats.blueScore > stats.redScore ? 'Blue' : 'Draw');
                    }
                } else if (this.gameConfig.mode === 'score') {
                    if (stats.redScore >= this.gameConfig.value) {
                        this.gameConfig.active = false;
                        this.gameConfig.winner = 'Red';
                    } else if (stats.blueScore >= this.gameConfig.value) {
                        this.gameConfig.active = false;
                        this.gameConfig.winner = 'Blue';
                    }
                }

                // Save match record when game ends
                if (!this.gameConfig.active && this.gameConfig.winner) {
                    this.saveMatchRecord(stats);
                }

                if (this.gameConfig.active) {
                    playerIds.forEach(id => {
                        const player = this.players[id];
                        if (player.piece) {
                            const dx = player.piece.gravDx || 0;
                            const dy = player.piece.gravDy || 0;
                            if (this.isValidMove(player.piece, dx, dy)) {
                                player.piece.x += dx;
                                player.piece.y += dy;
                            } else {
                                this.lockPiece(player);
                            }
                        }
                    });
                }

                io.to(this.code).emit('state', { board: this.board, players: this.players, stats, config: this.gameConfig });
            } else {
                io.to(this.code).emit('state', { board: this.board, players: this.players, stats: this.calculateStats(), config: this.gameConfig });
            }
        }, tickRate);
    }

    resetGame(config) {
        // Clear existing game loop before starting a new one
        if (this.gameInterval) {
            clearInterval(this.gameInterval);
            this.gameInterval = null;
        }

        // Dynamic board size: time ≤ 3min or score < 200 → 20×20, else 40×40
        const val = parseInt(config.value);
        if ((config.mode === 'time' && val <= 180) || (config.mode === 'score' && val < 200)) {
            this.rows = 20;
            this.cols = 20;
        } else {
            this.rows = DEFAULT_SIZE;
            this.cols = DEFAULT_SIZE;
        }

        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.playerBags = {};
        Object.values(this.players).forEach(p => {
            if (p.color !== 'spectator') {
                p.piece = this.spawnPiece(p.color, p.id);
            }
        });

        const speed = parseFloat(config.speed) || 1;
        this.gameConfig = {
            mode: config.mode,
            value: val,
            speed: speed,
            startTime: Date.now(),
            active: true,
            winner: null,
            boardSize: this.rows
        };
        this.restartRequests = new Set(); // Track colors requesting restart
        this.startGameLoop();
    }

    saveMatchRecord(stats) {
        const players = Object.values(this.players).filter(p => p.color !== 'spectator');
        const redPlayer = players.find(p => p.color === 'red');
        const bluePlayer = players.find(p => p.color === 'blue');
        const record = {
            time: new Date().toISOString(),
            room: this.code,
            mode: this.gameConfig.mode,
            value: this.gameConfig.value,
            winner: this.gameConfig.winner,
            redPlayer: redPlayer?.name || '???',
            bluePlayer: bluePlayer?.name || '???',
            redScore: stats.redScore,
            blueScore: stats.blueScore
        };
        matchHistory.unshift(record);
        if (matchHistory.length > MAX_HISTORY) matchHistory.pop();
        // Broadcast updated history to room
        io.to(this.code).emit('matchHistory', matchHistory.slice(0, 10));
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initial event to confirm connection
    socket.emit('connected');

    socket.on('joinRoom', (roomCode) => {
        if (!roomCode || roomCode.length !== 6) {
            return;
        }

        // Leave existing room if any (basic implementation, maybe not strictly needed if client enforces)
        if (socket.roomCode && rooms[socket.roomCode]) {
            // Cleanup previous room
            delete rooms[socket.roomCode].players[socket.id];
            socket.leave(socket.roomCode);
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;

        if (!rooms[roomCode]) {
            rooms[roomCode] = new Room(roomCode);
        }

        const room = rooms[roomCode];
        const existingPlayers = Object.values(room.players).filter(p => p.color !== 'spectator').length;

        // Role Assignment
        // If 0 players -> Red (Host)
        // If 1 player -> Blue (Guest)
        // Else -> Spectator
        let color = existingPlayers === 0 ? 'red' : (existingPlayers === 1 ? 'blue' : 'spectator');

        // Store player config
        // Generate player name from user-agent or default
        const ua = socket.handshake.headers['user-agent'] || '';
        let deviceModel = 'Player';
        // Try to extract mobile model
        const mobileMatch = ua.match(/\b(iPhone|iPad|SM-[A-Z0-9]+|Pixel[\s0-9]*|Redmi[\s\w]*|HUAWEI[\s\w]*|Mi[\s0-9]+|OPPO[\s\w]*|vivo[\s\w]*|OnePlus[\s\w]*)\b/i);

        if (mobileMatch) {
            deviceModel = mobileMatch[1].trim();
        } else if (/Mobile|Android/i.test(ua)) {
            deviceModel = 'Mobile';
        } else {
            // Desktop OS Detection
            if (/Windows/i.test(ua)) deviceModel = 'Windows';
            else if (/Macintosh|Mac OS/i.test(ua)) deviceModel = 'Mac';
            else if (/Linux/i.test(ua)) deviceModel = 'Linux';
            else deviceModel = 'PC';
        }
        const playerName = deviceModel + '_' + generateRandomLetters(4);

        room.players[socket.id] = {
            id: socket.id,
            color: color,
            name: playerName,
            isReady: false,
            piece: color !== 'spectator' ? room.spawnPiece(color, socket.id) : null
        };

        // Emit Initial State
        socket.emit('init', { id: socket.id, color: color, roomCode: roomCode, isHost: color === 'red', name: playerName });
        // Send recent match history
        socket.emit('matchHistory', matchHistory.slice(0, 10));

        // System Chat Message: Create or Join
        const actionDisplay = existingPlayers === 0 ? '创建' : '加入';
        const sysMsg = {
            name: '系统',
            color: 'system',
            text: `${playerName} ${actionDisplay}了房间`,
            time: Date.now()
        };
        room.chatMessages.push(sysMsg);
        if (room.chatMessages.length > 20) room.chatMessages.shift();
        io.to(roomCode).emit('chatMessage', sysMsg);

        // Broadcast update to Room
        io.to(roomCode).emit('roomState', {
            players: room.players,
            config: room.gameConfig,
            playerCount: Object.keys(room.players).length
        });
    });

    socket.on('toggleReady', () => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];
        const player = room.players[socket.id];

        // Only Guest (Blue) needs to ready up? Or both?
        // Requirement: "Guest can choose ready/cancel ready, only when Guest is ready can Host start"
        // So only non-Host players need to toggle ready.
        if (!player || player.color === 'spectator' || player.color === 'red') return;

        player.isReady = !player.isReady;

        io.to(socket.roomCode).emit('roomState', {
            players: room.players,
            config: room.gameConfig,
            playerCount: Object.keys(room.players).length
        });
    });

    socket.on('updateSettings', (config) => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];

        // Only Host (Red) can update
        if (room.players[socket.id]?.color !== 'red') return;

        // Update config but don't start
        room.gameConfig.mode = config.mode;
        room.gameConfig.value = parseInt(config.value);
        if (config.speed !== undefined) room.gameConfig.speed = parseFloat(config.speed);

        io.to(socket.roomCode).emit('roomState', {
            players: room.players,
            config: room.gameConfig
        });
    });

    socket.on('startGame', (config) => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];

        // Only Host (Red) can start
        if (room.players[socket.id]?.color !== 'red') return;

        // Require at least 2 players (Host + Guest)
        const activePlayers = Object.values(room.players).filter(p => p.color !== 'spectator');
        if (activePlayers.length < 2) {
            console.log('Cannot start: Not enough players');
            return;
        }

        // Check if Guest (Blue) is ready
        const guest = activePlayers.find(p => p.color === 'blue');
        if (guest && !guest.isReady) {
            console.log('Cannot start: Guest not ready');
            return;
        }

        console.log(`Starting game in room ${socket.roomCode}`);
        room.resetGame(config);
    });

    socket.on('action', (action) => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];

        if (!room.gameConfig.active) return;
        const player = room.players[socket.id];
        if (!player || !player.piece) return;

        if (action === 'left' && room.isValidMove(player.piece, -1, 0)) {
            player.piece.x--;
        } else if (action === 'right' && room.isValidMove(player.piece, 1, 0)) {
            player.piece.x++;
        } else if (action === 'down' && room.isValidMove(player.piece, 0, 1)) {
            player.piece.y++;
        } else if (action === 'up' && room.isValidMove(player.piece, 0, -1)) {
            player.piece.y--;
        } else if (action === 'forward') {
            // Move one step in gravity direction
            const dx = player.piece.gravDx || 0;
            const dy = player.piece.gravDy || 0;
            if (room.isValidMove(player.piece, dx, dy)) {
                player.piece.x += dx;
                player.piece.y += dy;
            }
        } else if (action === 'rotate') {
            const rotated = room.rotateMatrix(player.piece.shape);
            if (room.isValidMove(player.piece, 0, 0, rotated)) {
                player.piece.shape = rotated;
            }
        } else if (action === 'drop') {
            const dx = player.piece.gravDx || 0;
            const dy = player.piece.gravDy || 0;
            while (room.isValidMove(player.piece, dx, dy)) {
                player.piece.x += dx;
                player.piece.y += dy;
            }
            room.lockPiece(player);
        }

        io.to(socket.roomCode).emit('state', { board: room.board, players: room.players, stats: room.calculateStats(), config: room.gameConfig });
    });

    // Surrender
    socket.on('surrender', () => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];
        if (!room.gameConfig.active) return;
        const player = room.players[socket.id];
        if (!player || player.color === 'spectator') return;

        room.gameConfig.active = false;
        room.gameConfig.winner = player.color === 'red' ? 'Blue' : 'Red';
        const stats = room.calculateStats();
        room.saveMatchRecord(stats);
        io.to(socket.roomCode).emit('state', { board: room.board, players: room.players, stats, config: room.gameConfig });
    });

    // Request Restart (Guest or Host signals readiness)
    socket.on('requestRestart', () => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];
        const player = room.players[socket.id];
        if (!player || player.color === 'spectator') return;

        room.restartRequests.add(player.color);
        // Broadcast current ready players
        io.to(socket.roomCode).emit('restartStatus', Array.from(room.restartRequests));

        // Check if all active players are ready
        const activeColors = Object.values(room.players)
            .filter(p => p.color !== 'spectator')
            .map(p => p.color);

        const allReady = activeColors.every(c => room.restartRequests.has(c));

        if (allReady && activeColors.length > 0) {
            // Auto-trigger reset logic
            room.gameConfig.active = false;
            room.gameConfig.winner = null;
            room.gameConfig.startTime = 0;
            room.restartRequests.clear();
            io.to(socket.roomCode).emit('restartStatus', []);

            // Reset boards for next game
            room.board = Array(room.rows).fill().map(() => Array(room.cols).fill(0));
            Object.values(room.players).forEach(p => {
                p.piece = null;
            });

            io.to(socket.roomCode).emit('roomState', {
                players: room.players,
                config: room.gameConfig,
                playerCount: Object.keys(room.players).length
            });
            // Emit state to clear board/stats on clients
            io.to(socket.roomCode).emit('state', {
                board: room.board,
                players: room.players,
                stats: room.calculateStats(),
                config: room.gameConfig
            });
        }
    });

    // Reset to Lobby (Return to preparation)
    socket.on('resetToLobby', () => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];

        // Only Host (Red) can reset
        if (room.players[socket.id]?.color !== 'red') return;

        room.gameConfig.active = false;
        room.gameConfig.winner = null;
        room.gameConfig.startTime = 0;
        room.restartRequests.clear(); // Clear requests
        io.to(socket.roomCode).emit('restartStatus', []);

        // Reset boards for next game
        room.board = Array(room.rows).fill().map(() => Array(room.cols).fill(0));
        Object.values(room.players).forEach(p => {
            p.piece = null;
            // Reset stats or bags if needed? 
            // Bags persist. Piece is null until start.
        });

        io.to(socket.roomCode).emit('roomState', {
            players: room.players,
            config: room.gameConfig,
            playerCount: Object.keys(room.players).length
        });
        // Also emit state to clear board on clients currently in game view (though they will switch to lobby)
        io.to(socket.roomCode).emit('state', { board: room.board, players: room.players, stats: room.calculateStats(), config: room.gameConfig });
    });

    // Quick Chat
    socket.on('quickChat', (msg) => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];
        const player = room.players[socket.id];
        if (!player) return;
        const chatMsg = { name: player.name, color: player.color, text: msg, time: Date.now() };
        room.chatMessages.push(chatMsg);
        if (room.chatMessages.length > 20) room.chatMessages.shift();
        io.to(socket.roomCode).emit('chatMessage', chatMsg);
    });

    // Leave Room (back to lobby)
    socket.on('leaveRoom', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            const room = rooms[socket.roomCode];
            const oldRoom = socket.roomCode;

            // Clean up restart requests
            if (room.players[socket.id]) {
                const p = room.players[socket.id];
                room.restartRequests.delete(p.color);
                io.to(oldRoom).emit('restartStatus', Array.from(room.restartRequests));

                // System Chat Message
                const sysMsg = { name: '系统', color: 'system', text: `${p.name} 离开了房间`, time: Date.now() };
                room.chatMessages.push(sysMsg);
                if (room.chatMessages.length > 20) room.chatMessages.shift();
                io.to(oldRoom).emit('chatMessage', sysMsg);
            }

            delete room.players[socket.id];
            socket.leave(oldRoom);
            socket.roomCode = null;

            if (Object.keys(room.players).length === 0) {
                if (room.gameInterval) clearInterval(room.gameInterval);
                delete rooms[oldRoom];
            } else {
                io.to(oldRoom).emit('roomState', {
                    players: room.players,
                    config: room.gameConfig,
                    playerCount: Object.keys(room.players).length
                });
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            const room = rooms[socket.roomCode];

            // Clean up restart requests
            if (room.players[socket.id]) {
                const p = room.players[socket.id];
                room.restartRequests.delete(p.color);
                io.to(socket.roomCode).emit('restartStatus', Array.from(room.restartRequests));

                // System Chat Message
                const sysMsg = { name: '系统', color: 'system', text: `${p.name} 离开了房间`, time: Date.now() };
                room.chatMessages.push(sysMsg);
                if (room.chatMessages.length > 20) room.chatMessages.shift();
                io.to(socket.roomCode).emit('chatMessage', sysMsg);
            }

            delete room.players[socket.id];
            // If room empty? Cleanup
            if (Object.keys(room.players).length === 0) {
                if (room.gameInterval) clearInterval(room.gameInterval);
                delete rooms[socket.roomCode];
            } else {
                // Notify others
                io.to(socket.roomCode).emit('roomState', { players: room.players, config: room.gameConfig });
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Listening on *:3000');
});
