class Avatar {
    constructor(playerData, avatarData) {
        this.id = playerData.id;
        this.x = playerData.x;
        this.y = playerData.y;
        this.username = playerData.username;
        this.facing = playerData.facing;
        this.isMoving = playerData.isMoving;
        this.animationFrame = playerData.animationFrame || 0;
        this.avatarName = playerData.avatar;
        
        // Pre-load avatar images
        this.images = {};
        if (avatarData && avatarData.frames) {
            this.loadAvatarImages(avatarData.frames);
        }
        
        this.width = 32;  // Default avatar size
        this.height = 32;
    }

    loadAvatarImages(frames) {
        // Load all direction frames
        Object.keys(frames).forEach(direction => {
            this.images[direction] = frames[direction].map(base64Data => {
                const img = new Image();
                img.src = base64Data;
                return img;
            });
        });
    }

    getCurrentImage() {
        if (!this.images[this.facing]) return null;
        const frameIndex = this.animationFrame % this.images[this.facing].length;
        return this.images[this.facing][frameIndex];
    }

    draw(ctx, viewportX, viewportY) {
        const screenX = this.x - viewportX;
        const screenY = this.y - viewportY;
        
        // Draw avatar image
        const img = this.getCurrentImage();
        if (img && img.complete) {
            // Calculate aspect ratio preserving dimensions
            const aspectRatio = img.width / img.height;
            let drawWidth = this.width;
            let drawHeight = this.height;
            
            if (aspectRatio > 1) {
                drawHeight = this.width / aspectRatio;
            } else {
                drawWidth = this.height * aspectRatio;
            }
            
            const offsetX = (this.width - drawWidth) / 2;
            const offsetY = (this.height - drawHeight) / 2;
            
            ctx.drawImage(img, 
                screenX + offsetX, screenY + offsetY, 
                drawWidth, drawHeight
            );
        } else {
            // Fallback: draw a colored circle
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc(screenX + this.width/2, screenY + this.height/2, this.width/2, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw username label
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        const labelY = screenY + this.height + 15;
        ctx.strokeText(this.username, screenX + this.width/2, labelY);
        ctx.fillText(this.username, screenX + this.width/2, labelY);
    }
}

class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.myPlayerId = null;
        this.players = new Map();
        this.avatars = new Map();
        this.viewportX = 0;
        this.viewportY = 0;
        
        // WebSocket
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Movement state
        this.pressedKeys = {up: false, down: false, left: false, right: false};
        this.movementInterval = null;
        this.isMoving = false;
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.setupKeyboardControls();
        this.connectToServer();
    }

    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.updateViewport();
            this.render();
        });
    }

    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.render();
        };
        this.worldImage.src = 'world.jpg';
    }

    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.reconnectAttempts = 0;
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.attemptReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connectToServer();
            }, 2000 * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    joinGame() {
        const message = {
            action: 'join_game',
            username: 'Hieu'
        };
        this.ws.send(JSON.stringify(message));
    }

    handleServerMessage(data) {
        switch (data.action) {
            case 'join_game':
                if (data.success) {
                    this.handleJoinGameResponse(data);
                } else {
                    console.error('Join game failed:', data.error);
                }
                break;
            case 'player_joined':
                this.handlePlayerJoined(data);
                break;
            case 'players_moved':
                this.handlePlayersMoved(data);
                break;
            case 'player_left':
                this.handlePlayerLeft(data);
                break;
            default:
                console.log('Unknown message:', data);
        }
    }

    handleJoinGameResponse(data) {
        this.myPlayerId = data.playerId;
        
        // Store avatar data
        Object.keys(data.avatars).forEach(avatarName => {
            this.avatars.set(avatarName, data.avatars[avatarName]);
        });
        
        // Create player objects
        Object.keys(data.players).forEach(playerId => {
            const playerData = data.players[playerId];
            const avatarData = this.avatars.get(playerData.avatar);
            this.players.set(playerId, new Avatar(playerData, avatarData));
        });
        
        // Center viewport on my avatar
        this.updateViewport();
        this.render();
    }

    handlePlayerJoined(data) {
        const playerData = data.player;
        const avatarData = data.avatar;
        
        this.avatars.set(avatarData.name, avatarData);
        this.players.set(playerData.id, new Avatar(playerData, avatarData));
        
        this.render();
    }

    handlePlayersMoved(data) {
        Object.keys(data.players).forEach(playerId => {
            const playerData = data.players[playerId];
            const player = this.players.get(playerId);
            if (player) {
                player.x = playerData.x;
                player.y = playerData.y;
                player.facing = playerData.facing;
                player.isMoving = playerData.isMoving;
                player.animationFrame = playerData.animationFrame;
            }
        });
        
        this.updateViewport();
        this.render();
    }

    handlePlayerLeft(data) {
        this.players.delete(data.playerId);
        this.render();
    }

    updateViewport() {
        const myPlayer = this.players.get(this.myPlayerId);
        if (!myPlayer) return;
        
        // Center viewport on my avatar
        this.viewportX = myPlayer.x - this.canvas.width / 2;
        this.viewportY = myPlayer.y - this.canvas.height / 2;
        
        // Clamp to map boundaries
        this.viewportX = Math.max(0, Math.min(this.viewportX, this.worldWidth - this.canvas.width));
        this.viewportY = Math.max(0, Math.min(this.viewportY, this.worldHeight - this.canvas.height));
    }

    setupKeyboardControls() {
        // Add keyboard event listeners
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
    }

    handleKeyDown(event) {
        // Prevent default browser behavior for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            event.preventDefault();
        }

        let direction = null;
        switch (event.code) {
            case 'ArrowUp':
                direction = 'up';
                break;
            case 'ArrowDown':
                direction = 'down';
                break;
            case 'ArrowLeft':
                direction = 'left';
                break;
            case 'ArrowRight':
                direction = 'right';
                break;
        }

        if (direction && !this.pressedKeys[direction]) {
            this.pressedKeys[direction] = true;
            this.sendMoveCommand(direction);
            this.startContinuousMovement();
        }
    }

    handleKeyUp(event) {
        let direction = null;
        switch (event.code) {
            case 'ArrowUp':
                direction = 'up';
                break;
            case 'ArrowDown':
                direction = 'down';
                break;
            case 'ArrowLeft':
                direction = 'left';
                break;
            case 'ArrowRight':
                direction = 'right';
                break;
        }

        if (direction) {
            this.pressedKeys[direction] = false;
            this.checkMovementState();
        }
    }

    sendMoveCommand(direction) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const message = {
            action: 'move',
            direction: direction
        };
        this.ws.send(JSON.stringify(message));
    }

    sendStopCommand() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const message = {
            action: 'stop'
        };
        this.ws.send(JSON.stringify(message));
    }

    startContinuousMovement() {
        if (this.movementInterval) return;

        this.movementInterval = setInterval(() => {
            const activeDirections = Object.keys(this.pressedKeys).filter(key => this.pressedKeys[key]);
            if (activeDirections.length > 0) {
                // Send move command for the first active direction
                // In a more complex system, you might handle diagonal movement here
                this.sendMoveCommand(activeDirections[0]);
            }
        }, 100); // Send move command every 100ms while key is held
    }

    stopContinuousMovement() {
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
    }

    checkMovementState() {
        const hasActiveKeys = Object.values(this.pressedKeys).some(pressed => pressed);
        
        if (!hasActiveKeys && this.isMoving) {
            this.isMoving = false;
            this.sendStopCommand();
            this.stopContinuousMovement();
        } else if (hasActiveKeys && !this.isMoving) {
            this.isMoving = true;
        }
    }

    render() {
        if (!this.worldImage) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw world map with viewport offset
        this.ctx.drawImage(
            this.worldImage,
            this.viewportX, this.viewportY, this.canvas.width, this.canvas.height,  // Source rectangle
            0, 0, this.canvas.width, this.canvas.height  // Destination rectangle
        );

        // Draw all players
        this.players.forEach(player => {
            player.draw(this.ctx, this.viewportX, this.viewportY);
        });
    }
}

// Initialize the game when the page loads
window.addEventListener('load', () => {
    new GameClient();
});
