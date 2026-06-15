const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

class VRServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            },
            pingInterval: 10000,
            pingTimeout: 5000,
            transports: ['websocket', 'polling'],
            perMessageDeflate: {
                threshold: 1024
            }
        });

        this.sessions = new Map();
        this.players = new Map();
        this.statistics = {
            totalConnections: 0,
            totalSessions: 0,
            messagesProcessed: 0,
            startTime: Date.now()
        };

        this.latencyStats = new Map();
        this.tickRate = 60;
        this.tickInterval = null;

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.startServer();
        this.startServerTick();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json({ limit: '1mb' }));
        this.app.use(express.static(path.join(__dirname, '../../dist')));

        this.app.use((req, res, next) => {
            console.log(`[HTTP] ${req.method} ${req.url}`);
            next();
        });
    }

    setupRoutes() {
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                uptime: Date.now() - this.statistics.startTime,
                sessions: this.sessions.size,
                players: this.players.size,
                statistics: this.statistics,
                avgLatency: this.calculateAverageLatency()
            });
        });

        this.app.get('/api/sessions', (req, res) => {
            const sessions = [];
            for (const [sessionId, session] of this.sessions) {
                sessions.push({
                    id: sessionId,
                    name: session.name,
                    createdAt: session.createdAt,
                    players: Array.from(session.players.values()).map(p => ({
                        id: p.id,
                        name: p.name,
                        role: p.role,
                        color: p.color
                    })),
                    settings: session.settings,
                    maxPlayers: session.maxPlayers
                });
            }
            res.json({ sessions });
        });

        this.app.post('/api/sessions', (req, res) => {
            const { name = '训练房', maxPlayers = 8, settings = {} } = req.body;
            const sessionId = this.generateSessionId();

            const session = this.createSession(sessionId, { name, maxPlayers, settings });
            this.sessions.set(sessionId, session);

            console.log(`[Session] 创建训练房: ${sessionId} (${name})`);
            res.json({ success: true, sessionId, session });
        });

        this.app.delete('/api/sessions/:sessionId', (req, res) => {
            const { sessionId } = req.params;
            if (this.sessions.has(sessionId)) {
                this.closeSession(sessionId);
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, error: 'Session not found' });
            }
        });

        this.app.get('/api/sessions/:sessionId/latency', (req, res) => {
            const { sessionId } = req.params;
            const session = this.sessions.get(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const latencies = [];
            for (const playerId of session.players.keys()) {
                const stats = this.latencyStats.get(playerId);
                if (stats) {
                    latencies.push({
                        playerId,
                        avg: stats.average,
                        min: stats.min,
                        max: stats.max,
                        samples: stats.samples
                    });
                }
            }
            res.json({ sessionId, latencies });
        });

        this.app.get('*', (req, res) => {
            const distPath = path.join(__dirname, '../../dist/index.html');
            res.sendFile(distPath, (err) => {
                if (err) {
                    res.status(404).send('VR跳高训练模拟器服务运行中');
                }
            });
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.statistics.totalConnections++;
            console.log(`[Socket] 新连接: ${socket.id}`);

            const playerId = socket.id;
            const player = {
                id: playerId,
                socket: socket,
                name: `运动员${Math.floor(Math.random() * 1000)}`,
                role: 'athlete',
                color: this.generateRandomColor(),
                sessionId: null,
                joinedAt: Date.now(),
                lastState: null,
                lastStateTime: 0
            };

            this.players.set(playerId, player);
            this.latencyStats.set(playerId, {
                history: [],
                average: 0,
                min: Infinity,
                max: 0,
                samples: 0,
                lastPing: null
            });

            socket.on('ping:server', (data) => {
                socket.emit('pong:server', {
                    clientTime: data?.clientTime || Date.now(),
                    serverTime: Date.now(),
                    seq: data?.seq || 0
                });
                this.recordLatency(playerId, Date.now() - (data?.clientTime || Date.now()));
            });

            socket.on('latency:report', (report) => {
                if (report && typeof report.latency === 'number') {
                    this.recordLatency(playerId, report.latency);
                }
            });

            socket.on('session:join', (data) => {
                this.handleJoinSession(socket, player, data);
            });

            socket.on('session:leave', () => {
                this.handleLeaveSession(player);
            });

            socket.on('player:update', (state) => {
                this.handlePlayerUpdate(player, state);
            });

            socket.on('action:data', (data) => {
                this.handleActionData(player, data);
                this.statistics.messagesProcessed++;
            });

            socket.on('chat:message', (data) => {
                this.handleChatMessage(player, data);
            });

            socket.on('coach:annotation', (data) => {
                this.handleCoachAnnotation(player, data);
            });

            socket.on('coach:command', (data) => {
                this.handleCoachCommand(player, data);
            });

            socket.on('setting:barHeight', (data) => {
                this.handleBarHeightChange(player, data);
            });

            socket.on('voice:chat', (data) => {
                this.handleVoiceData(player, data);
            });

            socket.on('replay:save', (data) => {
                this.handleReplaySave(player, data);
            });

            socket.on('disconnect', () => {
                console.log(`[Socket] 断开连接: ${socket.id}`);
                this.handleLeaveSession(player);
                this.players.delete(playerId);
                this.latencyStats.delete(playerId);
            });

            socket.emit('player:init', {
                playerId,
                name: player.name,
                role: player.role,
                color: player.color,
                serverTime: Date.now()
            });
        });
    }

    createSession(sessionId, options) {
        return {
            id: sessionId,
            name: options.name || '训练房',
            maxPlayers: options.maxPlayers || 8,
            settings: {
                barHeight: 5.0,
                ...options.settings
            },
            players: new Map(),
            coaches: new Set(),
            history: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
            tickData: {}
        };
    }

    handleJoinSession(socket, player, data) {
        const { sessionId, name, role = 'athlete', settings = {} } = data || {};

        if (!sessionId) {
            socket.emit('error:message', { message: '缺少会话ID' });
            return;
        }

        if (player.sessionId && player.sessionId !== sessionId) {
            this.handleLeaveSession(player);
        }

        let session = this.sessions.get(sessionId);
        if (!session) {
            session = this.createSession(sessionId, {
                name: `训练房 ${sessionId.slice(0, 4)}`,
                settings
            });
            this.sessions.set(sessionId, session);
            this.statistics.totalSessions++;
        }

        if (session.players.size >= session.maxPlayers && role === 'athlete') {
            socket.emit('error:message', { message: '训练房已满' });
            return;
        }

        if (name) player.name = name;
        player.role = role;
        if (role === 'coach') {
            session.coaches.add(player.id);
            player.color = 0xffd700;
        }
        player.sessionId = sessionId;
        player.lastState = null;

        session.players.set(player.id, {
            id: player.id,
            name: player.name,
            role: player.role,
            color: player.color,
            joinedAt: Date.now()
        });
        session.lastActivity = Date.now();

        const playerList = [];
        for (const [pid, p] of session.players) {
            if (pid !== player.id) {
                playerList.push({
                    id: p.id,
                    name: p.name,
                    role: p.role,
                    color: p.color,
                    position: session.tickData[pid]?.position || null,
                    rotation: session.tickData[pid]?.rotation || null
                });
            }
        }

        socket.emit('session:joined', {
            sessionId: session.id,
            sessionName: session.name,
            playerId: player.id,
            role: player.role,
            name: player.name,
            color: player.color,
            players: playerList,
            settings: session.settings,
            serverTime: Date.now()
        });

        socket.to(sessionId).emit('player:joined', {
            id: player.id,
            name: player.name,
            role: player.role,
            color: player.color
        });

        socket.join(sessionId);

        console.log(`[Session] ${player.name}(${player.role}) 加入 ${sessionId}, 当前 ${session.players.size} 人`);
    }

    handleLeaveSession(player) {
        if (!player.sessionId) return;

        const session = this.sessions.get(player.sessionId);
        if (session) {
            session.players.delete(player.id);
            session.coaches.delete(player.id);
            delete session.tickData[player.id];

            this.io.to(player.sessionId).emit('player:left', {
                id: player.id,
                name: player.name
            });

            if (session.players.size === 0) {
                setTimeout(() => {
                    if (session.players.size === 0) {
                        this.closeSession(player.sessionId);
                    }
                }, 60000);
            }

            console.log(`[Session] ${player.name} 离开 ${player.sessionId}, 剩余 ${session.players.size} 人`);
        }

        player.sessionId = null;
        if (player.socket) {
            player.socket.leave(player.sessionId);
        }
    }

    handlePlayerUpdate(player, state) {
        if (!player.sessionId) return;

        const session = this.sessions.get(player.sessionId);
        if (!session) return;

        player.lastState = state;
        player.lastStateTime = Date.now();
        session.lastActivity = Date.now();

        session.tickData[player.id] = {
            position: state.position,
            rotation: state.rotation,
            phase: state.phase,
            velocity: state.velocity,
            timestamp: Date.now()
        };

        player.socket.to(player.sessionId).emit('player:update', {
            id: player.id,
            ...state,
            serverTime: Date.now()
        });
    }

    handleActionData(player, data) {
        if (!player.sessionId) return;

        const session = this.sessions.get(player.sessionId);
        if (!session) return;
        session.lastActivity = Date.now();

        if (session.history.length < 10000) {
            session.history.push({
                playerId: player.id,
                timestamp: Date.now(),
                type: 'action',
                data
            });
        }

        player.socket.to(player.sessionId).emit('action:broadcast', {
            id: player.id,
            role: player.role,
            name: player.name,
            ...data,
            serverTime: Date.now()
        });
    }

    handleChatMessage(player, data) {
        if (!player.sessionId || !data?.message) return;

        this.io.to(player.sessionId).emit('chat:message', {
            id: player.id,
            name: player.name,
            role: player.role,
            message: data.message,
            timestamp: Date.now()
        });
    }

    handleCoachAnnotation(player, data) {
        if (!player.sessionId) return;
        if (player.role !== 'coach') {
            player.socket.emit('error:message', { message: '仅教练可使用标注功能' });
            return;
        }

        this.io.to(player.sessionId).emit('coach:annotation', {
            coachId: player.id,
            coachName: player.name,
            ...data,
            timestamp: Date.now()
        });
    }

    handleCoachCommand(player, data) {
        if (!player.sessionId) return;
        if (player.role !== 'coach') {
            player.socket.emit('error:message', { message: '仅教练可发送指令' });
            return;
        }

        if (data.targetPlayerId) {
            const targetPlayer = this.players.get(data.targetPlayerId);
            if (targetPlayer?.socket) {
                targetPlayer.socket.emit('coach:command', {
                    coachId: player.id,
                    coachName: player.name,
                    ...data
                });
            }
        } else {
            this.io.to(player.sessionId).emit('coach:command', {
                coachId: player.id,
                coachName: player.name,
                ...data
            });
        }
    }

    handleBarHeightChange(player, data) {
        if (!player.sessionId) return;

        const session = this.sessions.get(player.sessionId);
        if (!session) return;

        if (player.role !== 'coach') {
            player.socket.emit('error:message', { message: '仅教练可调整杆高' });
            return;
        }

        const newHeight = Math.max(2.0, Math.min(6.5, parseFloat(data.height) || 5.0));
        session.settings.barHeight = newHeight;

        this.io.to(player.sessionId).emit('setting:barHeight', {
            height: newHeight,
            changedBy: player.id,
            changedByName: player.name,
            timestamp: Date.now()
        });
    }

    handleVoiceData(player, data) {
        if (!player.sessionId) return;

        player.socket.to(player.sessionId).emit('voice:data', {
            id: player.id,
            name: player.name,
            role: player.role,
            audioData: data.audioData,
            timestamp: Date.now()
        });
    }

    handleReplaySave(player, data) {
        const replayId = this.generateSessionId() + '_replay';
        console.log(`[Replay] ${player.name} 保存回放: ${replayId}`);

        if (player.socket) {
            player.socket.emit('replay:saved', {
                replayId,
                timestamp: Date.now()
            });
        }
    }

    closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.io.to(sessionId).emit('session:closed', {
                sessionId,
                timestamp: Date.now()
            });

            for (const [playerId, pData] of session.players) {
                const player = this.players.get(playerId);
                if (player) {
                    player.sessionId = null;
                }
            }

            this.sessions.delete(sessionId);
            console.log(`[Session] 关闭训练房: ${sessionId}`);
        }
    }

    startServerTick() {
        this.tickInterval = setInterval(() => {
            for (const [sessionId, session] of this.sessions) {
                if (session.players.size > 1 && Object.keys(session.tickData).length > 0) {
                    this.io.to(sessionId).emit('tick:sync', {
                        serverTime: Date.now(),
                        tick: Date.now() % 1000000,
                        states: session.tickData
                    });
                }
            }
        }, 1000 / this.tickRate);
    }

    recordLatency(playerId, latency) {
        const stats = this.latencyStats.get(playerId);
        if (!stats) return;

        latency = Math.max(0, Math.min(1000, Math.abs(latency)));

        stats.history.push({
            time: Date.now(),
            value: latency
        });

        if (stats.history.length > 100) {
            stats.history.shift();
        }

        if (stats.history.length > 0) {
            const values = stats.history.map(h => h.value);
            stats.average = values.reduce((a, b) => a + b, 0) / values.length;
            stats.min = Math.min(...values);
            stats.max = Math.max(...values);
            stats.samples = values.length;
        }
    }

    calculateAverageLatency() {
        let total = 0;
        let count = 0;
        for (const stats of this.latencyStats.values()) {
            if (stats.average > 0) {
                total += stats.average;
                count++;
            }
        }
        return count > 0 ? Math.round(total / count) : 0;
    }

    generateSessionId() {
        return crypto.randomBytes(6).toString('hex');
    }

    generateRandomColor() {
        const colors = [
            0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
            0x1abc9c, 0xe67e22, 0x34495e, 0x16a085, 0xd35400
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    startServer() {
        this.server.listen(PORT, '0.0.0.0', () => {
            console.log('====================================');
            console.log('  VR跳高训练模拟器 - 多人同步服务');
            console.log(`  服务地址: http://localhost:${PORT}`);
            console.log(`  WebSocket: 已启用 (${this.tickRate}Hz同步)`);
            console.log(`  启动时间: ${new Date().toLocaleString()}`);
            console.log('====================================');
        });

        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`[Server] 端口 ${PORT} 已被占用`);
            } else {
                console.error('[Server] 启动错误:', error);
            }
        });
    }

    shutdown() {
        console.log('[Server] 正在关闭服务器...');

        if (this.tickInterval) {
            clearInterval(this.tickInterval);
        }

        for (const [sessionId] of this.sessions) {
            this.closeSession(sessionId);
        }

        this.io.close(() => {
            this.server.close(() => {
                console.log('[Server] 服务器已关闭');
                process.exit(0);
            });
        });

        setTimeout(() => {
            console.error('[Server] 超时强制关闭');
            process.exit(1);
        }, 10000);
    }
}

const vrServer = new VRServer();

process.on('SIGINT', () => vrServer.shutdown());
process.on('SIGTERM', () => vrServer.shutdown());
process.on('uncaughtException', (err) => {
    console.error('[Server] 未捕获异常:', err);
    vrServer.shutdown();
});

module.exports = VRServer;
