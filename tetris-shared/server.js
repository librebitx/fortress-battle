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

const fs = require('fs');
const path = require('path');
const HISTORY_FILE = path.join(__dirname, 'history.json');

// Room Management
const rooms = {}; // roomCode -> Room Instance
let matchHistory = []; // Global recent match records (max 50)
const MAX_HISTORY = 50;

// Load history on start
try {
    if (fs.existsSync(HISTORY_FILE)) {
        const data = fs.readFileSync(HISTORY_FILE, 'utf8');
        matchHistory = JSON.parse(data);
        console.log(`Loaded ${matchHistory.length} history records.`);
    }
} catch (e) {
    console.error('Failed to load history:', e);
    matchHistory = [];
}

function saveHistoryToFile() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(matchHistory, null, 2));
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

function generateRandomLetters(n) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < n; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}

// Tiling Logic
function partitionLine(totalWidth, allowedWidths) {
    // Try multiple times to find a random valid partition
    for (let attempt = 0; attempt < 50; attempt++) {
        let current = 0;
        let line = [];
        while (current < totalWidth) {
            const possible = allowedWidths.filter(w => current + w <= totalWidth);
            if (possible.length === 0) break;
            const w = possible[Math.floor(Math.random() * possible.length)];
            line.push(w);
            current += w;
        }
        if (current === totalWidth) return line;
    }
    // Fallback: fill with smallest unit
    const minW = Math.min(...allowedWidths);
    // If totalWidth is not divisible by minW (shouldn't happen with 20/40 and even inputs), this might be slightly off, but 20/40 are divisible by 2 and 4.
    return Array(Math.floor(totalWidth / minW)).fill(minW);
}

function generateTiling(rows, cols) {
    const rects = [];

    // Define exclusion zone (center 4x4)
    const zoneX = Math.floor(cols / 2) - 2;
    const zoneY = Math.floor(rows / 2) - 2;
    const zoneW = 4;
    const zoneH = 4;

    // Helper to fill a strip at y with height h, covering x range [start, end)
    const fillStrip = (y, h, start, end) => {
        const width = end - start;
        if (width <= 0) return;

        // Adjust allowed widths based on total width available
        let allowed = (h === 4) ? [2, 3, 4] : [4, 5, 6, 8];

        // Filter allowed to ensure we don't pick something larger than total width
        // If width is very small (e.g. < min allowed), we rely on partitionLine fallback
        allowed = allowed.filter(w => w <= width);
        if (allowed.length === 0) {
            // Fallback if space is tiny. 
            if (h === 4 && width < 2) allowed = [width];
            else if (h === 2 && width < 4) allowed = [width];
        }

        const widths = partitionLine(width, allowed);

        let currentX = start;
        for (let w of widths) {
            rects.push({
                x: currentX,
                y: y,
                w: w,
                h: h,
                // Assign a random color index/type for frontend styling
                colorType: Math.floor(Math.random() * 6) // 0-5
            });
            currentX += w;
        }
    };

    let currentRow = 0;
    while (currentRow < rows) {
        // Determine strip height
        let h = 2;

        // If we are approaching zoneY, don't overshoot.
        if (currentRow < zoneY && currentRow + 4 <= zoneY && Math.random() < 0.5) h = 4;
        else if (currentRow < zoneY && currentRow + 2 > zoneY) h = zoneY - currentRow; // Should be 2 or gap fill

        // If inside zone vertical range
        if (currentRow >= zoneY && currentRow < zoneY + zoneH) {
            h = 2; // Keep it fine-grained inside zone rows
            // Force alignment to zoneH ends
            if (currentRow + h > zoneY + zoneH) h = zoneY + zoneH - currentRow;
        } else if (currentRow >= zoneY + zoneH) {
            // Below zone
            if (rows - currentRow >= 4 && Math.random() < 0.5) h = 4;
        }

        // Generate Strips
        if (currentRow >= zoneY && currentRow < zoneY + zoneH) {
            // Split strip: Left of Zone, Right of Zone
            fillStrip(currentRow, h, 0, zoneX);
            fillStrip(currentRow, h, zoneX + zoneW, cols);
        } else {
            // Full strip
            fillStrip(currentRow, h, 0, cols);
        }

        currentRow += h;
    }
    return rects;
}

function broadcastLobbyStats() {
    const clients = io.engine.clientsCount;
    const idleRooms = Object.values(rooms)
        .filter(r => Object.keys(r.players).length < 2)
        .map(r => r.code);
    io.emit('lobbyStats', { onlinePlayers: clients, idleRooms });
}

class Room {
    constructor(code, isSinglePlayer = false) {
        this.code = code;
        this.isSinglePlayer = isSinglePlayer;
        this.rows = DEFAULT_SIZE;
        this.cols = DEFAULT_SIZE;
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.players = {}; // socket.id -> { id, color, piece, name }
        this.playerBags = {};
        this.gameInterval = null;
        this.chatMessages = []; // Quick chat messages
        this.gameConfig = {
            mode: 'score', // Default
            value: 200,    // Default
            startTime: 0,
            active: false,
            winner: null,
            bgRects: [] // Background tiling
        };
        this.restartRequests = new Set(); // Initialize here
        // Initial tiling
        this.gameConfig.bgRects = generateTiling(this.rows, this.cols);
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

        // Validated Spawn Logic
        // 1. Identify Opponent's Direction
        const opponentColor = playerColor === 'red' ? 'blue' : 'red';
        const opponent = Object.values(this.players).find(p => p.color === opponentColor);

        let availableDirs = [0, 1, 2, 3];
        if (opponent && opponent.piece && opponent.piece.dir !== undefined) {
            // Exclude opponent's direction
            availableDirs = availableDirs.filter(d => d !== opponent.piece.dir);
        }

        // 2. Shuffle Directions
        for (let i = availableDirs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableDirs[i], availableDirs[j]] = [availableDirs[j], availableDirs[i]];
        }

        // Common Constants
        const centerX = Math.floor(this.cols / 2);
        const centerY = Math.floor(this.rows / 2);
        const zoneStart = centerX - 2;
        const zoneEnd = centerX + 2;
        const shapeW = shape[0].length;
        const shapeH = shape.length;

        // 3. Find First Valid Non-Overlapping Position
        let finalDir = availableDirs[0];
        let finalSpawn = null;
        let finalDx = 0, finalDy = 0;

        for (const dir of availableDirs) {
            let dx = 0, dy = 0;
            let sx, sy;

            if (dir === 0) { // Up
                dy = -1;
                sx = centerX - Math.floor(shapeW / 2);
                sy = zoneStart;
            } else if (dir === 1) { // Right
                dx = 1;
                sx = zoneEnd - shapeW;
                sy = centerY - Math.floor(shapeH / 2);
            } else if (dir === 2) { // Down
                dy = 1;
                sx = centerX - Math.floor(shapeW / 2);
                sy = zoneEnd - shapeH;
            } else if (dir === 3) { // Left
                dx = -1;
                sx = zoneStart;
                sy = centerY - Math.floor(shapeH / 2);
            }

            // Check Collision with Opponent's Active Piece
            let overlap = false;
            if (opponent && opponent.piece) {
                const oppP = opponent.piece;
                const oppShape = oppP.shape;

                // Compare every block of new piece vs every block of opponent piece
                for (let r = 0; r < shapeH; r++) {
                    for (let c = 0; c < shapeW; c++) {
                        if (shape[r][c]) { // If my block exists
                            const myX = sx + c;
                            const myY = sy + r;

                            // Check against opponent blocks
                            for (let or = 0; or < oppShape.length; or++) {
                                for (let oc = 0; oc < oppShape[or].length; oc++) {
                                    if (oppShape[or][oc]) { // If opp block exists
                                        const oppX = oppP.x + oc;
                                        const oppY = oppP.y + or;
                                        if (myX === oppX && myY === oppY) {
                                            overlap = true;
                                            break;
                                        }
                                    }
                                }
                                if (overlap) break;
                            }
                        }
                        if (overlap) break;
                    }
                    if (overlap) break;
                }
            }

            if (!overlap) {
                finalDir = dir;
                finalSpawn = { x: sx, y: sy };
                finalDx = dx;
                finalDy = dy;
                break; // Found a valid spot!
            }
        }

        // Fallback if all overlapped (unlikely but possible) -> Just use the last one checked or the first available
        if (!finalSpawn) {
            finalDir = availableDirs[0];
            // Re-calculate simply for the chosen one
            if (finalDir === 0) { finalDy = -1; finalSpawn = { x: centerX - Math.floor(shapeW / 2), y: zoneStart }; }
            else if (finalDir === 1) { finalDx = 1; finalSpawn = { x: zoneEnd - shapeW, y: centerY - Math.floor(shapeH / 2) }; }
            else if (finalDir === 2) { finalDy = 1; finalSpawn = { x: centerX - Math.floor(shapeW / 2), y: zoneEnd - shapeH }; }
            else { finalDx = -1; finalSpawn = { x: zoneStart, y: centerY - Math.floor(shapeH / 2) }; }
        }

        return {
            shape: shape,
            x: finalSpawn.x,
            y: finalSpawn.y,
            colorIdx: playerColor === 'red' ? 1 : 2,
            dir: finalDir,
            gravDx: finalDx,
            gravDy: finalDy
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
            this.saveMatchRecord(stats);
        }
    }

    calculateStats() {
        let redCount = 0;
        let blueCount = 0;
        let total = 0;
        let redScore = 0;
        let blueScore = 0;

        // 1. Basic Cell Counting & Perimeter Score
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

        // 2. Area Capture Scoring
        // 8->10, 10->15, 12->20, 16->30
        const scoreMap = { 8: 10, 10: 15, 12: 20, 16: 30 };

        if (this.gameConfig && this.gameConfig.bgRects) {
            for (const rect of this.gameConfig.bgRects) {
                let isRed = true;
                let isBlue = true;

                // Check all cells in this rect
                for (let r = rect.y; r < rect.y + rect.h; r++) {
                    for (let c = rect.x; c < rect.x + rect.w; c++) {
                        // Safety check for bounds
                        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;

                        const val = this.board[r][c];
                        if (val !== 1) isRed = false;
                        if (val !== 2) isBlue = false;
                        if (!isRed && !isBlue) break;
                    }
                    if (!isRed && !isBlue) break;
                }

                if (isRed) {
                    redScore += (scoreMap[rect.w * rect.h] || 0);
                } else if (isBlue) {
                    blueScore += (scoreMap[rect.w * rect.h] || 0);
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
                        console.log('Game Over (Score): Red Wins');
                    } else if (stats.blueScore >= this.gameConfig.value) {
                        this.gameConfig.active = false;
                        this.gameConfig.winner = 'Blue';
                        console.log('Game Over (Score): Blue Wins');
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
            surrender: null, // Reset surrender
            boardSize: this.rows,
            bgRects: generateTiling(this.rows, this.cols)
        };
        this.restartRequests = new Set(); // Track colors requesting restart
        this.startGameLoop();
    }

    saveMatchRecord(stats, surrenderInfo = null) {
        console.log(`[HISTORY] Saving match record for room ${this.code}. Winner: ${this.gameConfig.winner}`);
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
            blueScore: stats.blueScore,
            surrender: surrenderInfo // { surrendered: true, by: 'Blue' }
        };
        matchHistory.unshift(record);
        if (matchHistory.length > MAX_HISTORY) matchHistory.pop();

        saveHistoryToFile();

        // Broadcast updated history to everyone (Lobby + Rooms)
        io.emit('matchHistory', matchHistory.slice(0, 10));
    }
}

function saveHistoryToFile() {
    try {
        console.log(`[HISTORY] Writing ${matchHistory.length} records to file...`);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(matchHistory, null, 2));
        console.log('[HISTORY] File write successful.');
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initial event to confirm connection
    socket.emit('connected');
    socket.emit('matchHistory', matchHistory.slice(0, 10));
    broadcastLobbyStats();

    socket.on('joinSinglePlayer', () => {
        const roomCode = 'SOLO' + generateRandomLetters(2);
        socket.isJoiningSinglePlayer = true;
        // The joinRoom logic will handle the rest
        socket.emit('singlePlayerRoomCreated', roomCode);
    });

    socket.on('joinRoom', (roomCode) => {
        if (!roomCode || roomCode.length !== 6) {
            return;
        }

        // Limit room capacity to 2 (Host + Guest)
        if (rooms[roomCode]) {
            // Lazy Cleanup/Pruning of broken sockets
            const room = rooms[roomCode];
            Object.keys(room.players).forEach(pid => {
                if (!io.sockets.sockets.get(pid)) {
                    console.log(`Pruning stale player ${pid} from room ${roomCode}`);
                    delete room.players[pid];
                }
            });

            // If empty after pruning, delete room to ensure fresh start logic works
            if (Object.keys(room.players).length === 0) {
                delete rooms[roomCode];
            }
        }

        if (rooms[roomCode] && Object.keys(rooms[roomCode].players).length >= 2) {
            console.log(`Rejecting join for ${roomCode}: Room full. Players:`, Object.keys(rooms[roomCode].players));
            socket.emit('error', '房间人数已满 (2/2)');
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
            rooms[roomCode] = new Room(roomCode, socket.isJoiningSinglePlayer || false);
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
        // Send existing chat history to the new player (before adding their join message)
        room.chatMessages.forEach(msg => {
            socket.emit('chatMessage', msg);
        });

        const sysMsg = {
            name: '系统',
            color: 'system',
            text: `${playerName} 加入了房间`,
            time: Date.now()
        };
        room.chatMessages.push(sysMsg);
        if (room.chatMessages.length > 50) room.chatMessages.shift();
        io.to(roomCode).emit('chatMessage', sysMsg);

        // Broadcast update to Room
        io.to(roomCode).emit('roomState', {
            players: room.players,
            config: room.gameConfig,
            playerCount: Object.keys(room.players).length
        });
        broadcastLobbyStats();
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

        // Require at least 2 players (Host + Guest) unless it's single player
        const activePlayers = Object.values(room.players).filter(p => p.color !== 'spectator');
        if (!room.isSinglePlayer && activePlayers.length < 2) {
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

    socket.on('surrender', () => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];

        if (!room.gameConfig.active) return;
        const player = room.players[socket.id];
        if (!player || player.color === 'spectator') return;

        console.log(`Player ${player.color} surrendered in room ${socket.roomCode}`);

        // End Game
        room.gameConfig.active = false;
        const winnerColor = player.color === 'red' ? 'Blue' : 'Red';
        room.gameConfig.winner = winnerColor;

        const stats = room.calculateStats();
        const surrenderInfo = {
            surrendered: true,
            by: player.color === 'red' ? 'Red' : 'Blue',
            type: 'surrender'
        };

        room.saveMatchRecord(stats, surrenderInfo);

        io.to(socket.roomCode).emit('roomState', {
            players: room.players,
            config: room.gameConfig,
            stats: stats
        });

        // Broadcast Game Over with Surrender info handling
        io.to(socket.roomCode).emit('gameOver', {
            winner: winnerColor,
            surrender: surrenderInfo
        });
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

        // Record surrender info
        const surrenderInfo = { surrendered: true, by: player.color === 'red' ? 'Red' : 'Blue' };
        room.gameConfig.surrender = surrenderInfo;

        room.saveMatchRecord(stats, surrenderInfo);
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
        if (room.chatMessages.length > 50) room.chatMessages.shift();
        io.to(socket.roomCode).emit('chatMessage', chatMsg);
    });

    // Leave Room (back to lobby)
    socket.on('leaveRoom', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            const room = rooms[socket.roomCode];
            const oldRoom = socket.roomCode;
            const p = room.players[socket.id];

            if (p) {
                // Clean up restart requests
                room.restartRequests.delete(p.color);
                io.to(oldRoom).emit('restartStatus', Array.from(room.restartRequests));

                if (p.color === 'red') {
                    // Host left
                    const blueId = Object.keys(room.players).find(id => room.players[id].color === 'blue');

                    if (room.gameConfig.active && blueId) {
                        // Game was in progress, treat as surrender/loss
                        room.gameConfig.active = false;
                        room.gameConfig.winner = 'Blue'; // Red left, Blue wins
                        const stats = room.calculateStats();
                        const surrenderInfo = { surrendered: true, by: 'Red', type: 'disconnect' };
                        room.saveMatchRecord(stats, surrenderInfo);

                        // Notify Blue (state update before reset)
                        io.to(blueId).emit('state', { board: room.board, players: room.players, stats, config: room.gameConfig });
                    }

                    if (blueId) {
                        const newHost = room.players[blueId];
                        newHost.color = 'red';
                        newHost.isReady = false; // Host doesn't need ready, but reset state
                        // Reset game state to lobby
                        room.gameConfig.active = false;
                        room.gameConfig.winner = null;
                        room.gameConfig.startTime = 0;
                        room.restartRequests.clear();

                        // Notify
                        const promoMsg = { name: '系统', color: 'system', text: `房主已离开，您已成为新房主（红方）`, time: Date.now() };
                        room.chatMessages.push(promoMsg);
                        io.to(blueId).emit('chatMessage', promoMsg);
                        // Send special event for alert
                        io.to(blueId).emit('rolePromoted', 'red');
                    }
                } else if (p.color === 'blue') {
                    // Guest left, check for Host (Red)
                    const redId = Object.keys(room.players).find(id => room.players[id].color === 'red');

                    if (room.gameConfig.active && redId) {
                        // Game was in progress, treat as surrender/loss
                        room.gameConfig.active = false;
                        room.gameConfig.winner = 'Red'; // Blue left, Red wins
                        const stats = room.calculateStats();
                        const surrenderInfo = { surrendered: true, by: 'Blue', type: 'disconnect' };
                        room.saveMatchRecord(stats, surrenderInfo);

                        // Notify Red (state update before reset)
                        io.to(redId).emit('state', { board: room.board, players: room.players, stats, config: room.gameConfig });
                    }

                    if (redId) {
                        // Reset game state to lobby
                        room.gameConfig.active = false;
                        room.gameConfig.winner = null;
                        room.gameConfig.startTime = 0;
                        room.restartRequests.clear();

                        const alertMsg = { name: '系统', color: 'system', text: `蓝方已离开，等待对手加入`, time: Date.now() };
                        room.chatMessages.push(alertMsg);
                        io.to(redId).emit('chatMessage', alertMsg);
                        // Send special event for alert 
                        io.to(redId).emit('opponentLeft');
                    }
                }

                const sysMsg = { name: '系统', color: 'system', text: `${p.name} 离开了房间`, time: Date.now() };
                room.chatMessages.push(sysMsg);
                if (room.chatMessages.length > 50) room.chatMessages.shift();
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
            broadcastLobbyStats();
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            const room = rooms[socket.roomCode];
            const p = room.players[socket.id];

            if (p) {
                // Clean up restart requests
                room.restartRequests.delete(p.color);
                io.to(socket.roomCode).emit('restartStatus', Array.from(room.restartRequests));

                if (p.color === 'red') {
                    // Host left, check for new host (Blue -> Red)
                    const blueId = Object.keys(room.players).find(id => room.players[id].color === 'blue');

                    if (room.gameConfig.active && blueId) {
                        // Game was in progress, treat as surrender/loss
                        room.gameConfig.active = false;
                        room.gameConfig.winner = 'Blue'; // Red left, Blue wins
                        const stats = room.calculateStats();
                        const surrenderInfo = { surrendered: true, by: 'Red', type: 'disconnect' };
                        room.saveMatchRecord(stats, surrenderInfo);

                        // Notify Blue (state update before reset)
                        io.to(blueId).emit('state', { board: room.board, players: room.players, stats, config: room.gameConfig });
                    }

                    if (blueId) {
                        const newHost = room.players[blueId];
                        newHost.color = 'red';
                        newHost.isReady = false;
                        // Reset game state to lobby
                        room.gameConfig.active = false;
                        room.gameConfig.winner = null;
                        room.gameConfig.startTime = 0;
                        room.restartRequests.clear();

                        // Notify
                        const promoMsg = { name: '系统', color: 'system', text: `房主已离开，您已成为新房主（红方）`, time: Date.now() };
                        room.chatMessages.push(promoMsg);
                        io.to(blueId).emit('chatMessage', promoMsg);
                        // Send special event for alert
                        io.to(blueId).emit('rolePromoted', 'red');
                    }
                } else if (p.color === 'blue') {
                    // Guest left, check for Host (Red)
                    const redId = Object.keys(room.players).find(id => room.players[id].color === 'red');

                    if (room.gameConfig.active && redId) {
                        // Game was in progress, treat as surrender/loss
                        room.gameConfig.active = false;
                        room.gameConfig.winner = 'Red'; // Blue left, Red wins
                        const stats = room.calculateStats();
                        const surrenderInfo = { surrendered: true, by: 'Blue', type: 'disconnect' };
                        room.saveMatchRecord(stats, surrenderInfo);

                        // Notify Red (state update before reset)
                        io.to(redId).emit('state', { board: room.board, players: room.players, stats, config: room.gameConfig });
                    }

                    if (redId) {
                        // Reset game state to lobby
                        room.gameConfig.active = false;
                        room.gameConfig.winner = null;
                        room.gameConfig.startTime = 0;
                        room.restartRequests.clear();

                        const alertMsg = { name: '系统', color: 'system', text: `蓝方已离开，等待对手加入`, time: Date.now() };
                        room.chatMessages.push(alertMsg);
                        io.to(redId).emit('chatMessage', alertMsg);
                        // Send special event for alert 
                        io.to(redId).emit('opponentLeft');
                    }
                }

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
            broadcastLobbyStats();
        }
        broadcastLobbyStats();
    });
});

server.listen(3000, () => {
    console.log('Listening on *:3000');
});
