export class UIManager {
    constructor(root, config) {
        this.root = root;
        this.config = config;
        this.app = null;

        this.elements = {};
        this.currentView = 'mainMenu';

        this.sessionList = [];
        this.playerList = [];
        this.chatMessages = [];
        this.metricsHistory = [];

        this.initStyles();
    }

    setApp(app) {
        this.app = app;
    }

    initStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .ui-panel {
                position: fixed;
                z-index: 100;
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 16px;
                padding: 24px;
                backdrop-filter: blur(20px);
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                color: #f1f5f9;
                font-family: 'Microsoft YaHei', -apple-system, sans-serif;
            }

            .main-menu {
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 520px;
                max-height: 90vh;
                overflow-y: auto;
            }

            .main-menu h1 {
                text-align: center;
                font-size: 32px;
                font-weight: 800;
                margin-bottom: 4px;
                background: linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .main-menu .subtitle {
                text-align: center;
                color: #94a3b8;
                font-size: 14px;
                margin-bottom: 32px;
            }

            .menu-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 24px;
                border-bottom: 1px solid rgba(148, 163, 184, 0.2);
                padding-bottom: 0;
            }

            .menu-tab {
                flex: 1;
                padding: 12px 16px;
                border: none;
                background: transparent;
                color: #94a3b8;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                border-radius: 8px 8px 0 0;
                margin-bottom: -1px;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
            }

            .menu-tab.active {
                color: #3b82f6;
                border-bottom-color: #3b82f6;
                background: rgba(59, 130, 246, 0.08);
            }

            .menu-tab:hover:not(.active) {
                color: #cbd5e1;
                background: rgba(148, 163, 184, 0.1);
            }

            .menu-panel {
                display: none;
            }

            .menu-panel.active {
                display: block;
            }

            .form-group {
                margin-bottom: 20px;
            }

            .form-label {
                display: block;
                font-size: 13px;
                font-weight: 600;
                color: #cbd5e1;
                margin-bottom: 8px;
            }

            .form-input, .form-select {
                width: 100%;
                padding: 12px 16px;
                background: rgba(30, 41, 59, 0.8);
                border: 1px solid rgba(71, 85, 105, 0.6);
                border-radius: 10px;
                color: #f1f5f9;
                font-size: 14px;
                box-sizing: border-box;
                transition: all 0.2s;
            }

            .form-input:focus, .form-select:focus {
                outline: none;
                border-color: #3b82f6;
                background: rgba(30, 41, 59, 1);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
            }

            .role-selector {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }

            .role-card {
                padding: 16px;
                background: rgba(30, 41, 59, 0.8);
                border: 2px solid rgba(71, 85, 105, 0.6);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
                text-align: center;
            }

            .role-card:hover {
                border-color: rgba(59, 130, 246, 0.5);
                background: rgba(59, 130, 246, 0.08);
            }

            .role-card.selected {
                border-color: #3b82f6;
                background: rgba(59, 130, 246, 0.15);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
            }

            .role-icon {
                font-size: 36px;
                margin-bottom: 8px;
            }

            .role-name {
                font-size: 15px;
                font-weight: 700;
                color: #f1f5f9;
                margin-bottom: 4px;
            }

            .role-desc {
                font-size: 11px;
                color: #94a3b8;
            }

            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 12px 24px;
                border: none;
                border-radius: 10px;
                font-size: 15px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
                box-sizing: border-box;
            }

            .btn-primary {
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
            }

            .btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
            }

            .btn-primary:active {
                transform: translateY(0);
            }

            .btn-secondary {
                background: rgba(71, 85, 105, 0.8);
                color: #f1f5f9;
            }

            .btn-secondary:hover {
                background: rgba(71, 85, 105, 1);
            }

            .btn-success {
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
            }

            .btn-warning {
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: white;
            }

            .btn-danger {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: white;
            }

            .session-list {
                max-height: 280px;
                overflow-y: auto;
                border-radius: 10px;
                border: 1px solid rgba(71, 85, 105, 0.4);
                margin-bottom: 16px;
            }

            .session-item {
                padding: 14px 16px;
                border-bottom: 1px solid rgba(71, 85, 105, 0.2);
                cursor: pointer;
                transition: background 0.2s;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .session-item:last-child {
                border-bottom: none;
            }

            .session-item:hover, .session-item.selected {
                background: rgba(59, 130, 246, 0.12);
            }

            .session-name {
                font-size: 14px;
                font-weight: 600;
                color: #f1f5f9;
            }

            .session-info {
                font-size: 12px;
                color: #94a3b8;
                margin-top: 4px;
            }

            .players-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 10px;
                background: rgba(59, 130, 246, 0.2);
                color: #60a5fa;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
            }

            .btn-row {
                display: flex;
                gap: 12px;
                margin-top: 20px;
            }

            .btn-row .btn {
                flex: 1;
            }

            .hud {
                position: fixed;
                z-index: 90;
                pointer-events: none;
            }

            .hud-top-left {
                top: 20px;
                left: 20px;
                pointer-events: auto;
            }

            .hud-top-right {
                top: 70px;
                right: 20px;
                pointer-events: auto;
            }

            .hud-bottom-left {
                bottom: 20px;
                left: 20px;
                pointer-events: auto;
            }

            .hud-bottom-right {
                bottom: 20px;
                right: 20px;
                pointer-events: auto;
            }

            .hud-panel {
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(59, 130, 246, 0.25);
                border-radius: 12px;
                padding: 14px 18px;
                backdrop-filter: blur(10px);
                color: #f1f5f9;
                font-family: 'Microsoft YaHei', sans-serif;
            }

            .metrics-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                min-width: 300px;
            }

            .metric-item {
                background: rgba(30, 41, 59, 0.6);
                border-radius: 8px;
                padding: 10px 12px;
            }

            .metric-label {
                font-size: 11px;
                color: #94a3b8;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }

            .metric-value {
                font-size: 20px;
                font-weight: 800;
                color: #f1f5f9;
            }

            .metric-value.good { color: #4ade80; }
            .metric-value.warn { color: #fbbf24; }
            .metric-value.bad { color: #f87171; }

            .metric-unit {
                font-size: 12px;
                font-weight: 600;
                color: #94a3b8;
                margin-left: 2px;
            }

            .latency-indicator {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                font-weight: 700;
                padding: 8px 14px;
                border-radius: 8px;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(71, 85, 105, 0.4);
            }

            .latency-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }

            .latency-dot.good { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
            .latency-dot.warn { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; }
            .latency-dot.bad { background: #f87171; box-shadow: 0 0 8px #f87171; }

            .player-list-panel {
                min-width: 200px;
            }

            .player-list-title {
                font-size: 13px;
                font-weight: 700;
                color: #cbd5e1;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(71, 85, 105, 0.3);
            }

            .player-list-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                border-radius: 8px;
                margin-bottom: 4px;
                transition: background 0.2s;
            }

            .player-list-item:hover {
                background: rgba(59, 130, 246, 0.1);
            }

            .player-avatar {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: 700;
                color: white;
            }

            .player-info {
                flex: 1;
            }

            .player-name {
                font-size: 13px;
                font-weight: 600;
                color: #f1f5f9;
            }

            .player-role {
                font-size: 10px;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .role-tag {
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
            }

            .role-tag.athlete { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
            .role-tag.coach { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }

            .control-buttons {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .control-btn {
                padding: 10px 18px;
                border-radius: 8px;
                border: none;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }

            .control-btn:hover {
                transform: translateY(-1px);
            }

            .chat-panel {
                width: 340px;
                max-height: 260px;
                display: flex;
                flex-direction: column;
            }

            .chat-messages {
                flex: 1;
                overflow-y: auto;
                margin-bottom: 12px;
                padding: 4px;
                max-height: 180px;
            }

            .chat-message {
                padding: 8px 10px;
                border-radius: 8px;
                margin-bottom: 6px;
                font-size: 13px;
            }

            .chat-message.self {
                background: rgba(59, 130, 246, 0.15);
                margin-left: 20px;
            }

            .chat-message.other {
                background: rgba(71, 85, 105, 0.4);
                margin-right: 20px;
            }

            .chat-message-coach {
                background: rgba(245, 158, 11, 0.15);
                border-left: 3px solid #f59e0b;
            }

            .chat-sender {
                font-size: 11px;
                font-weight: 700;
                color: #94a3b8;
                margin-bottom: 3px;
            }

            .chat-text {
                color: #e2e8f0;
                line-height: 1.4;
            }

            .chat-input-wrap {
                display: flex;
                gap: 8px;
            }

            .chat-input {
                flex: 1;
                padding: 8px 12px;
                background: rgba(30, 41, 59, 0.8);
                border: 1px solid rgba(71, 85, 105, 0.5);
                border-radius: 8px;
                color: #f1f5f9;
                font-size: 13px;
            }

            .chat-send {
                padding: 8px 16px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 700;
                font-size: 13px;
            }

            .coach-toolbar {
                position: fixed;
                top: 120px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 90;
                display: flex;
                gap: 8px;
                background: rgba(15, 23, 42, 0.9);
                padding: 10px;
                border-radius: 12px;
                border: 1px solid rgba(245, 158, 11, 0.3);
                backdrop-filter: blur(10px);
            }

            .coach-btn {
                padding: 8px 14px;
                background: rgba(71, 85, 105, 0.6);
                border: none;
                border-radius: 8px;
                color: #f1f5f9;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                transition: all 0.2s;
            }

            .coach-btn:hover {
                background: rgba(59, 130, 246, 0.3);
            }

            .coach-btn.active {
                background: #3b82f6;
            }

            .error-toast {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 9999;
                background: rgba(220, 38, 38, 0.95);
                color: white;
                padding: 20px 32px;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                max-width: 90%;
            }

            .success-toast {
                background: rgba(16, 185, 129, 0.95);
            }

            .slider-wrap {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .slider-wrap input[type="range"] {
                flex: 1;
                height: 6px;
                -webkit-appearance: none;
                background: rgba(71, 85, 105, 0.6);
                border-radius: 3px;
            }

            .slider-wrap input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 18px;
                height: 18px;
                background: #3b82f6;
                border-radius: 50%;
                cursor: pointer;
            }

            .slider-value {
                min-width: 60px;
                text-align: right;
                font-size: 14px;
                font-weight: 700;
                color: #60a5fa;
            }

            .vr-hint {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 80;
                background: rgba(59, 130, 246, 0.9);
                color: white;
                padding: 10px 24px;
                border-radius: 24px;
                font-size: 14px;
                font-weight: 700;
                box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
                pointer-events: auto;
                cursor: pointer;
                transition: all 0.2s;
            }

            .vr-hint:hover {
                transform: translateX(-50%) translateY(-2px);
                box-shadow: 0 12px 32px rgba(59, 130, 246, 0.5);
            }

            ::-webkit-scrollbar {
                width: 6px;
            }

            ::-webkit-scrollbar-track {
                background: rgba(30, 41, 59, 0.4);
                border-radius: 3px;
            }

            ::-webkit-scrollbar-thumb {
                background: rgba(71, 85, 105, 0.8);
                border-radius: 3px;
            }

            ::-webkit-scrollbar-thumb:hover {
                background: rgba(100, 116, 139, 0.9);
            }
        `;
        document.head.appendChild(style);
    }

    showMainMenu() {
        this.hideAllViews();
        this.currentView = 'mainMenu';
        this.renderMainMenu();
    }

    renderMainMenu() {
        const menu = document.createElement('div');
        menu.className = 'ui-panel main-menu';
        menu.id = 'mainMenu';
        menu.innerHTML = `
            <h1>🏃‍♂️ VR跳高训练模拟器</h1>
            <p class="subtitle">专业撑杆跳高训练系统 | 动作捕捉 · 实时分析 · 多人同场</p>

            <div class="menu-tabs">
                <button class="menu-tab active" data-tab="join">加入训练</button>
                <button class="menu-tab" data-tab="create">创建房间</button>
                <button class="menu-tab" data-tab="settings">系统设置</button>
            </div>

            <div class="menu-panel active" id="panel-join">
                <div class="form-group">
                    <label class="form-label">选择训练房</label>
                    <div class="session-list" id="sessionList">
                        <div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">
                            正在加载训练房列表...
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">您的姓名</label>
                    <input type="text" class="form-input" id="playerName" placeholder="请输入姓名" value="运动员">
                </div>

                <div class="form-group">
                    <label class="form-label">选择身份</label>
                    <div class="role-selector">
                        <div class="role-card selected" data-role="athlete">
                            <div class="role-icon">🏃</div>
                            <div class="role-name">运动员</div>
                            <div class="role-desc">参与训练，接受指导</div>
                        </div>
                        <div class="role-card" data-role="coach">
                            <div class="role-icon">🎯</div>
                            <div class="role-name">教练</div>
                            <div class="role-desc">观看训练，发送指导</div>
                        </div>
                    </div>
                </div>

                <button class="btn btn-primary" id="joinBtn">
                    🚀 进入训练
                </button>
            </div>

            <div class="menu-panel" id="panel-create">
                <div class="form-group">
                    <label class="form-label">训练房名称</label>
                    <input type="text" class="form-input" id="roomName" placeholder="训练房名称" value="专业队训练">
                </div>

                <div class="form-group">
                    <label class="form-label">初始横杆高度</label>
                    <div class="slider-wrap">
                        <input type="range" id="barHeightSlider" min="2.0" max="6.5" step="0.05" value="5.0">
                        <span class="slider-value" id="barHeightValue">5.00 m</span>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">最大人数</label>
                    <select class="form-select" id="maxPlayers">
                        <option value="4">4人</option>
                        <option value="8" selected>8人</option>
                        <option value="16">16人</option>
                    </select>
                </div>

                <button class="btn btn-success" id="createBtn">
                    ✨ 创建训练房
                </button>
            </div>

            <div class="menu-panel" id="panel-settings">
                <div class="form-group">
                    <label class="form-label">动捕设备类型</label>
                    <select class="form-select" id="captureType">
                        <option value="simulated">模拟模式（演示）</option>
                        <option value="vr_controllers">VR控制器</option>
                        <option value="external_mocap">外部动捕设备</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">语音反馈</label>
                    <select class="form-select" id="voiceEnabled">
                        <option value="true" selected>开启</option>
                        <option value="false">关闭</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">音量</label>
                    <div class="slider-wrap">
                        <input type="range" id="volumeSlider" min="0" max="1" step="0.1" value="0.8">
                        <span class="slider-value" id="volumeValue">80%</span>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">服务器地址</label>
                    <input type="text" class="form-input" id="serverUrl" value="http://localhost:3000">
                </div>
            </div>
        `;

        this.root.appendChild(menu);
        this.elements.mainMenu = menu;

        this.bindMainMenuEvents();
        this.refreshSessionList();

        if (this.app?.vrSystem?.isVRSupported) {
            this.showVRHint();
        }
    }

    bindMainMenuEvents() {
        document.querySelectorAll('.menu-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.menu-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
            });
        });

        document.querySelectorAll('.role-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedRole = card.dataset.role;
            });
        });
        this.selectedRole = 'athlete';

        document.getElementById('barHeightSlider')?.addEventListener('input', (e) => {
            document.getElementById('barHeightValue').textContent = parseFloat(e.target.value).toFixed(2) + ' m';
        });

        document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
            document.getElementById('volumeValue').textContent = Math.round(e.target.value * 100) + '%';
        });

        document.getElementById('joinBtn').addEventListener('click', () => this.handleJoin());
        document.getElementById('createBtn').addEventListener('click', () => this.handleCreate());

        this.selectedSessionId = null;
    }

    async refreshSessionList() {
        try {
            const response = await fetch('/api/sessions');
            const data = await response.json();
            this.sessionList = data.sessions || [];
            this.renderSessionList();
        } catch (e) {
            console.warn('获取会话列表失败:', e);
            this.renderSessionList();
        }

        setTimeout(() => this.refreshSessionList(), 3000);
    }

    renderSessionList() {
        const list = document.getElementById('sessionList');
        if (!list) return;

        if (this.sessionList.length === 0) {
            list.innerHTML = `
                <div style="padding:32px;text-align:center;color:#94a3b8;">
                    <div style="font-size:32px;margin-bottom:8px;">🏟️</div>
                    <div style="font-size:13px;">暂无训练房，请先创建一个</div>
                </div>
            `;
            return;
        }

        list.innerHTML = this.sessionList.map(session => `
            <div class="session-item" data-id="${session.id}">
                <div>
                    <div class="session-name">${this.escapeHtml(session.name)}</div>
                    <div class="session-info">
                        横杆高度 ${session.settings.barHeight?.toFixed(2) || '5.00'}m · 
                        创建于 ${new Date(session.createdAt).toLocaleTimeString()}
                    </div>
                </div>
                <div class="players-badge">
                    👥 ${session.players.length}/${session.maxPlayers}
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.session-item').forEach(item => {
            item.addEventListener('click', () => {
                list.querySelectorAll('.session-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedSessionId = item.dataset.id;
            });
        });
    }

    async handleJoin() {
        const name = document.getElementById('playerName').value.trim() || '运动员';
        const role = this.selectedRole;

        if (!this.selectedSessionId) {
            if (this.sessionList.length > 0) {
                this.selectedSessionId = this.sessionList[0].id;
            } else {
                this.showError('请先选择或创建一个训练房');
                return;
            }
        }

        try {
            await this.app.networkManager.connect();
            await this.app.networkManager.joinSession(this.selectedSessionId, role, name);
            this.config.setRole(role);
            this.app.startTraining(this.selectedSessionId, role);
        } catch (e) {
            this.showError('加入训练失败: ' + e.message);
        }
    }

    async handleCreate() {
        const name = document.getElementById('roomName').value.trim() || '训练房';
        const barHeight = parseFloat(document.getElementById('barHeightSlider').value);
        const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
        const playerName = document.getElementById('playerName').value.trim() || '教练';
        const role = 'coach';

        try {
            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, maxPlayers, settings: { barHeight } })
            });
            const data = await response.json();

            if (data.success) {
                this.selectedSessionId = data.sessionId;
                this.config.setRole(role);
                await this.app.networkManager.connect();
                await this.app.networkManager.joinSession(this.selectedSessionId, role, playerName);
                this.app.startTraining(this.selectedSessionId, role);
            }
        } catch (e) {
            this.showError('创建训练房失败: ' + e.message);
        }
    }

    showTrainingUI() {
        this.hideAllViews();
        this.currentView = 'training';

        this.renderMetricsPanel();
        this.renderPlayerList();
        this.renderControlButtons();
        this.renderLatency();
        this.renderChatPanel();

        if (this.config.training.role === 'coach') {
            this.renderCoachToolbar();
        }

        if (this.app?.vrSystem?.isVRSupported && !this.app.vrSystem.isInVR) {
            this.showVRHint();
        }
    }

    renderMetricsPanel() {
        const panel = document.createElement('div');
        panel.className = 'hud hud-top-left';
        panel.innerHTML = `
            <div class="hud-panel">
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-label">助跑速度</div>
                        <div class="metric-value" id="metric-speed">-<span class="metric-unit">m/s</span></div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">起跳角度</div>
                        <div class="metric-value" id="metric-angle">-<span class="metric-unit">°</span></div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">杆弯曲度</div>
                        <div class="metric-value" id="metric-bend">-<span class="metric-unit">%</span></div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">当前高度</div>
                        <div class="metric-value" id="metric-height">-<span class="metric-unit">m</span></div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">横杆高度</div>
                        <div class="metric-value" id="metric-bar">5.00<span class="metric-unit">m</span></div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">试跳得分</div>
                        <div class="metric-value" id="metric-score">-</div>
                    </div>
                </div>
            </div>
        `;
        this.root.appendChild(panel);
        this.elements.metricsPanel = panel;
    }

    renderPlayerList() {
        const panel = document.createElement('div');
        panel.className = 'hud hud-top-right';
        panel.innerHTML = `
            <div class="hud-panel player-list-panel">
                <div class="player-list-title">👥 训练人员</div>
                <div id="playerListContainer"></div>
            </div>
        `;
        this.root.appendChild(panel);
        this.elements.playerListPanel = panel;
    }

    renderControlButtons() {
        const panel = document.createElement('div');
        panel.className = 'hud hud-bottom-left';
        panel.innerHTML = `
            <div class="hud-panel">
                <div class="control-buttons">
                    <button class="control-btn btn-secondary" id="btnReset">🔄 重置位置</button>
                    <button class="control-btn btn-warning" id="btnMenu">🏠 返回主菜单</button>
                </div>
            </div>
        `;
        this.root.appendChild(panel);
        this.elements.controlPanel = panel;

        document.getElementById('btnReset').addEventListener('click', () => {
            this.app.sceneManager.resetAthlete();
            this.app.actionAnalyzer.reset();
        });

        document.getElementById('btnMenu').addEventListener('click', () => {
            this.app.stopTraining();
        });
    }

    renderLatency() {
        const panel = document.createElement('div');
        panel.className = 'hud hud-bottom-right';
        panel.innerHTML = `
            <div class="hud-panel">
                <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
                    <div class="latency-indicator">
                        <span class="latency-dot good" id="latencyDot"></span>
                        <span id="latencyValue">0 ms</span>
                    </div>
                    <div class="latency-indicator" style="background:rgba(0,0,0,0.4);">
                        <span>🎬</span>
                        <span id="fpsValue">0 FPS</span>
                    </div>
                </div>
            </div>
        `;
        this.root.appendChild(panel);
        this.elements.latencyPanel = panel;
    }

    renderChatPanel() {
        const panel = document.createElement('div');
        panel.className = 'hud hud-bottom-left';
        panel.style.left = 'auto';
        panel.style.right = '20px';
        panel.style.bottom = '90px';
        panel.innerHTML = `
            <div class="hud-panel chat-panel">
                <div style="font-size:13px;font-weight:700;color:#cbd5e1;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(71,85,105,0.3);">
                    💬 训练交流
                </div>
                <div class="chat-messages" id="chatMessages"></div>
                <div class="chat-input-wrap">
                    <input class="chat-input" id="chatInput" placeholder="输入消息... (Enter发送)">
                    <button class="chat-send" id="chatSend">发送</button>
                </div>
            </div>
        `;
        this.root.appendChild(panel);
        this.elements.chatPanel = panel;

        document.getElementById('chatSend').addEventListener('click', () => this.sendChat());
        document.getElementById('chatInput').addEventListener('keydown', (e) => {
            if (e.code === 'Enter') this.sendChat();
        });
    }

    sendChat() {
        const input = document.getElementById('chatInput');
        const msg = input.value.trim();
        if (!msg) return;

        this.app.networkManager.sendChatMessage(msg);
        this.addChatMessage({
            id: this.app.networkManager.playerId,
            name: this.app.networkManager.playerName || '我',
            role: this.config.training.role,
            message: msg,
            timestamp: Date.now(),
            self: true
        });

        input.value = '';
    }

    addChatMessage(data) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        const isCoach = data.role === 'coach';
        const isSelf = data.self || data.id === this.app.networkManager.playerId;

        const div = document.createElement('div');
        div.className = 'chat-message ' + (isSelf ? 'self' : 'other') + (isCoach ? ' chat-message-coach' : '');
        div.innerHTML = `
            <div class="chat-sender">
                ${isCoach ? '🎯 ' : ''}${this.escapeHtml(data.name)} · ${new Date(data.timestamp).toLocaleTimeString()}
            </div>
            <div class="chat-text">${this.escapeHtml(data.message)}</div>
        `;

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    renderCoachToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'coach-toolbar';

        const commands = [
            { id: 'start', icon: '▶️', label: '开始' },
            { id: 'reset', icon: '🔄', label: '重置' },
            { id: 'slow', icon: '🐢', label: '慢放' },
            { id: 'annotation', icon: '✏️', label: '标注', toggle: true },
            { id: 'measure', icon: '📏', label: '测距', toggle: true },
            { id: 'raise_bar', icon: '⬆️', label: '+杆高' },
            { id: 'lower_bar', icon: '⬇️', label: '-杆高' },
            { id: 'v1', label: '正面' },
            { id: 'v2', label: '侧面' },
            { id: 'v3', label: '俯视' }
        ];

        toolbar.innerHTML = commands.map(cmd => `
            <button class="coach-btn" data-cmd="${cmd.id}" data-toggle="${cmd.toggle || false}">
                ${cmd.icon || ''} ${cmd.label}
            </button>
        `).join('');

        this.root.appendChild(toolbar);
        this.elements.coachToolbar = toolbar;

        toolbar.querySelectorAll('.coach-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                const isToggle = btn.dataset.toggle === 'true';

                if (isToggle) {
                    btn.classList.toggle('active');
                }

                this.handleCoachCommand(cmd, btn);
            });
        });
    }

    handleCoachCommand(cmd, btn) {
        const toolkit = this.app.coachToolkit;

        switch (cmd) {
            case 'start':
            case 'reset':
            case 'slow':
            case 'raise_bar':
            case 'lower_bar':
                toolkit.executeQuickCommand(cmd);
                break;

            case 'annotation':
                toolkit.setToolMode(btn.classList.contains('active') ? 'annotation' : 'select');
                break;

            case 'measure':
                toolkit.toggleMeasureMode();
                break;

            case 'v1': toolkit.setViewPreset(0); break;
            case 'v2': toolkit.setViewPreset(1); break;
            case 'v3': toolkit.setViewPreset(2); break;
        }
    }

    showVRHint() {
        let hint = document.getElementById('vrHint');
        if (hint) hint.remove();

        hint = document.createElement('div');
        hint.id = 'vrHint';
        hint.className = 'vr-hint';
        hint.textContent = '🥽 按 V 键或点击进入VR模式';
        hint.addEventListener('click', () => {
            this.app.enterVR();
        });
        this.root.appendChild(hint);
    }

    hideVRHint() {
        const hint = document.getElementById('vrHint');
        if (hint) hint.remove();
    }

    update(fps, latency) {
        if (this.currentView !== 'training') return;

        const latencyValue = document.getElementById('latencyValue');
        const latencyDot = document.getElementById('latencyDot');
        const fpsValue = document.getElementById('fpsValue');

        if (latencyValue) latencyValue.textContent = `${latency} ms`;
        if (latencyDot) {
            latencyDot.className = 'latency-dot ' +
                (latency <= 20 ? 'good' : latency <= 50 ? 'warn' : 'bad');
        }
        if (fpsValue) fpsValue.textContent = `${Math.round(fps)} FPS`;

        const metrics = this.app.actionAnalyzer?.getCurrentMetrics();
        if (metrics) {
            this.updateMetric('speed', metrics.approach.currentSpeed, ' m/s',
                [null, null], null, 1);

            this.updateMetric('angle', metrics.takeoff.takeoffAngle, '°',
                [this.config.analysis.minTakeoffAngle, this.config.analysis.maxTakeoffAngle],
                this.config.analysis.idealTakeoffAngle, 0);

            const bendPct = (metrics.pole.currentBend || 0) * 100;
            this.updateMetric('bend', bendPct, '%',
                [this.config.analysis.minPoleBend * 100, this.config.analysis.maxPoleBend * 100],
                this.config.analysis.idealPoleBend * 100, 0);

            this.updateMetric('height', metrics.height.current, ' m',
                [null, null], null, 2);

            this.updateMetric('bar', metrics.bar.height, ' m',
                [null, null], null, 2);

            const score = this.app.actionAnalyzer.averageScores?.overall || 0;
            this.updateMetric('score', score > 0 ? score : null, '',
                [60, 80], null, 0);
        }

        this.updatePlayerListDisplay();
    }

    updateMetric(id, value, unit = '', goodRange = [null, null], ideal = null, decimals = 2) {
        const el = document.getElementById('metric-' + id);
        if (!el) return;

        if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
            el.innerHTML = `-<span class="metric-unit">${unit}</span>`;
            return;
        }

        const formatted = typeof value === 'number' ? value.toFixed(decimals) : value;
        let cls = '';

        if (goodRange[0] !== null && goodRange[1] !== null) {
            if (value < goodRange[0] || value > goodRange[1]) {
                cls = value < goodRange[0] ? 'bad' : 'warn';
            } else {
                if (ideal !== null) {
                    const diff = Math.abs(value - ideal) / ideal;
                    cls = diff < 0.1 ? 'good' : '';
                } else {
                    cls = 'good';
                }
            }
        }

        el.innerHTML = `<span class="metric-value ${cls}">${formatted}</span><span class="metric-unit">${unit}</span>`;
    }

    updatePlayerListDisplay() {
        const container = document.getElementById('playerListContainer');
        if (!container) return;

        const players = [];
        const info = this.app.networkManager?.getSessionInfo();

        if (info) {
            players.push({
                id: info.playerId,
                name: info.playerName + ' (我)',
                role: info.role,
                color: info.color
            });
        }

        for (const [pid, state] of (this.app.sceneManager?.remotePlayers || [])) {
            players.push({
                id: pid,
                name: state.data.name,
                role: state.data.role,
                color: state.data.color
            });
        }

        container.innerHTML = players.map(p => `
            <div class="player-list-item">
                <div class="player-avatar" style="background:#${p.color.toString(16).padStart(6, '0')}">
                    ${p.name.charAt(0)}
                </div>
                <div class="player-info">
                    <div class="player-name">${this.escapeHtml(p.name)}</div>
                    <span class="role-tag ${p.role}">${p.role === 'coach' ? '教练' : '运动员'}</span>
                </div>
            </div>
        `).join('');
    }

    onSessionJoined(data) {
        this.showTrainingUI();
    }

    onSessionClosed(data) {
        this.showError('训练房已关闭，返回主菜单');
        setTimeout(() => {
            this.app.stopTraining();
        }, 2000);
    }

    onPlayerJoined(playerId, playerData) {
        this.showToast(`👋 ${playerData.name} 加入训练`, 'success');
    }

    onPlayerLeft(playerId, playerData) {
        this.showToast(`${playerData.name} 离开了训练`);
    }

    onChatMessage(data) {
        this.addChatMessage(data);
    }

    onCoachCommand(data) {
        this.showToast(`🎯 ${data.coachName}: ${data.command}`, 'success');
    }

    onBarHeightChanged(data) {
        this.showToast(`🏋️ 横杆高度调整为 ${data.height.toFixed(2)}m (${data.changedByName})`, 'success');
    }

    showError(message) {
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.textContent = message;
        this.root.appendChild(toast);

        setTimeout(() => toast.remove(), 4000);
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'error-toast ' + (type === 'success' ? 'success-toast' : '');
        toast.textContent = message;
        toast.style.top = '20px';
        toast.style.transform = 'translateX(-50%)';
        this.root.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    }

    hideAllViews() {
        for (const key of Object.keys(this.elements)) {
            const el = this.elements[key];
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
            delete this.elements[key];
        }

        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) mainMenu.remove();

        this.hideVRHint();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    dispose() {
        this.hideAllViews();
    }
}
