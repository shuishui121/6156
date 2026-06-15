import { VRSystem } from './core/VRSystem.js';
import { SceneManager } from './core/SceneManager.js';
import { PhysicsEngine } from './physics/PhysicsEngine.js';
import { MotionCapture } from './capture/MotionCapture.js';
import { ActionAnalyzer } from './analysis/ActionAnalyzer.js';
import { FeedbackSystem } from './feedback/FeedbackSystem.js';
import { NetworkManager } from './network/NetworkManager.js';
import { CoachToolkit } from './coach/CoachToolkit.js';
import { UIManager } from './ui/UIManager.js';
import { Config } from './config/Config.js';

class VRPoleVaultApp {
    constructor() {
        this.canvas = document.getElementById('renderCanvas');
        this.uiRoot = document.getElementById('uiRoot');
        this.isRunning = false;
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 0;

        this.initModules();
        this.initEventListeners();
    }

    initModules() {
        this.config = new Config();
        this.vrSystem = new VRSystem(this.canvas, this.config);
        this.sceneManager = new SceneManager(this.vrSystem, this.config);
        this.physicsEngine = new PhysicsEngine(this.config);
        this.motionCapture = new MotionCapture(this.config);
        this.actionAnalyzer = new ActionAnalyzer(this.config);
        this.feedbackSystem = new FeedbackSystem(this.uiRoot, this.config);
        this.networkManager = new NetworkManager(this.config);
        this.coachToolkit = new CoachToolkit(this.sceneManager, this.config);
        this.uiManager = new UIManager(this.uiRoot, this.config);

        this.sceneManager.setPhysicsEngine(this.physicsEngine);
        this.sceneManager.setMotionCapture(this.motionCapture);
        this.sceneManager.setFeedbackSystem(this.feedbackSystem);
        this.sceneManager.setNetworkManager(this.networkManager);
        this.sceneManager.setCoachToolkit(this.coachToolkit);
        this.sceneManager.setUIManager(this.uiManager);

        this.actionAnalyzer.setFeedbackSystem(this.feedbackSystem);
        this.coachToolkit.setNetworkManager(this.networkManager);
        this.coachToolkit.setUIManager(this.uiManager);

        this.networkManager.setSceneManager(this.sceneManager);
        this.networkManager.setUIManager(this.uiManager);

        this.uiManager.setApp(this);
    }

    initEventListeners() {
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    async start() {
        try {
            await this.vrSystem.init();
            this.sceneManager.buildScene();
            this.physicsEngine.init(this.sceneManager);
            this.motionCapture.init();
            this.uiManager.showMainMenu();

            this.isRunning = true;
            this.lastTime = performance.now();
            this.animate();

            console.log('[VRPoleVaultApp] 系统启动成功');
        } catch (error) {
            console.error('[VRPoleVaultApp] 启动失败:', error);
            this.uiManager.showError('系统启动失败: ' + error.message);
        }
    }

    async enterVR() {
        try {
            await this.vrSystem.enterVR();
        } catch (error) {
            console.error('[VRPoleVaultApp] 进入VR失败:', error);
        }
    }

    exitVR() {
        this.vrSystem.exitVR();
    }

    startTraining(sessionId, role = 'athlete') {
        this.config.training.role = role;
        this.config.training.sessionId = sessionId;

        if (role === 'coach') {
            this.coachToolkit.activate();
        } else {
            this.motionCapture.start();
            this.sceneManager.resetAthlete();
        }

        this.actionAnalyzer.reset();
        this.networkManager.joinSession(sessionId, role);
        this.uiManager.showTrainingUI();
    }

    stopTraining() {
        this.motionCapture.stop();
        this.networkManager.leaveSession();
        this.coachToolkit.deactivate();
        this.uiManager.showMainMenu();
    }

    animate() {
        if (!this.isRunning) return;

        this.vrSystem.setAnimationLoop((time) => {
            const deltaTime = Math.min((time - this.lastTime) / 1000, 0.033);
            this.lastTime = time;

            this.calculateFPS(deltaTime);

            if (this.motionCapture.isActive) {
                this.motionCapture.update(deltaTime);
                const poseData = this.motionCapture.getPoseData();
                this.sceneManager.updateAthletePose(poseData);

                const analysisResult = this.actionAnalyzer.analyze(poseData, deltaTime);
                if (analysisResult) {
                    this.feedbackSystem.processAnalysis(analysisResult);
                    this.networkManager.broadcastActionData(analysisResult);
                }
            }

            this.physicsEngine.step(deltaTime);
            this.sceneManager.update(deltaTime);
            this.networkManager.update(deltaTime);
            this.feedbackSystem.update(deltaTime);
            this.coachToolkit.update(deltaTime);
            this.uiManager.update(this.fps, this.networkManager.getLatency());

            this.vrSystem.render();
        });
    }

    calculateFPS(deltaTime) {
        this.frameCount++;
        if (deltaTime > 0) {
            const instantFPS = 1.0 / deltaTime;
            this.fps = this.fps * 0.95 + instantFPS * 0.05;
        }
    }

    onResize() {
        this.vrSystem.onResize();
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyV':
                if (this.vrSystem.isVRSupported) {
                    this.enterVR();
                }
                break;
            case 'Escape':
                this.exitVR();
                break;
            case 'KeyR':
                this.sceneManager.resetAthlete();
                this.actionAnalyzer.reset();
                break;
            case 'KeyC':
                this.coachToolkit.toggleFreeCamera();
                break;
        }
    }

    getState() {
        return {
            isVRSupported: this.vrSystem.isVRSupported,
            isInVR: this.vrSystem.isInVR,
            isTraining: this.motionCapture.isActive,
            role: this.config.training.role,
            latency: this.networkManager.getLatency(),
            fps: this.fps
        };
    }
}

const app = new VRPoleVaultApp();
window.__VR_POLE_VAULT_APP__ = app;
app.start();

export default app;
