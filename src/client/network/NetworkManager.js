import { io } from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
    constructor(config) {
        this.config = config;
        this.networkConfig = config.getNetworkConfig();
        this.socket = null;
        this.connected = false;
        this.sessionId = null;
        this.playerId = null;
        this.playerName = '';
        this.role = 'athlete';
        this.color = 0x3498db;

        this.sceneManager = null;
        this.uiManager = null;

        this.latency = 0;
        this.latencyHistory = [];
        this.latencyMaxSamples = 30;
        this.pingInterval = null;
        this.lastPingTime = 0;
        this.pingSeq = 0;

        this.lastSendTime = 0;
        this.sendInterval = 1000 / config.network.tickRate;
        this.cachedState = null;

        this.packetStats = {
            sent: 0,
            received: 0,
            lost: 0,
            bytesSent: 0,
            bytesReceived: 0
        };

        this.remoteStates = new Map();
        this.interpolationBuffer = new Map();
        this.bufferSize = 3;

        this.eventListeners = new Map();

        this.jitterBuffer = [];
        this.serverTimeOffset = 0;
    }

    setSceneManager(manager) {
        this.sceneManager = manager;
    }

    setUIManager(manager) {
        this.uiManager = manager;
    }

    async connect(customUrl = null) {
        const url = customUrl || this.networkConfig.serverUrl;

        return new Promise((resolve, reject) => {
            try {
                this.socket = io(url, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    autoConnect: true
                });

                this.socket.on('connect', () => {
                    this.connected = true;
                    console.log('[NetworkManager] 已连接到服务器:', url);
                    this.startLatencyMonitoring();
                    this.emit('connected', { playerId: this.socket.id });
                });

                this.socket.on('disconnect', (reason) => {
                    this.connected = false;
                    this.stopLatencyMonitoring();
                    this.sessionId = null;
                    this.playerId = null;
                    this.remoteStates.clear();
                    this.interpolationBuffer.clear();
                    console.warn('[NetworkManager] 连接断开:', reason);
                    this.emit('disconnected', { reason });

                    if (this.sceneManager) {
                        for (const [pid] of this.sceneManager.remotePlayers) {
                            this.sceneManager.removeRemotePlayer(pid);
                        }
                    }
                });

                this.socket.on('connect_error', (error) => {
                    console.error('[NetworkManager] 连接错误:', error.message);
                    reject(error);
                });

                this.socket.on('player:init', (data) => {
                    this.playerId = data.playerId;
                    this.playerName = data.name;
                    this.color = data.color;
                    this.serverTimeOffset = Date.now() - data.serverTime;
                    console.log('[NetworkManager] 初始化完成, 玩家ID:', this.playerId);
                    resolve(data);
                });

                this.setupEventHandlers();

            } catch (error) {
                console.error('[NetworkManager] 创建Socket失败:', error);
                reject(error);
            }
        });
    }

    setupEventHandlers() {
        this.socket.on('pong:server', (data) => {
            const now = Date.now();
            const rtt = now - (data.clientTime || now);
            const oneWay = Math.round(rtt / 2);
            this.recordLatency(oneWay);
            this.serverTimeOffset = (now + (data.clientTime || now)) / 2 - data.serverTime;
            this.packetStats.received++;
        });

        this.socket.on('session:joined', (data) => {
            this.sessionId = data.sessionId;
            this.role = data.role;
            this.playerName = data.name;
            this.color = data.color;
            console.log(`[NetworkManager] 加入会话 ${data.sessionId} (${data.sessionName})`);

            if (this.sceneManager) {
                for (const player of data.players) {
                    this.sceneManager.addRemotePlayer(player.id, player);
                }
            }

            this.emit('sessionJoined', data);
            if (this.uiManager) {
                this.uiManager.onSessionJoined(data);
            }
        });

        this.socket.on('session:closed', (data) => {
            console.warn('[NetworkManager] 会话已关闭:', data.sessionId);
            this.sessionId = null;
            this.emit('sessionClosed', data);
            if (this.uiManager) {
                this.uiManager.onSessionClosed(data);
            }
        });

        this.socket.on('player:joined', (data) => {
            console.log(`[NetworkManager] 玩家加入: ${data.name} (${data.role})`);
            if (this.sceneManager) {
                this.sceneManager.addRemotePlayer(data.id, data);
            }
            this.emit('playerJoined', data);
        });

        this.socket.on('player:left', (data) => {
            console.log(`[NetworkManager] 玩家离开: ${data.name}`);
            if (this.sceneManager) {
                this.sceneManager.removeRemotePlayer(data.id);
            }
            this.remoteStates.delete(data.id);
            this.interpolationBuffer.delete(data.id);
            this.emit('playerLeft', data);
        });

        this.socket.on('player:update', (data) => {
            this.packetStats.received++;
            const playerId = data.id;
            const stateTime = data.serverTime || Date.now();

            if (!this.interpolationBuffer.has(playerId)) {
                this.interpolationBuffer.set(playerId, []);
            }
            const buffer = this.interpolationBuffer.get(playerId);
            buffer.push({ state: data, time: stateTime });

            while (buffer.length > this.bufferSize * 2) {
                buffer.shift();
            }

            this.remoteStates.set(playerId, data);

            if (this.config.network.interpolation && this.sceneManager) {
            } else if (this.sceneManager) {
                this.sceneManager.updateRemotePlayer(playerId, data);
            }
        });

        this.socket.on('tick:sync', (data) => {
            this.packetStats.received++;
            for (const [playerId, state] of Object.entries(data.states)) {
                if (playerId === this.playerId) continue;

                if (this.config.network.interpolation && this.sceneManager) {
                    if (!this.interpolationBuffer.has(playerId)) {
                        this.interpolationBuffer.set(playerId, []);
                    }
                    const buffer = this.interpolationBuffer.get(playerId);
                    buffer.push({ state, time: data.serverTime });

                    while (buffer.length > this.bufferSize * 3) {
                        buffer.shift();
                    }
                } else if (this.sceneManager) {
                    this.sceneManager.updateRemotePlayer(playerId, state);
                }
            }
        });

        this.socket.on('action:broadcast', (data) => {
            this.packetStats.received++;
            this.emit('actionData', data);
        });

        this.socket.on('chat:message', (data) => {
            this.emit('chatMessage', data);
            if (this.uiManager) {
                this.uiManager.onChatMessage(data);
            }
        });

        this.socket.on('coach:annotation', (data) => {
            this.emit('coachAnnotation', data);
            if (this.sceneManager) {
                const pos = new THREE.Vector3(
                    data.position?.x || 0,
                    data.position?.y || 0,
                    data.position?.z || 0
                );
                this.sceneManager.addAnnotation(pos, data.text || '', data.color || 0xffff00);
            }
        });

        this.socket.on('coach:command', (data) => {
            this.emit('coachCommand', data);
            if (this.uiManager) {
                this.uiManager.onCoachCommand(data);
            }
        });

        this.socket.on('setting:barHeight', (data) => {
            console.log(`[NetworkManager] 杆高调整为 ${data.height}m (由 ${data.changedByName})`);
            if (this.sceneManager) {
                this.sceneManager.setBarHeight(data.height);
            }
            this.config.setBarHeight(data.height);
            this.emit('barHeightChanged', data);
            if (this.uiManager) {
                this.uiManager.onBarHeightChanged(data);
            }
        });

        this.socket.on('voice:data', (data) => {
            this.emit('voiceData', data);
        });

        this.socket.on('replay:saved', (data) => {
            this.emit('replaySaved', data);
        });

        this.socket.on('error:message', (data) => {
            console.error('[NetworkManager] 服务器错误:', data.message);
            this.emit('error', data);
            if (this.uiManager) {
                this.uiManager.showError(data.message);
            }
        });
    }

    async joinSession(sessionId, role = 'athlete', name = null) {
        if (!this.connected) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('加入会话超时'));
            }, 10000);

            const handler = (data) => {
                clearTimeout(timeout);
                this.off('sessionJoined', handler);
                resolve(data);
            };

            this.on('sessionJoined', handler);

            this.socket.emit('session:join', {
                sessionId,
                name: name || this.playerName || `运动员${Math.floor(Math.random() * 1000)}`,
                role
            });
        });
    }

    leaveSession() {
        if (this.sessionId && this.socket) {
            this.socket.emit('session:leave');
            this.sessionId = null;

            if (this.sceneManager) {
                for (const [pid] of this.sceneManager.remotePlayers) {
                    this.sceneManager.removeRemotePlayer(pid);
                }
            }
            this.remoteStates.clear();
            this.interpolationBuffer.clear();

            this.emit('sessionLeft');
        }
    }

    broadcastPlayerState(state) {
        if (!this.connected || !this.sessionId) return;

        const now = Date.now();
        if (now - this.lastSendTime < this.sendInterval) return;
        this.lastSendTime = now;

        this.cachedState = state;

        try {
            this.socket.emit('player:update', {
                position: state.position,
                rotation: state.rotation,
                phase: state.phase,
                velocity: state.velocity,
                timestamp: now
            });
            this.packetStats.sent++;
        } catch (e) {
            console.warn('[NetworkManager] 发送状态失败:', e);
        }
    }

    broadcastActionData(analysisData) {
        if (!this.connected || !this.sessionId) return;

        try {
            this.socket.emit('action:data', analysisData);
            this.packetStats.sent++;
        } catch (e) {
            console.warn('[NetworkManager] 发送动作数据失败:', e);
        }
    }

    sendChatMessage(message) {
        if (!this.connected || !this.sessionId) return;

        this.socket.emit('chat:message', { message });
        this.packetStats.sent++;
    }

    sendAnnotation(position, text, color = 0xffff00) {
        if (!this.connected || !this.sessionId) return;
        if (this.role !== 'coach') {
            console.warn('[NetworkManager] 仅教练可以标注');
            return;
        }

        this.socket.emit('coach:annotation', {
            position: { x: position.x, y: position.y, z: position.z },
            text,
            color
        });
        this.packetStats.sent++;
    }

    sendCoachCommand(command, targetPlayerId = null, params = {}) {
        if (!this.connected || !this.sessionId) return;
        if (this.role !== 'coach') return;

        this.socket.emit('coach:command', {
            command,
            targetPlayerId,
            params,
            timestamp: Date.now()
        });
        this.packetStats.sent++;
    }

    setBarHeight(height) {
        if (!this.connected || !this.sessionId) return;
        if (this.role !== 'coach') return;

        this.socket.emit('setting:barHeight', { height });
        this.packetStats.sent++;
    }

    startLatencyMonitoring() {
        this.pingInterval = setInterval(() => {
            if (this.connected && this.socket) {
                this.lastPingTime = Date.now();
                this.pingSeq++;
                try {
                    this.socket.emit('ping:server', {
                        clientTime: this.lastPingTime,
                        seq: this.pingSeq
                    });
                    this.packetStats.sent++;
                } catch (e) {
                    console.warn('[NetworkManager] Ping发送失败');
                }
            }
        }, 2000);
    }

    stopLatencyMonitoring() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    recordLatency(ms) {
        this.latency = Math.round(ms);
        this.latencyHistory.push(this.latency);

        while (this.latencyHistory.length > this.latencyMaxSamples) {
            this.latencyHistory.shift();
        }

        if (this.socket) {
            try {
                this.socket.emit('latency:report', { latency: this.latency });
            } catch (e) {}
        }
    }

    getLatency() {
        return this.latency;
    }

    getAverageLatency() {
        if (this.latencyHistory.length === 0) return 0;
        const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.latencyHistory.length);
    }

    getJitter() {
        if (this.latencyHistory.length < 2) return 0;
        const diffs = [];
        for (let i = 1; i < this.latencyHistory.length; i++) {
            diffs.push(Math.abs(this.latencyHistory[i] - this.latencyHistory[i - 1]));
        }
        const sum = diffs.reduce((a, b) => a + b, 0);
        return Math.round(sum / diffs.length);
    }

    isLowLatency() {
        return this.latency <= this.config.network.maxLatency;
    }

    update(deltaTime) {
        if (!this.sceneManager || !this.config.network.interpolation) return;

        const now = Date.now();
        const renderTime = now - this.serverTimeOffset - (this.config.network.interpolation ? 50 : 0);

        for (const [playerId, buffer] of this.interpolationBuffer) {
            if (playerId === this.playerId) continue;
            if (buffer.length < 2) {
                const latest = this.remoteStates.get(playerId);
                if (latest && this.sceneManager) {
                    this.sceneManager.updateRemotePlayer(playerId, latest);
                }
                continue;
            }

            while (buffer.length >= 2 && renderTime > buffer[1].time) {
                buffer.shift();
            }

            if (buffer.length >= 2) {
                const prev = buffer[0];
                const next = buffer[1];
                const timeRange = next.time - prev.time;
                const t = timeRange > 0 ? (renderTime - prev.time) / timeRange : 0;
                const clampedT = Math.max(0, Math.min(1, t));

                const interpolated = {
                    position: this.lerpVec3(
                        prev.state.position,
                        next.state.position,
                        clampedT
                    ),
                    rotation: this.lerpEuler(
                        prev.state.rotation,
                        next.state.rotation,
                        clampedT
                    ),
                    phase: next.state.phase
                };

                if (this.config.network.extrapolation && t > 1) {
                    const overshoot = t - 1;
                    const vel = next.state.velocity || { x: 0, y: 0, z: 0 };
                    const maxExtra = this.config.network.extrapolationTime;
                    const extraT = Math.min(overshoot, maxExtra / 0.016) * 0.016;
                    interpolated.position.x += vel.x * extraT;
                    interpolated.position.y += vel.y * extraT;
                    interpolated.position.z += vel.z * extraT;
                }

                this.sceneManager.updateRemotePlayer(playerId, interpolated);
            }
        }
    }

    lerpVec3(a, b, t) {
        if (!a || !b) return a || b || { x: 0, y: 0, z: 0 };
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t
        };
    }

    lerpEuler(a, b, t) {
        if (!a || !b) return a || b || { x: 0, y: 0, z: 0 };
        return {
            x: this.lerpAngle(a.x || 0, b.x || 0, t),
            y: this.lerpAngle(a.y || 0, b.y || 0, t),
            z: this.lerpAngle(a.z || 0, b.z || 0, t)
        };
    }

    lerpAngle(a, b, t) {
        const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        return a + diff * t;
    }

    getPacketStats() {
        return { ...this.packetStats };
    }

    isConnected() {
        return this.connected;
    }

    hasSession() {
        return this.connected && !!this.sessionId;
    }

    getSessionInfo() {
        return {
            sessionId: this.sessionId,
            playerId: this.playerId,
            playerName: this.playerName,
            role: this.role,
            color: this.color,
            connected: this.connected,
            playersCount: this.remoteStates.size + 1
        };
    }

    getRemotePlayers() {
        const players = [];
        for (const [id, state] of this.remoteStates) {
            players.push({
                id,
                state,
                role: state.role || 'athlete'
            });
        }
        return players;
    }

    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.eventListeners.has(event)) return;
        const listeners = this.eventListeners.get(event);
        const idx = listeners.indexOf(callback);
        if (idx > -1) {
            listeners.splice(idx, 1);
        }
    }

    emit(event, data) {
        if (!this.eventListeners.has(event)) return;
        for (const callback of this.eventListeners.get(event)) {
            try {
                callback(data);
            } catch (e) {
                console.error(`[NetworkManager] 事件处理错误 (${event}):`, e);
            }
        }
    }

    disconnect() {
        this.leaveSession();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.stopLatencyMonitoring();
        this.connected = false;
    }

    dispose() {
        this.disconnect();
        this.eventListeners.clear();
        this.remoteStates.clear();
        this.interpolationBuffer.clear();
        this.latencyHistory = [];
    }
}
