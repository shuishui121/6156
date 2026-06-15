export class MotionCapture {
    constructor(config) {
        this.config = config;
        this.isActive = false;
        this.deviceType = config.capture.deviceType;
        this.sampleRate = config.capture.sampleRate;
        this.smoothingFactor = config.capture.smoothing;

        this.currentPose = this.createDefaultPose();
        this.smoothedPose = this.createDefaultPose();
        this.previousPose = this.createDefaultPose();
        this.poseHistory = [];
        this.maxHistorySize = 120;

        this.lastSampleTime = 0;
        this.sampleInterval = 1000 / this.sampleRate;

        this.listeners = {
            poseUpdate: [],
            calibStart: [],
            calibComplete: [],
            deviceConnect: [],
            deviceDisconnect: []
        };

        this.simulatedTime = 0;
        this.simulatedPhase = 'idle';
        this.simulatedProgress = 0;

        this.vrControllers = null;
        this.externalDeviceConnected = false;
        this.websocket = null;
        this.lastExternalDataTime = 0;
    }

    createDefaultPose() {
        const h = this.config.physics.athleteHeight;
        return {
            timestamp: 0,
            rootPosition: { x: 0, y: 0, z: 20 },
            rootRotation: { x: 0, y: 0, z: 0 },
            rootVelocity: { x: 0, y: 0, z: 0 },
            joints: {
                head: { position: { x: 0, y: h * 0.95, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                neck: { position: { x: 0, y: h * 0.88, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                torso: { position: { x: 0, y: h * 0.65, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                hip: { position: { x: 0, y: h * 0.45, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                leftShoulder: { position: { x: -0.3 * (h / 1.85), y: h * 0.72, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                leftElbow: { position: { x: -0.3 * (h / 1.85), y: h * 0.45, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                leftWrist: { position: { x: -0.3 * (h / 1.85), y: h * 0.28, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                rightShoulder: { position: { x: 0.3 * (h / 1.85), y: h * 0.72, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                rightElbow: { position: { x: 0.3 * (h / 1.85), y: h * 0.45, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                rightWrist: { position: { x: 0.3 * (h / 1.85), y: h * 0.28, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                leftHip: { position: { x: -0.1 * (h / 1.85), y: h * 0.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                leftKnee: { position: { x: -0.1 * (h / 1.85), y: h * 0.2, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                leftAnkle: { position: { x: -0.1 * (h / 1.85), y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                rightHip: { position: { x: 0.1 * (h / 1.85), y: h * 0.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                rightKnee: { position: { x: 0.1 * (h / 1.85), y: h * 0.2, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                rightAnkle: { position: { x: 0.1 * (h / 1.85), y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
            },
            poleHeld: true,
            polePlanted: false,
            polePlantPoint: null,
            poleBendAmount: 0,
            phase: 'idle',
            confidence: 1.0
        };
    }

    async init() {
        console.log(`[MotionCapture] 初始化，设备类型: ${this.deviceType}`);

        switch (this.deviceType) {
            case 'vr_controllers':
                this.initVRControllers();
                break;
            case 'external_mocap':
                await this.initExternalMocap();
                break;
            case 'simulated':
            default:
                this.initSimulated();
                break;
        }

        this.emit('deviceConnect', { type: this.deviceType });
    }

    initVRControllers() {
        if (typeof window !== 'undefined' && window.__VR_POLE_VAULT_APP__) {
            this.vrControllers = {
                left: () => window.__VR_POLE_VAULT_APP__.vrSystem.getControllerState('left'),
                right: () => window.__VR_POLE_VAULT_APP__.vrSystem.getControllerState('right')
            };
        }
    }

    async initExternalMocap() {
        const serverUrl = this.config.network.serverUrl;
        const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${serverUrl.split('://')[1]}/mocap`;

        try {
            this.websocket = new WebSocket(wsUrl);

            this.websocket.onopen = () => {
                this.externalDeviceConnected = true;
                console.log('[MotionCapture] 外部动捕设备已连接');
                this.emit('deviceConnect', { type: 'external_mocap', connected: true });
            };

            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.processExternalData(data);
                } catch (e) {
                    console.warn('[MotionCapture] 解析动捕数据失败:', e);
                }
            };

            this.websocket.onclose = () => {
                this.externalDeviceConnected = false;
                console.warn('[MotionCapture] 外部动捕设备连接断开');
                this.emit('deviceDisconnect', { type: 'external_mocap' });
            };

            this.websocket.onerror = (error) => {
                console.error('[MotionCapture] 动捕连接错误:', error);
                this.deviceType = 'simulated';
            };

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('连接超时')), 3000);
                this.websocket.addEventListener('open', () => {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
            });

        } catch (error) {
            console.warn('[MotionCapture] 外部动捕连接失败，切换到模拟模式:', error);
            this.deviceType = 'simulated';
            this.initSimulated();
        }
    }

    initSimulated() {
        this.simulatedTime = 0;
        this.simulatedPhase = 'idle';
        this.simulatedProgress = 0;
        console.log('[MotionCapture] 模拟模式已启动');
    }

    start() {
        this.isActive = true;
        this.currentPose = this.createDefaultPose();
        this.smoothedPose = this.createDefaultPose();
        this.poseHistory = [];
        this.simulatedTime = 0;
        this.simulatedPhase = 'approach';
        this.simulatedProgress = 0;
        console.log('[MotionCapture] 数据采集启动');
    }

    stop() {
        this.isActive = false;
        this.simulatedPhase = 'idle';
        console.log('[MotionCapture] 数据采集停止');
    }

    startCalibration() {
        this.emit('calibStart', { startTime: Date.now() });

        setTimeout(() => {
            this.currentPose.confidence = 1.0;
            this.emit('calibComplete', { success: true, duration: 2000 });
        }, 2000);
    }

    update(deltaTime) {
        if (!this.isActive) return;

        const now = performance.now();
        if (now - this.lastSampleTime < this.sampleInterval) return;
        this.lastSampleTime = now;

        switch (this.deviceType) {
            case 'vr_controllers':
                this.sampleVRControllers(deltaTime);
                break;
            case 'external_mocap':
                if (this.externalDeviceConnected) {
                } else {
                    this.sampleSimulated(deltaTime);
                }
                break;
            case 'simulated':
            default:
                this.sampleSimulated(deltaTime);
                break;
        }

        this.smoothPose();
        this.currentPose.timestamp = now;
        this.poseHistory.push(JSON.parse(JSON.stringify(this.currentPose)));
        if (this.poseHistory.length > this.maxHistorySize) {
            this.poseHistory.shift();
        }

        this.emit('poseUpdate', this.smoothedPose);
    }

    sampleSimulated(deltaTime) {
        this.simulatedTime += deltaTime;
        const h = this.config.physics.athleteHeight;
        const scale = h / 1.85;
        const pose = this.currentPose;

        const runwayStart = 20;
        const boxPosZ = -0.6;
        const totalRunwayLen = runwayStart - boxPosZ;
        const approachDuration = 4.5;
        const plantDuration = 0.15;
        const swingDuration = 0.6;
        const extensionDuration = 0.4;
        const releaseDuration = 0.3;
        const flyDuration = 0.8;
        const landDuration = 0.5;

        if (this.simulatedPhase === 'approach') {
            this.simulatedProgress += deltaTime / approachDuration;

            if (this.simulatedProgress >= 1) {
                this.simulatedProgress = 0;
                this.simulatedPhase = 'plant';
            }

            const t = this.simulatedProgress;
            const easeInOut = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const currentZ = runwayStart - totalRunwayLen * easeInOut;
            const speed = (totalRunwayLen / approachDuration) * (1 + 0.3 * Math.sin(t * Math.PI));

            pose.rootPosition.z = currentZ;
            pose.rootPosition.y = 0;
            pose.rootVelocity.z = -speed;

            const stepPhase = this.simulatedTime * 4;
            const leftFootLift = Math.max(0, Math.sin(stepPhase));
            const rightFootLift = Math.max(0, Math.sin(stepPhase + Math.PI));

            pose.joints.leftAnkle.position = { x: -0.1 * scale, y: leftFootLift * 0.25, z: -0.15 * scale };
            pose.joints.rightAnkle.position = { x: 0.1 * scale, y: rightFootLift * 0.25, z: 0.15 * scale };
            pose.joints.leftKnee.position = { x: -0.1 * scale, y: h * 0.2 + leftFootLift * 0.1, z: -0.08 * scale };
            pose.joints.rightKnee.position = { x: 0.1 * scale, y: h * 0.2 + rightFootLift * 0.1, z: 0.08 * scale };

            const armSwing = Math.sin(stepPhase + Math.PI) * 0.3;
            pose.joints.leftShoulder.rotation = { x: -armSwing, y: 0, z: 0.2 };
            pose.joints.rightShoulder.rotation = { x: armSwing, y: 0, z: -0.2 };
            pose.joints.leftWrist.position = { x: -0.35 * scale, y: h * 0.35 + armSwing * 0.2, z: armSwing * 0.3 };
            pose.joints.rightWrist.position = { x: 0.35 * scale, y: h * 0.35 - armSwing * 0.2, z: -armSwing * 0.3 };

            pose.phase = 'approach';
            pose.poleHeld = true;
            pose.polePlanted = false;

        } else if (this.simulatedPhase === 'plant') {
            this.simulatedProgress += deltaTime / plantDuration;
            if (this.simulatedProgress >= 1) {
                this.simulatedProgress = 0;
                this.simulatedPhase = 'swing';
            }

            const t = this.simulatedProgress;
            pose.rootPosition.z = boxPosZ + 0.5 * (1 - t);
            pose.rootPosition.y = h * 0.05 * t;
            pose.rootVelocity.z = -8 * (1 - t);
            pose.rootVelocity.y = 1.5 * t;

            pose.joints.rightAnkle.position = { x: 0.1 * scale, y: 0, z: -0.1 * scale };
            pose.joints.leftAnkle.position = { x: -0.05 * scale, y: 0.05 * t, z: 0 };
            pose.joints.rightWrist.position = { x: 0.3 * scale, y: h * 0.6, z: -0.5 * t };
            pose.joints.leftWrist.position = { x: 0.2 * scale, y: h * 0.55, z: -0.4 * t };

            pose.phase = 'plant';
            pose.poleHeld = true;
            pose.polePlanted = true;
            pose.polePlantPoint = { x: 0, y: 0, z: boxPosZ };
            pose.poleBendAmount = 0.1 * t;

        } else if (this.simulatedPhase === 'swing') {
            this.simulatedProgress += deltaTime / swingDuration;
            if (this.simulatedProgress >= 1) {
                this.simulatedProgress = 0;
                this.simulatedPhase = 'extension';
            }

            const t = this.simulatedProgress;
            const riseHeight = this.config.training.barHeight * 0.6;
            const pendulumAngle = Math.sin(t * Math.PI / 2) * 0.8;

            pose.rootPosition.x = Math.sin(pendulumAngle) * 1.2;
            pose.rootPosition.z = boxPosZ - 1.5 * t;
            pose.rootPosition.y = riseHeight * t;
            pose.rootRotation.x = -pendulumAngle * 0.5;

            pose.joints.leftAnkle.position = { x: -0.1 * scale, y: h * 0.05, z: 0.2 * scale };
            pose.joints.rightAnkle.position = { x: 0.1 * scale, y: h * 0.05, z: 0.2 * scale };

            const armAngle = -t * Math.PI * 0.4;
            pose.joints.leftShoulder.rotation = { x: armAngle, y: 0, z: 0.3 };
            pose.joints.rightShoulder.rotation = { x: armAngle, y: 0, z: -0.3 };
            pose.joints.leftWrist.position = { x: 0.15 * scale, y: h * 0.85, z: -0.2 };
            pose.joints.rightWrist.position = { x: 0.25 * scale, y: h * 0.9, z: -0.25 };

            pose.phase = 'swing';
            pose.poleHeld = true;
            pose.polePlanted = true;
            pose.polePlantPoint = { x: 0, y: 0, z: boxPosZ };
            pose.poleBendAmount = 0.35 + 0.15 * Math.sin(t * Math.PI);

        } else if (this.simulatedPhase === 'extension') {
            this.simulatedProgress += deltaTime / extensionDuration;
            if (this.simulatedProgress >= 1) {
                this.simulatedProgress = 0;
                this.simulatedPhase = 'release';
            }

            const t = this.simulatedProgress;
            const peakHeight = this.config.training.barHeight * 1.1;

            pose.rootPosition.x = (1.2 - t * 0.8);
            pose.rootPosition.z = boxPosZ - 1.5 - t * 0.8;
            pose.rootPosition.y = peakHeight * (0.6 + 0.4 * t);
            pose.rootRotation.x = -(0.8 - t * 0.6);

            pose.joints.leftAnkle.position = { x: -0.15 * scale, y: h * 0.1 + t * 0.3, z: 0.3 * scale };
            pose.joints.rightAnkle.position = { x: 0.15 * scale, y: h * 0.1 + t * 0.3, z: 0.3 * scale };

            const extendAngle = -Math.PI * 0.4 + t * Math.PI * 0.6;
            pose.joints.leftShoulder.rotation = { x: extendAngle, y: 0, z: 0.5 };
            pose.joints.rightShoulder.rotation = { x: extendAngle, y: 0, z: -0.5 };
            pose.joints.leftWrist.position = { x: -0.1 * scale, y: h * 1.05, z: -0.5 };
            pose.joints.rightWrist.position = { x: 0.1 * scale, y: h * 1.1, z: -0.55 };

            pose.phase = 'extension';
            pose.poleHeld = true;
            pose.polePlanted = true;
            pose.polePlantPoint = { x: 0, y: 0, z: boxPosZ };
            pose.poleBendAmount = 0.5 - 0.4 * t;

        } else if (this.simulatedPhase === 'release') {
            this.simulatedProgress += deltaTime / releaseDuration;
            if (this.simulatedProgress >= 1) {
                this.simulatedProgress = 0;
                this.simulatedPhase = 'fly';
            }

            const t = this.simulatedProgress;
            const peakHeight = this.config.training.barHeight * 1.1;

            pose.rootPosition.x = 0.4 - t * 0.3;
            pose.rootPosition.z = boxPosZ - 2.3 - t * 1.5;
            pose.rootPosition.y = peakHeight - (1 - Math.cos(t * Math.PI)) * 0.2;
            pose.rootRotation.x = 0.2 + t * 0.5;

            pose.joints.leftAnkle.position = { x: -0.2 * scale, y: h * 0.4, z: 0.3 * scale };
            pose.joints.rightAnkle.position = { x: 0.2 * scale, y: h * 0.4, z: 0.3 * scale };

            pose.joints.leftShoulder.rotation = { x: 0.3, y: 0, z: 0.6 };
            pose.joints.rightShoulder.rotation = { x: 0.3, y: 0, z: -0.6 };
            pose.joints.leftWrist.position = { x: -0.4 * scale, y: h * 0.95, z: 0.2 };
            pose.joints.rightWrist.position = { x: 0.4 * scale, y: h * 0.95, z: 0.2 };

            pose.phase = 'release';
            pose.poleHeld = false;
            pose.polePlanted = false;

        } else if (this.simulatedPhase === 'fly') {
            this.simulatedProgress += deltaTime / flyDuration;
            if (this.simulatedProgress >= 1) {
                this.simulatedProgress = 0;
                this.simulatedPhase = 'land';
            }

            const t = this.simulatedProgress;
            const peakHeight = this.config.training.barHeight * 1.1;
            const fallHeight = this.config.scene.landingPadHeight;

            pose.rootPosition.z = boxPosZ - 3.8 - t * 1.5;
            pose.rootPosition.y = peakHeight - (peakHeight - fallHeight) * t * t;
            pose.rootRotation.x = 0.7 + t * 0.8;
            pose.rootRotation.z = t * 0.3;

            pose.joints.leftAnkle.position = { x: -0.25 * scale, y: h * 0.3, z: 0.25 * scale };
            pose.joints.rightAnkle.position = { x: 0.25 * scale, y: h * 0.3, z: 0.25 * scale };

            pose.phase = 'fly';
            pose.poleHeld = false;
            pose.polePlanted = false;

        } else if (this.simulatedPhase === 'land') {
            this.simulatedProgress += deltaTime / landDuration;
            if (this.simulatedProgress >= 1) {
                this.simulatedProgress = 0;
                this.simulatedPhase = 'idle';
            }

            const t = this.simulatedProgress;
            const padHeight = this.config.scene.landingPadHeight;

            pose.rootPosition.z = boxPosZ - 5.3;
            pose.rootPosition.y = padHeight + (1 - t) * 0.3;
            pose.rootRotation.x = 1.5 * (1 - t) + t * 0;
            pose.rootRotation.z = 0.3 * (1 - t);

            pose.joints.leftAnkle.position = { x: -0.2 * scale, y: (1 - t) * 0.2, z: 0.2 * scale };
            pose.joints.rightAnkle.position = { x: 0.2 * scale, y: (1 - t) * 0.2, z: 0.2 * scale };

            pose.phase = 'land';

        } else {
            pose.phase = 'idle';
        }

        this.updateJointHierarchy(pose);
    }

    sampleVRControllers(deltaTime) {
        const pose = this.currentPose;
        const h = this.config.physics.athleteHeight;
        const scale = h / 1.85;

        if (this.vrControllers) {
            const left = this.vrControllers.left();
            const right = this.vrControllers.right();

            if (left && left.visible) {
                pose.joints.leftWrist.position = {
                    x: left.position.x,
                    y: left.position.y - pose.rootPosition.y,
                    z: left.position.z - pose.rootPosition.z
                };
            }
            if (right && right.visible) {
                pose.joints.rightWrist.position = {
                    x: right.position.x,
                    y: right.position.y - pose.rootPosition.y,
                    z: right.position.z - pose.rootPosition.z
                };
            }
        }

        this.updateJointHierarchy(pose);
    }

    processExternalData(data) {
        const h = this.config.physics.athleteHeight;
        const pose = this.currentPose;
        this.lastExternalDataTime = performance.now();

        if (data.root_position) {
            pose.rootPosition = {
                x: data.root_position.x,
                y: data.root_position.y,
                z: data.root_position.z
            };
        }
        if (data.root_rotation) {
            pose.rootRotation = {
                x: data.root_rotation.x,
                y: data.root_rotation.y,
                z: data.root_rotation.z
            };
        }
        if (data.root_velocity) {
            pose.rootVelocity = {
                x: data.root_velocity.x,
                y: data.root_velocity.y,
                z: data.root_velocity.z
            };
        }

        if (data.joints) {
            for (const [jointName, jointData] of Object.entries(data.joints)) {
                if (pose.joints[jointName]) {
                    if (jointData.position) {
                        pose.joints[jointName].position = {
                            x: jointData.position.x,
                            y: jointData.position.y,
                            z: jointData.position.z
                        };
                    }
                    if (jointData.rotation) {
                        pose.joints[jointName].rotation = {
                            x: jointData.rotation.x,
                            y: jointData.rotation.y,
                            z: jointData.rotation.z
                        };
                    }
                }
            }
        }

        if (data.phase) pose.phase = data.phase;
        if (data.confidence !== undefined) pose.confidence = data.confidence;
        if (data.pole_held !== undefined) pose.poleHeld = data.pole_held;
        if (data.pole_planted !== undefined) pose.polePlanted = data.pole_planted;
        if (data.pole_plant_point) {
            pose.polePlantPoint = {
                x: data.pole_plant_point.x,
                y: data.pole_plant_point.y,
                z: data.pole_plant_point.z
            };
        }
        if (data.pole_bend_amount !== undefined) {
            pose.poleBendAmount = data.pole_bend_amount;
        }
    }

    updateJointHierarchy(pose) {
        const h = this.config.physics.athleteHeight;
        const scale = h / 1.85;

        pose.joints.torso.position = pose.joints.torso.position || { x: 0, y: h * 0.65, z: 0 };
        pose.joints.hip.position = pose.joints.hip.position || { x: 0, y: h * 0.45, z: 0 };
        pose.joints.head.position = pose.joints.head.position || { x: 0, y: h * 0.95, z: 0 };
        pose.joints.neck.position = pose.joints.neck.position || { x: 0, y: h * 0.88, z: 0 };
    }

    smoothPose() {
        const alpha = this.smoothingFactor;
        const beta = 1 - alpha;

        this.smoothedPose.timestamp = this.currentPose.timestamp;
        this.smoothedPose.phase = this.currentPose.phase;
        this.smoothedPose.confidence = this.currentPose.confidence;
        this.smoothedPose.poleHeld = this.currentPose.poleHeld;
        this.smoothedPose.polePlanted = this.currentPose.polePlanted;
        this.smoothedPose.polePlantPoint = this.currentPose.polePlantPoint;
        this.smoothedPose.poleBendAmount = this.currentPose.poleBendAmount;

        this.smoothedPose.rootPosition = {
            x: alpha * this.smoothedPose.rootPosition.x + beta * this.currentPose.rootPosition.x,
            y: alpha * this.smoothedPose.rootPosition.y + beta * this.currentPose.rootPosition.y,
            z: alpha * this.smoothedPose.rootPosition.z + beta * this.currentPose.rootPosition.z
        };
        this.smoothedPose.rootRotation = {
            x: alpha * this.smoothedPose.rootRotation.x + beta * this.currentPose.rootRotation.x,
            y: alpha * this.smoothedPose.rootRotation.y + beta * this.currentPose.rootRotation.y,
            z: alpha * this.smoothedPose.rootRotation.z + beta * this.currentPose.rootRotation.z
        };
        this.smoothedPose.rootVelocity = {
            x: alpha * this.smoothedPose.rootVelocity.x + beta * this.currentPose.rootVelocity.x,
            y: alpha * this.smoothedPose.rootVelocity.y + beta * this.currentPose.rootVelocity.y,
            z: alpha * this.smoothedPose.rootVelocity.z + beta * this.currentPose.rootVelocity.z
        };

        for (const jointName of Object.keys(this.smoothedPose.joints)) {
            const current = this.currentPose.joints[jointName];
            const smoothed = this.smoothedPose.joints[jointName];

            if (current && smoothed) {
                smoothed.position = {
                    x: alpha * smoothed.position.x + beta * current.position.x,
                    y: alpha * smoothed.position.y + beta * current.position.y,
                    z: alpha * smoothed.position.z + beta * current.position.z
                };
                smoothed.rotation = {
                    x: alpha * smoothed.rotation.x + beta * current.rotation.x,
                    y: alpha * smoothed.rotation.y + beta * current.rotation.y,
                    z: alpha * smoothed.rotation.z + beta * current.rotation.z
                };
            }
        }
    }

    getPoseData() {
        return this.smoothedPose;
    }

    getRawPoseData() {
        return this.currentPose;
    }

    getPoseHistory(durationSeconds = 2) {
        const sampleCount = Math.floor(durationSeconds * this.sampleRate);
        return this.poseHistory.slice(-sampleCount);
    }

    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.listeners[event]) {
            const idx = this.listeners[event].indexOf(callback);
            if (idx > -1) {
                this.listeners[event].splice(idx, 1);
            }
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            for (const callback of this.listeners[event]) {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`[MotionCapture] 事件回调错误 (${event}):`, e);
                }
            }
        }
    }

    setDeviceType(type) {
        this.deviceType = type;
        if (type === 'external_mocap') {
            this.initExternalMocap();
        }
    }

    triggerSimulatedJump() {
        this.simulatedPhase = 'approach';
        this.simulatedProgress = 0;
        this.simulatedTime = 0;
    }

    dispose() {
        this.stop();
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.listeners = {};
        this.poseHistory = [];
    }
}
