const socket = io(`http://${window.location.hostname}:3000`);
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const infoBar = document.getElementById('info-bar');
const lobby = document.getElementById('lobby-view');
const gameOver = document.getElementById('game-over-overlay');
const winnerText = document.getElementById('winner-text');

// Button Size Slider Logic
const btnSizeInput = document.getElementById('btn-size-input');
const btnSizeVal = document.getElementById('btn-size-val');
btnSizeInput.addEventListener('input', (e) => {
    const val = e.target.value;
    btnSizeVal.textContent = val + '%';
});

// Auto-Scale Board
function resizeBoard() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const baseW = 1200;
    const baseH = 1200;

    // Calculate available space
    // Reserve space for UI (Header ~100px, Footer/Controls ~150px)
    // On mobile, controls are overlay or bottom. Canvas needs to fit in between.
    const uiOverhead = window.innerWidth <= 768 ? 160 : 100; // More for mobile controls? 
    // Actually mobile controls are fixed bottom 20px, height ~180px? 
    // Let's be safe.

    const availableW = window.innerWidth;
    const availableH = window.innerHeight - uiOverhead;

    // Scale to fit
    const scale = Math.min(availableW / baseW, availableH / baseH);

    // Apply CSS dimensions directly to affect layout flow
    canvas.style.width = `${baseW * scale}px`;
    canvas.style.height = `${baseH * scale}px`;

    // Remove transform
    canvas.style.transform = 'none';
    canvas.style.marginTop = '0px'; // Flexbox/Flow will handle position
}

window.addEventListener('resize', resizeBoard);
resizeBoard(); // Init

// UI Controls
document.getElementById('start-btn').addEventListener('click', () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    let value = 0;
    if (mode === 'time') {
        value = parseInt(document.getElementById('time-input').value) * 60; // Convert mins to seconds
    } else {
        value = parseInt(document.getElementById('score-input').value);
    }

    // Apply Button Size locally
    const btnScale = parseInt(btnSizeInput.value) / 100;
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) {
        mobileControls.style.transform = `translateX(-50%) scale(${btnScale})`;
        mobileControls.style.transformOrigin = 'bottom center';
    }

    // Trigger Resize
    resizeBoard();

    socket.emit('startGame', { mode, value });
});

document.getElementById('restart-btn').addEventListener('click', () => {
    lobby.style.display = 'flex'; // Lobby is now flex container
    document.getElementById('game-view').style.display = 'none';
});

const BLOCK_SIZE = 30; // Fits 40x40 in 1200x1200
const ROWS = 40;
const COLS = 40;

let myId = null;
let myColor = null;

socket.on('init', (data) => {
    myId = data.id;
    myColor = data.color;
});

socket.on('state', (state) => {
    draw(state);
    updateStats(state.stats);
    updateGameStatus(state.config);
});

function updateGameStatus(config) {
    if (!config) return;

    if (config.active) {
        lobby.style.display = 'none';
        document.getElementById('game-view').style.display = 'block';
        resizeBoard(); // Ensure size is correct when showing
        gameOver.style.display = 'none';

        if (config.mode === 'time') {
            const elapsed = Math.floor((Date.now() - config.startTime) / 1000);
            const remaining = Math.max(0, config.value - elapsed);
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            infoBar.textContent = `Time Remaining: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
        } else {
            infoBar.textContent = `Target Score: ${config.value}`;
        }
    } else if (config.winner) {
        lobby.style.display = 'none';
        document.getElementById('game-view').style.display = 'block'; // Keep game visible
        gameOver.style.display = 'block'; // Show overlay
        winnerText.textContent = `${config.winner} Wins!`;
        infoBar.textContent = "Game Over";
    } else {
        // Lobby state
        lobby.style.display = 'flex';
        document.getElementById('game-view').style.display = 'none';
    }
}

function updateStats(stats) {
    if (!stats) return;
    const total = stats.red + stats.blue || 1; // Avoid divide by zero
    const redPct = (stats.red / total) * 100;
    const bluePct = (stats.blue / total) * 100;

    document.getElementById('territory-bar-red').style.width = `${redPct}%`;
    document.getElementById('territory-bar-blue').style.width = `${bluePct}%`;
    document.getElementById('territory-text').textContent =
        `Red: ${stats.red} (${Math.round(redPct)}%) | Blue: ${stats.blue} (${Math.round(bluePct)}%)`;
}

function draw(state) {
    // Clear
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Faint)
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * BLOCK_SIZE, 0);
        ctx.lineTo(c * BLOCK_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * BLOCK_SIZE);
        ctx.lineTo(canvas.width, r * BLOCK_SIZE);
        ctx.stroke();
    }

    // Draw Spawn Zone Highlight (Center 4x4)
    // Rows 18-21, Cols 18-21 (indices 18, 19, 20, 21)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(18 * BLOCK_SIZE, 18 * BLOCK_SIZE, 4 * BLOCK_SIZE, 4 * BLOCK_SIZE);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeRect(18 * BLOCK_SIZE, 18 * BLOCK_SIZE, 4 * BLOCK_SIZE, 4 * BLOCK_SIZE);

    // Draw Board
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (state.board[r][c]) {
                const val = state.board[r][c];
                ctx.fillStyle = val === 1 ? '#aa0000' : '#0000aa'; // Darker for static
                ctx.fillRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                ctx.strokeStyle = '#222';
                ctx.strokeRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            }
        }
    }

    // Draw Active Pieces
    Object.values(state.players).forEach(player => {
        if (!player.piece) return;

        ctx.fillStyle = player.color === 'red' ? '#ff5555' : '#5555ff'; // Brighter for active

        // Ghost piece logic could go here later

        const shape = player.piece.shape;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    const x = (player.piece.x + c) * BLOCK_SIZE;
                    const y = (player.piece.y + r) * BLOCK_SIZE;
                    ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
                    ctx.strokeStyle = '#fff';
                    ctx.strokeRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        }
    });

    // Grid drawn at start
}

// Mobile Controls
const bindControl = (id, action) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const trigger = (e) => {
        e.preventDefault();
        // Since we don't have activeGame boolean exposed here easily (it's inside updateGameStatus logic mostly), 
        // we can check if game-view is visible or just rely on server to ignore if not active.
        // Server already checks gameConfig.active.
        socket.emit('action', action);
    };
    btn.addEventListener('touchstart', trigger, { passive: false });
    btn.addEventListener('mousedown', trigger);
};

bindControl('btn-left', 'left');
bindControl('btn-right', 'right');
bindControl('btn-down', 'down');
bindControl('btn-rotate', 'rotate');
bindControl('btn-drop', 'drop');

// Controls
document.addEventListener('keydown', (e) => {
    if (myColor === 'spectator') return;

    if (myColor === 'red') {
        // Player 1: WASD
        switch (e.code) {
            case 'KeyA':
                socket.emit('action', 'left');
                break;
            case 'KeyD':
                socket.emit('action', 'right');
                break;
            case 'KeyS':
                socket.emit('action', 'down');
                break;
            case 'KeyW':
                socket.emit('action', 'rotate');
                break;
            case 'Space':
                socket.emit('action', 'drop');
                break;
        }
    } else if (myColor === 'blue') {
        // Player 2: Arrows
        switch (e.code) {
            case 'ArrowLeft':
                socket.emit('action', 'left');
                break;
            case 'ArrowRight':
                socket.emit('action', 'right');
                break;
            case 'ArrowDown':
                socket.emit('action', 'down');
                break;
            case 'ArrowUp':
                socket.emit('action', 'rotate');
                break;
            case 'Space': // Both can use space for drop? Or maybe Enter for Blue?
                // User didn't specify Drop key, assuming Space is fine or maybe Enter.
                // Let's keep Space for both for now unless it conflicts locally.
                socket.emit('action', 'drop');
                break;
            case 'Enter': // Alternative for Blue
                socket.emit('action', 'drop');
                break;
        }
    }
});
