export class ActionAnalyzer {
    constructor(config) {
        this.config = config;
        this.analysis = this.config.analysis;
        this.feedbackSystem = null;

        this.currentPhase = 'idle';
        this.previousPhase = 'idle';
        this.phaseChangeTime = 0;

        this.approachData = {
            positions: [],
            velocities: [],
            speeds: [],
            stepTimes: [],
            stepLengths: [],
            cadence: 0,
            finalSpeed: 0,
            speedProfile: []
        };

        this.takeoffData = {
            takeoffTime: null,
            takeoffPosition: null,
            takeoffAngle: 0,
            takeoffVelocity: null,
            horizontalSpeed: 0,
            verticalSpeed: 0,
            forceImpulse: 0,
            plantTime: null,
            plantPosition: null,
            plantAngle: 0
        };

        this.swingData = {
            startTime: null,
            endTime: null,
            duration: 0,
            maxHeight: 0,
            hipHeight: [],
            angularVelocity: []
        };

        this.extensionData = {
            startTime: null,
            endTime: null,
            duration: 0,
            pushTiming: 0,
            poleReleaseTime: null
        };

        this.flyData = {
            startTime: null,
            endTime: null,
            duration: 0,
            maxHeight: 0,
            barClearance: 0,
            bodyConfig: null
        };

        this.landingData = {
            landTime: null,
            landPosition: null,
            landVelocity: null,
            rotationCompleted: false
        };

        this.poleData = {
            bendHistory: [],
            maxBend: 0,
            bendAtTakeoff: 0,
            bendAtRelease: 0,
            energyStored: 0,
            energyReturn: 0
        };

        this.jumpHistory = [];
        this.currentJump = null;
        this.lastAnalysisTime = 0;
        this.analysisInterval = 16;
        this.feedbackHistory = new Map();

        this.bestJump = null;
        this.averageScores = {
            approach: 0,
            takeoff: 0,
            swing: 0,
            extension: 0,
            fly: 0,
            overall: 0,
            jumpsCount: 0
        };
    }

    setFeedbackSystem(system) {
        this.feedbackSystem = system;
    }

    reset() {
        this.currentPhase = 'idle';
        this.previousPhase = 'idle';
        this.phaseChangeTime = 0;

        this.approachData = {
            positions: [],
            velocities: [],
            speeds: [],
            stepTimes: [],
            stepLengths: [],
            cadence: 0,
            finalSpeed: 0,
            speedProfile: []
        };

        this.takeoffData = {
            takeoffTime: null,
            takeoffPosition: null,
            takeoffAngle: 0,
            takeoffVelocity: null,
            horizontalSpeed: 0,
            verticalSpeed: 0,
            forceImpulse: 0,
            plantTime: null,
            plantPosition: null,
            plantAngle: 0
        };

        this.swingData = {
            startTime: null,
            endTime: null,
            duration: 0,
            maxHeight: 0,
            hipHeight: [],
            angularVelocity: []
        };

        this.extensionData = {
            startTime: null,
            endTime: null,
            duration: 0,
            pushTiming: 0,
            poleReleaseTime: null
        };

        this.flyData = {
            startTime: null,
            endTime: null,
            duration: 0,
            maxHeight: 0,
            barClearance: 0,
            bodyConfig: null
        };

        this.landingData = {
            landTime: null,
            landPosition: null,
            landVelocity: null,
            rotationCompleted: false
        };

        this.poleData = {
            bendHistory: [],
            maxBend: 0,
            bendAtTakeoff: 0,
            bendAtRelease: 0,
            energyStored: 0,
            energyReturn: 0
        };

        this.currentJump = null;
        this.feedbackHistory.clear();
    }

    analyze(poseData, deltaTime) {
        if (!poseData) return null;

        const now = performance.now();
        if (now - this.lastAnalysisTime < this.analysisInterval) {
            return {
                phase: this.currentPhase,
                metrics: this.getCurrentMetrics()
            };
        }
        this.lastAnalysisTime = now;

        this.detectPhase(poseData);
        this.collectPhaseData(poseData, deltaTime);
        const feedbacks = this.generateFeedback(poseData);

        const result = {
            timestamp: now,
            phase: this.currentPhase,
            previousPhase: this.previousPhase,
            metrics: this.getCurrentMetrics(),
            feedbacks: feedbacks,
            jump: this.currentJump,
            barHeight: this.config.training.barHeight
        };

        if (this.currentJump && this.currentPhase === 'idle' && this.previousPhase === 'land') {
            this.finalizeJump();
        }

        return result;
    }

    detectPhase(poseData) {
        if (poseData.phase && poseData.phase !== this.currentPhase) {
            this.previousPhase = this.currentPhase;
            this.currentPhase = poseData.phase;
            this.phaseChangeTime = performance.now();
            this.onPhaseChange();
            return;
        }

        if (!poseData.phase) {
            const pos = poseData.rootPosition;
            const vel = poseData.rootVelocity || { x: 0, y: 0, z: 0 };
            const h = this.config.physics.athleteHeight;

            const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
            const boxZ = -0.6;
            const threshold = 5.0;

            if (pos.z > boxZ + 2 && speed < 0.3 && pos.y < 0.1) {
                this.setPhase('idle');
            } else if (pos.z > boxZ + 1 && Math.abs(vel.z) > 0.5) {
                this.setPhase('approach');
            } else if (Math.abs(pos.z - boxZ) < 1.5 && poseData.polePlanted) {
                this.setPhase('plant');
            } else if (poseData.polePlanted && pos.y > h * 0.3 && pos.y < h * 1.2) {
                this.setPhase('swing');
            } else if (poseData.polePlanted && pos.y >= h * 1.2) {
                this.setPhase('extension');
            } else if (!poseData.polePlanted && pos.y > this.config.training.barHeight * 0.8) {
                this.setPhase('fly');
            } else if (pos.y < h * 0.5 && this.previousPhase === 'fly') {
                this.setPhase('land');
            }
        }
    }

    setPhase(phase) {
        if (phase !== this.currentPhase) {
            this.previousPhase = this.currentPhase;
            this.currentPhase = phase;
            this.phaseChangeTime = performance.now();
            this.onPhaseChange();
        }
    }

    onPhaseChange() {
        const now = this.phaseChangeTime;

        switch (this.currentPhase) {
            case 'approach':
                this.currentJump = this.createNewJump();
                this.approachData = this.createEmptyApproachData();
                break;

            case 'plant':
                this.takeoffData.plantTime = now;
                this.takeoffData.plantPosition = this.getLastPosition();
                break;

            case 'swing':
                this.swingData.startTime = now;
                this.takeoffData.takeoffTime = now;
                this.takeoffData.takeoffPosition = this.getLastPosition();
                this.calculateTakeoffAngle();
                this.poleData.bendAtTakeoff = this.getCurrentBend();
                break;

            case 'extension':
                this.swingData.endTime = now;
                this.swingData.duration = (now - this.swingData.startTime) / 1000;
                this.extensionData.startTime = now;
                break;

            case 'fly':
                this.extensionData.endTime = now;
                this.extensionData.duration = (now - this.extensionData.startTime) / 1000;
                this.flyData.startTime = now;
                this.poleData.bendAtRelease = this.getCurrentBend();
                this.extensionData.poleReleaseTime = now;
                break;

            case 'land':
                this.flyData.endTime = now;
                this.flyData.duration = (now - this.flyData.startTime) / 1000;
                this.landingData.landTime = now;
                this.landingData.landPosition = this.getLastPosition();
                break;
        }

        if (this.feedbackSystem) {
            this.feedbackSystem.onPhaseChange(this.currentPhase, this.previousPhase);
        }
    }

    createNewJump() {
        return {
            id: Date.now(),
            startTime: performance.now(),
            endTime: null,
            barHeight: this.config.training.barHeight,
            scores: {
                approach: 0,
                takeoff: 0,
                swing: 0,
                extension: 0,
                fly: 0,
                overall: 0
            },
            metrics: {},
            feedbacks: [],
            success: false,
            barClearance: 0
        };
    }

    createEmptyApproachData() {
        return {
            positions: [],
            velocities: [],
            speeds: [],
            stepTimes: [],
            stepLengths: [],
            cadence: 0,
            finalSpeed: 0,
            speedProfile: []
        };
    }

    collectPhaseData(poseData, deltaTime) {
        const pos = poseData.rootPosition;
        const vel = poseData.rootVelocity || { x: 0, y: 0, z: 0 };
        const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
        const hSpeed = Math.sqrt(vel.x ** 2 + vel.z ** 2);

        switch (this.currentPhase) {
            case 'approach':
                this.collectApproachData(pos, vel, speed, deltaTime);
                break;

            case 'plant':
                if (poseData.polePlantPoint) {
                    this.takeoffData.plantAngle = this.calculatePlantAngle(poseData);
                }
                break;

            case 'swing':
                this.swingData.hipHeight.push(pos.y);
                this.swingData.maxHeight = Math.max(this.swingData.maxHeight, pos.y);
                this.updatePoleBend(poseData);
                break;

            case 'extension':
                this.updatePoleBend(poseData);
                break;

            case 'fly':
                this.flyData.maxHeight = Math.max(this.flyData.maxHeight, pos.y);
                const barY = this.config.training.barHeight;
                const headY = pos.y + this.config.physics.athleteHeight * 0.9;
                if (Math.abs(pos.z + 2.5) < 0.5 && pos.x < 2) {
                    this.flyData.barClearance = headY - barY;
                }
                break;

            case 'land':
                if (poseData.rootRotation) {
                    this.landingData.rotationCompleted =
                        Math.abs(poseData.rootRotation.x) > Math.PI * 0.7;
                }
                break;
        }

        if (poseData.poleBendAmount !== undefined) {
            this.poleData.bendHistory.push({
                time: performance.now(),
                bend: poseData.poleBendAmount
            });
            this.poleData.maxBend = Math.max(this.poleData.maxBend, poseData.poleBendAmount);
        }
    }

    collectApproachData(pos, vel, speed, deltaTime) {
        this.approachData.positions.push({ ...pos, time: performance.now() });
        this.approachData.velocities.push({ ...vel, time: performance.now() });
        this.approachData.speeds.push(speed);
        this.approachData.speedProfile.push({
            z: pos.z,
            speed: speed,
            time: performance.now()
        });
        this.approachData.finalSpeed = speed;

        if (this.approachData.positions.length >= 2) {
            const p1 = this.approachData.positions[this.approachData.positions.length - 2];
            const p2 = this.approachData.positions[this.approachData.positions.length - 1];
            const timeDiff = (p2.time - p1.time) / 1000;
            if (timeDiff > 0.25) {
                const stepLen = Math.abs(p2.z - p1.z);
                if (stepLen > 0.3) {
                    this.approachData.stepTimes.push(timeDiff);
                    this.approachData.stepLengths.push(stepLen);
                    const steps = this.approachData.stepTimes.length;
                    const totalTime = this.approachData.stepTimes.reduce((a, b) => a + b, 0);
                    this.approachData.cadence = steps > 0 ? (steps / totalTime) * 60 : 0;
                }
            }
        }
    }

    calculateTakeoffAngle() {
        const vel = this.approachData.velocities.length > 0
            ? this.approachData.velocities[this.approachData.velocities.length - 1]
            : { x: 0, y: 0, z: 0 };

        const horizontalSpeed = Math.sqrt(vel.x ** 2 + vel.z ** 2);
        const verticalSpeed = vel.y;

        this.takeoffData.horizontalSpeed = horizontalSpeed;
        this.takeoffData.verticalSpeed = verticalSpeed;
        this.takeoffData.takeoffAngle = Math.atan2(verticalSpeed, horizontalSpeed) * (180 / Math.PI);
        this.takeoffData.takeoffVelocity = { ...vel };
    }

    calculatePlantAngle(poseData) {
        const plant = poseData.polePlantPoint;
        const root = poseData.rootPosition;
        const dx = root.x - plant.x;
        const dy = (root.y + 1.0) - plant.y;
        const dz = root.z - plant.z;
        const horizontal = Math.sqrt(dx * dx + dz * dz);
        return Math.atan2(dy, horizontal) * (180 / Math.PI);
    }

    getCurrentBend() {
        return this.poleData.bendHistory.length > 0
            ? this.poleData.bendHistory[this.poleData.bendHistory.length - 1].bend
            : 0;
    }

    getLastPosition() {
        if (this.approachData.positions.length > 0) {
            return { ...this.approachData.positions[this.approachData.positions.length - 1] };
        }
        return { x: 0, y: 0, z: 0 };
    }

    updatePoleBend(poseData) {
        if (poseData.poleBendAmount !== undefined) {
            this.poleData.maxBend = Math.max(this.poleData.maxBend, poseData.poleBendAmount);
        }
    }

    generateFeedback(poseData) {
        const feedbacks = [];
        const now = performance.now();
        const a = this.analysis;

        const addFeedback = (type, message, severity, value, ideal, range) => {
            const key = `${type}_${message}`;
            const lastTime = this.feedbackHistory.get(key) || 0;
            const cooldown = this.config.feedback.cooldownTime * 1000;

            if (now - lastTime >= cooldown) {
                this.feedbackHistory.set(key, now);
                feedbacks.push({ type, message, severity, value, ideal, range, timestamp: now });
                if (this.currentJump) {
                    this.currentJump.feedbacks.push({ type, message, severity, value, ideal, range });
                }
            }
        };

        switch (this.currentPhase) {
            case 'approach':
                this.generateApproachFeedback(addFeedback, a);
                break;

            case 'plant':
                this.generatePlantFeedback(addFeedback, a, poseData);
                break;

            case 'swing':
                this.generateSwingFeedback(addFeedback, a, poseData);
                break;

            case 'extension':
                this.generateExtensionFeedback(addFeedback, a, poseData);
                break;

            case 'fly':
                this.generateFlyFeedback(addFeedback, a, poseData);
                break;

            case 'land':
                this.generateLandingFeedback(addFeedback, poseData);
                break;
        }

        return feedbacks;
    }

    generateApproachFeedback(addFeedback, a) {
        const finalSpeed = this.approachData.finalSpeed;
        const idealSpeed = a.idealApproachSpeed;

        if (this.approachData.speeds.length > 20) {
            if (finalSpeed > 0) {
                if (finalSpeed < idealSpeed * 0.9) {
                    addFeedback(
                        'approach_speed',
                        `助跑速度偏慢 (${finalSpeed.toFixed(1)} m/s)，目标 ${idealSpeed} m/s`,
                        finalSpeed < idealSpeed * 0.8 ? 'error' : 'warning',
                        finalSpeed,
                        idealSpeed,
                        [idealSpeed * 0.95, idealSpeed * 1.05]
                    );
                } else if (finalSpeed > idealSpeed * 1.05) {
                    addFeedback(
                        'approach_speed',
                        `助跑速度略快 (${finalSpeed.toFixed(1)} m/s)，注意控制节奏`,
                        'warning',
                        finalSpeed,
                        idealSpeed,
                        [idealSpeed * 0.95, idealSpeed * 1.05]
                    );
                }
            }

            if (this.approachData.speedProfile.length > 10) {
                const half = Math.floor(this.approachData.speedProfile.length / 2);
                const firstHalf = this.approachData.speedProfile.slice(0, half);
                const secondHalf = this.approachData.speedProfile.slice(half);
                const avgFirst = firstHalf.reduce((s, p) => s + p.speed, 0) / firstHalf.length;
                const avgSecond = secondHalf.reduce((s, p) => s + p.speed, 0) / secondHalf.length;

                if (avgSecond < avgFirst * 1.1) {
                    addFeedback(
                        'speed_accel',
                        '后程加速不足，最后几步应继续加速',
                        'warning',
                        avgSecond / avgFirst,
                        1.2,
                        [1.15, 1.3]
                    );
                }
            }
        }

        if (this.approachData.stepLengths.length > 4) {
            const recent = this.approachData.stepLengths.slice(-4);
            const avgStep = recent.reduce((s, l) => s + l, 0) / recent.length;
            const idealStep = 2.3;

            if (avgStep < idealStep * 0.85) {
                addFeedback(
                    'step_length',
                    `步长偏小 (${avgStep.toFixed(2)} m)，尝试加大步幅`,
                    'warning',
                    avgStep,
                    idealStep,
                    [idealStep * 0.9, idealStep * 1.1]
                );
            } else if (avgStep > idealStep * 1.15) {
                addFeedback(
                    'step_length',
                    `步长偏大 (${avgStep.toFixed(2)} m)，注意步频平衡`,
                    'info',
                    avgStep,
                    idealStep,
                    [idealStep * 0.9, idealStep * 1.1]
                );
            }
        }

        if (this.approachData.cadence > 0) {
            if (this.approachData.cadence < 180) {
                addFeedback(
                    'cadence',
                    `步频偏低 (${this.approachData.cadence.toFixed(0)} 步/分)`,
                    'info',
                    this.approachData.cadence,
                    200,
                    [190, 210]
                );
            }
        }
    }

    generatePlantFeedback(addFeedback, a, poseData) {
        const plantAngle = this.takeoffData.plantAngle || this.calculatePlantAngle(poseData);
        const idealAngle = a.idealPlantAngle;

        if (plantAngle > 0) {
            if (plantAngle < a.minPlantAngle) {
                addFeedback(
                    'plant_angle',
                    `插杆角度偏小 (${plantAngle.toFixed(0)}°)，杆身过平`,
                    'error',
                    plantAngle,
                    idealAngle,
                    [a.minPlantAngle, a.maxPlantAngle]
                );
            } else if (plantAngle > a.maxPlantAngle) {
                addFeedback(
                    'plant_angle',
                    `插杆角度偏大 (${plantAngle.toFixed(0)}°)，杆身过陡`,
                    'warning',
                    plantAngle,
                    idealAngle,
                    [a.minPlantAngle, a.maxPlantAngle]
                );
            }
        }

        if (this.approachData.finalSpeed > 0) {
            const speedRatio = this.approachData.finalSpeed / a.idealApproachSpeed;
            if (speedRatio < 0.85) {
                addFeedback(
                    'plant_speed',
                    '插杆时速度不足，起跳力量会受影响',
                    'warning',
                    speedRatio,
                    1.0,
                    [0.95, 1.05]
                );
            }
        }
    }

    generateSwingFeedback(addFeedback, a, poseData) {
        const bend = poseData.poleBendAmount || this.getCurrentBend();
        const idealBend = a.idealPoleBend;

        if (bend > 0 && this.swingData.startTime) {
            const elapsed = (performance.now() - this.swingData.startTime) / 1000;
            if (elapsed > 0.2 && elapsed < 0.5) {
                if (bend < a.minPoleBend) {
                    addFeedback(
                        'pole_bend',
                        `杆弯曲不足 (${(bend * 100).toFixed(0)}%)，需更主动发力`,
                        'warning',
                        bend,
                        idealBend,
                        [a.minPoleBend, a.maxPoleBend]
                    );
                } else if (bend > a.maxPoleBend) {
                    addFeedback(
                        'pole_bend',
                        `杆弯曲过大 (${(bend * 100).toFixed(0)}%)，可能过头了`,
                        'warning',
                        bend,
                        idealBend,
                        [a.minPoleBend, a.maxPoleBend]
                    );
                }
            }

            if (this.swingData.hipHeight.length > 10 && elapsed > 0.3) {
                const recent = this.swingData.hipHeight.slice(-10);
                const avgRise = recent[recent.length - 1] - recent[0];
                if (avgRise < 0.3) {
                    addFeedback(
                        'swing_hip',
                        '髋部上升缓慢，摆动腿发力不足',
                        'warning',
                        avgRise,
                        0.8,
                        [0.6, 1.0]
                    );
                }
            }
        }
    }

    generateExtensionFeedback(addFeedback, a, poseData) {
        if (this.extensionData.startTime) {
            const elapsed = (performance.now() - this.extensionData.startTime) / 1000;
            const h = this.config.physics.athleteHeight;
            const barH = this.config.training.barHeight;
            const hipY = poseData.rootPosition.y;

            if (elapsed > 0.15 && elapsed < 0.35) {
                if (hipY < barH * 0.9) {
                    addFeedback(
                        'extension_timing',
                        '推杆时机稍晚，应在杆最大弯曲后立即推',
                        'warning',
                        elapsed,
                        0.2,
                        [0.15, 0.25]
                    );
                }
            }

            if (elapsed > 0.25 && poseData.poleBendAmount > 0.1) {
                const remainingBend = poseData.poleBendAmount / Math.max(this.poleData.maxBend, 0.01);
                if (remainingBend > 0.5) {
                    addFeedback(
                        'extension_push',
                        '推杆不够充分，应完全伸直手臂',
                        'info',
                        1 - remainingBend,
                        1.0,
                        [0.7, 1.0]
                    );
                }
            }
        }
    }

    generateFlyFeedback(addFeedback, a, poseData) {
        const barH = this.config.training.barHeight;
        const h = this.config.physics.athleteHeight;
        const headY = poseData.rootPosition.y + h * 0.9;
        const hipY = poseData.rootPosition.y + h * 0.45;

        if (Math.abs(poseData.rootPosition.z + 2.5) < 0.8) {
            if (headY < barH) {
                addFeedback(
                    'bar_clearance',
                    `高度不够！头部距杆 ${(barH - headY).toFixed(2)} m`,
                    'error',
                    headY - barH,
                    0.15,
                    [0.1, 0.3]
                );
            } else if (hipY < barH && poseData.rootRotation.x < 1.0) {
                addFeedback(
                    'body_rotation',
                    '身体旋转不足，髋部可能碰杆',
                    'warning',
                    poseData.rootRotation.x,
                    1.57,
                    [1.2, 1.8]
                );
            } else if (headY > barH + 0.3) {
                addFeedback(
                    'excess_height',
                    `过杆余量充足 (${(headY - barH).toFixed(2)} m)，优秀！`,
                    'success',
                    headY - barH,
                    0.15,
                    [0.1, 0.3]
                );
            }
        }
    }

    generateLandingFeedback(addFeedback, poseData) {
        const padZ = -5;
        const padHalfLen = this.config.scene.landingPadLength / 2;
        const padHalfWid = this.config.scene.landingPadWidth / 2;
        const pos = poseData.rootPosition;

        const inPad = pos.z > padZ - padHalfLen && pos.z < padZ + padHalfLen &&
                      pos.x > -padHalfWid && pos.x < padHalfWid;

        if (!inPad && this.landingData.landTime) {
            addFeedback(
                'landing_accuracy',
                '落点偏离海绵垫，注意安全！',
                'error',
                null,
                null,
                null
            );
        }

        if (!this.landingData.rotationCompleted) {
            addFeedback(
                'landing_rotation',
                '过杆后旋转完成度不够',
                'warning',
                null,
                null,
                null
            );
        }
    }

    finalizeJump() {
        if (!this.currentJump) return;

        this.currentJump.endTime = performance.now();
        const duration = (this.currentJump.endTime - this.currentJump.startTime) / 1000;

        const scores = this.calculateScores();
        this.currentJump.scores = scores;

        this.currentJump.metrics = {
            duration,
            barHeight: this.config.training.barHeight,
            approachFinalSpeed: this.approachData.finalSpeed,
            cadence: this.approachData.cadence,
            takeoffAngle: this.takeoffData.takeoffAngle,
            plantAngle: this.takeoffData.plantAngle,
            poleMaxBend: this.poleData.maxBend,
            swingDuration: this.swingData.duration,
            extensionDuration: this.extensionData.duration,
            maxHeight: this.flyData.maxHeight,
            barClearance: this.flyData.barClearance,
            barCrossed: this.flyData.barClearance > 0 || this.flyData.maxHeight > this.config.training.barHeight + 0.5
        };

        this.currentJump.success = this.currentJump.metrics.barCrossed &&
                                    !this.currentJump.feedbacks.some(f => f.severity === 'error' && f.type.includes('bar_'));

        this.currentJump.barClearance = this.flyData.barClearance;

        this.jumpHistory.push(this.currentJump);
        if (this.jumpHistory.length > 100) {
            this.jumpHistory.shift();
        }

        this.updateAverageScores(scores);

        if (!this.bestJump || scores.overall > this.bestJump.scores.overall) {
            this.bestJump = this.currentJump;
        }

        if (this.feedbackSystem) {
            this.feedbackSystem.onJumpComplete(this.currentJump);
        }

        return this.currentJump;
    }

    calculateScores() {
        const a = this.analysis;
        const scores = {
            approach: 0,
            takeoff: 0,
            swing: 0,
            extension: 0,
            fly: 0,
            overall: 0
        };

        const speedRatio = this.approachData.finalSpeed / a.idealApproachSpeed;
        scores.approach = this.scoreGaussian(speedRatio, 1.0, 0.1) * 100;

        const angleRatio = this.takeoffData.takeoffAngle / a.idealTakeoffAngle;
        scores.takeoff = this.scoreGaussian(angleRatio, 1.0, 0.15) * 60;
        if (this.takeoffData.plantAngle > 0) {
            const plantRatio = this.takeoffData.plantAngle / a.idealPlantAngle;
            scores.takeoff += this.scoreGaussian(plantRatio, 1.0, 0.1) * 40;
        }

        const bendRatio = this.poleData.maxBend / a.idealPoleBend;
        scores.swing = this.scoreGaussian(bendRatio, 1.0, 0.25) * 50;
        if (this.swingData.duration > 0) {
            const swingRatio = this.swingData.duration / a.swingPhaseDuration;
            scores.swing += this.scoreGaussian(swingRatio, 1.0, 0.2) * 50;
        }

        if (this.extensionData.duration > 0) {
            const extRatio = this.extensionData.duration / a.extensionPhaseDuration;
            scores.extension = this.scoreGaussian(extRatio, 1.0, 0.25) * 100;
        } else {
            scores.extension = 50;
        }

        const barClearance = this.flyData.barClearance;
        if (barClearance > 0) {
            scores.fly = Math.min(100, (barClearance / 0.2) * 100);
        } else {
            scores.fly = Math.max(0, 50 + barClearance * 200);
        }
        if (this.landingData.rotationCompleted) {
            scores.fly = Math.min(100, scores.fly + 10);
        }

        const weights = { approach: 0.2, takeoff: 0.25, swing: 0.2, extension: 0.2, fly: 0.15 };
        scores.overall =
            scores.approach * weights.approach +
            scores.takeoff * weights.takeoff +
            scores.swing * weights.swing +
            scores.extension * weights.extension +
            scores.fly * weights.fly;

        return scores;
    }

    scoreGaussian(value, mean, sigma) {
        const x = (value - mean) / sigma;
        return Math.exp(-0.5 * x * x);
    }

    updateAverageScores(newScores) {
        const count = this.averageScores.jumpsCount;
        const newCount = count + 1;

        this.averageScores.approach = (this.averageScores.approach * count + newScores.approach) / newCount;
        this.averageScores.takeoff = (this.averageScores.takeoff * count + newScores.takeoff) / newCount;
        this.averageScores.swing = (this.averageScores.swing * count + newScores.swing) / newCount;
        this.averageScores.extension = (this.averageScores.extension * count + newScores.extension) / newCount;
        this.averageScores.fly = (this.averageScores.fly * count + newScores.fly) / newCount;
        this.averageScores.overall = (this.averageScores.overall * count + newScores.overall) / newCount;
        this.averageScores.jumpsCount = newCount;
    }

    getCurrentMetrics() {
        return {
            phase: this.currentPhase,
            phaseDuration: (performance.now() - this.phaseChangeTime) / 1000,
            approach: {
                currentSpeed: this.approachData.finalSpeed,
                speedProfile: [...this.approachData.speedProfile].slice(-30),
                cadence: this.approachData.cadence,
                stepCount: this.approachData.stepTimes.length
            },
            takeoff: {
                takeoffAngle: this.takeoffData.takeoffAngle,
                plantAngle: this.takeoffData.plantAngle,
                horizontalSpeed: this.takeoffData.horizontalSpeed,
                verticalSpeed: this.takeoffData.verticalSpeed
            },
            pole: {
                currentBend: this.getCurrentBend(),
                maxBend: this.poleData.maxBend
            },
            height: {
                current: this.getLastPosition().y,
                maxSwing: this.swingData.maxHeight,
                maxFly: this.flyData.maxHeight
            },
            bar: {
                height: this.config.training.barHeight,
                clearance: this.flyData.barClearance
            },
            timing: {
                swingDuration: this.swingData.duration,
                extensionDuration: this.extensionData.duration
            }
        };
    }

    getJumpHistory() {
        return this.jumpHistory;
    }

    getBestJump() {
        return this.bestJump;
    }

    getAverageScores() {
        return this.averageScores;
    }

    getPhaseDuration() {
        return (performance.now() - this.phaseChangeTime) / 1000;
    }

    getSummaryReport() {
        return {
            totalJumps: this.jumpHistory.length,
            averageScores: this.averageScores,
            bestJump: this.bestJump ? {
                score: this.bestJump.scores.overall,
                barHeight: this.bestJump.barHeight,
                date: this.bestJump.startTime
            } : null,
            recentJumps: this.jumpHistory.slice(-10).map(j => ({
                id: j.id,
                score: j.scores.overall,
                barHeight: j.barHeight,
                success: j.success,
                duration: (j.endTime - j.startTime) / 1000
            }))
        };
    }
}
