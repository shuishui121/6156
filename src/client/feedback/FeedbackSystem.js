import * as THREE from 'three';

export class FeedbackSystem {
    constructor(uiRoot, config) {
        this.uiRoot = uiRoot;
        this.config = config;
        this.feedbackConfig = config.feedback;

        this.activeMessages = [];
        this.messageContainer = null;
        this.voiceSynthesizer = null;
        this.visualObjects = new Map();
        this.scene = null;

        this.lastVoiceTime = 0;
        this.voiceCooldown = config.feedback.cooldownTime * 1000 * 2;

        this.phaseIndicator = null;
        this.performanceTrail = [];
        this.trailPoints = 100;

        this.speedIndicator = null;
        this.angleIndicator = null;
        this.heightIndicator = null;

        this.initDOM();
        this.initVoice();
    }

    initDOM() {
        this.messageContainer = document.createElement('div');
        this.messageContainer.id = 'feedback-messages';
        this.messageContainer.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            pointer-events: none;
            width: 90%;
            max-width: 600px;
        `;
        this.uiRoot.appendChild(this.messageContainer);

        const style = document.createElement('style');
        style.textContent = `
            .feedback-msg {
                padding: 14px 28px;
                border-radius: 8px;
                font-size: 18px;
                font-weight: 600;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                animation: feedback-slide-in 0.3s ease-out, feedback-fade-out 0.5s ease-in 3.5s forwards;
                backdrop-filter: blur(8px);
                text-align: center;
                line-height: 1.4;
                border: 2px solid transparent;
            }
            .feedback-msg.error {
                background: rgba(231, 76, 60, 0.9);
                border-color: #ff6b6b;
                color: #fff;
            }
            .feedback-msg.warning {
                background: rgba(241, 196, 15, 0.9);
                border-color: #ffd93d;
                color: #000;
            }
            .feedback-msg.success {
                background: rgba(46, 204, 113, 0.9);
                border-color: #6bcb77;
                color: #fff;
            }
            .feedback-msg.info {
                background: rgba(52, 152, 219, 0.9);
                border-color: #4dabf7;
                color: #fff;
            }
            @keyframes feedback-slide-in {
                from { opacity: 0; transform: translateY(-30px) scale(0.9); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes feedback-fade-out {
                to { opacity: 0; transform: translateY(-10px); }
            }

            .phase-badge {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 10px 24px;
                background: rgba(0,0,0,0.75);
                color: #fff;
                border-radius: 24px;
                font-size: 16px;
                font-weight: 700;
                z-index: 999;
                backdrop-filter: blur(10px);
                border: 2px solid rgba(255,255,255,0.1);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .phase-badge.approach { border-color: #3498db; color: #5dade2; }
            .phase-badge.plant { border-color: #e67e22; color: #f5b041; }
            .phase-badge.swing { border-color: #9b59b6; color: #bb8fce; }
            .phase-badge.extension { border-color: #27ae60; color: #58d68d; }
            .phase-badge.fly { border-color: #3498db; color: #85c1e9; }
            .phase-badge.land { border-color: #1abc9c; color: #76d7c4; }
            .phase-badge.idle { border-color: #95a5a6; color: #bdc3c7; }
        `;
        document.head.appendChild(style);

        this.phaseBadge = document.createElement('div');
        this.phaseBadge.className = 'phase-badge idle';
        this.phaseBadge.textContent = '待机';
        this.uiRoot.appendChild(this.phaseBadge);
    }

    initVoice() {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            this.voiceSynthesizer = window.speechSynthesis;
            setTimeout(() => {
                if (this.voiceSynthesizer) {
                    const voices = this.voiceSynthesizer.getVoices();
                    this.chineseVoice = voices.find(v => v.lang.includes('zh')) || voices[0];
                }
            }, 1000);
        }
    }

    setScene(scene) {
        this.scene = scene;
    }

    showMessage(message, severity = 'info', duration = 4000) {
        const msgEl = document.createElement('div');
        msgEl.className = `feedback-msg ${severity}`;
        msgEl.textContent = message;
        this.messageContainer.appendChild(msgEl);

        setTimeout(() => {
            if (msgEl.parentNode) {
                msgEl.parentNode.removeChild(msgEl);
            }
        }, duration);

        this.activeMessages.push({
            element: msgEl,
            message,
            severity,
            createdAt: performance.now()
        });

        if (this.feedbackConfig.voiceEnabled) {
            this.speak(message, severity);
        }
    }

    speak(text, severity = 'info') {
        if (!this.voiceSynthesizer || !this.feedbackConfig.voiceEnabled) return;

        const now = performance.now();
        if (now - this.lastVoiceTime < this.voiceCooldown && severity === 'info') return;

        if (severity === 'error' || severity === 'success') {
            this.lastVoiceTime = now;
        } else if (severity === 'warning') {
            this.lastVoiceTime = now - this.voiceCooldown / 2;
        }

        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'zh-CN';
            utterance.rate = severity === 'error' ? 1.1 : 1.0;
            utterance.pitch = severity === 'success' ? 1.1 : 1.0;
            utterance.volume = this.feedbackConfig.volume;

            if (this.chineseVoice) {
                utterance.voice = this.chineseVoice;
            }

            this.voiceSynthesizer.cancel();
            this.voiceSynthesizer.speak(utterance);
        } catch (e) {
            console.warn('[FeedbackSystem] 语音合成失败:', e);
        }
    }

    processAnalysis(analysis) {
        if (!analysis || !analysis.feedbacks) return;

        for (const feedback of analysis.feedbacks) {
            this.showMessage(feedback.message, feedback.severity);

            if (this.scene && this.feedbackConfig.visualEnabled) {
                this.showVisualFeedback(feedback, analysis);
            }
        }
    }

    showVisualFeedback(feedback, analysis) {
        if (!this.scene) return;

        switch (feedback.type) {
            case 'takeoff_angle':
            case 'plant_angle':
                this.showAngleIndicator(feedback, analysis);
                break;
            case 'approach_speed':
            case 'plant_speed':
                this.showSpeedIndicator(feedback, analysis);
                break;
            case 'bar_clearance':
            case 'excess_height':
                this.showHeightIndicator(feedback, analysis);
                break;
            case 'pole_bend':
                this.showPoleBendIndicator(feedback, analysis);
                break;
            case 'step_length':
            case 'swing_hip':
            case 'landing_accuracy':
                this.showMarkerHighlight(feedback, analysis);
                break;
        }
    }

    showAngleIndicator(feedback, analysis) {
        const color = feedback.severity === 'error' ? 0xff4444 :
                      feedback.severity === 'warning' ? 0xffaa00 : 0x44ff44;

        const geometry = new THREE.RingGeometry(1.5, 1.6, 32, 1, 0, (feedback.value || 20) * Math.PI / 180);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const ring = new THREE.Mesh(geometry, material);
        ring.position.set(0, 1.8, -0.6);
        ring.rotation.x = -Math.PI / 2;
        ring.name = 'angleIndicator';

        this.scene.add(ring);
        this.addVisualObject('angleIndicator', ring, 3000);
    }

    showSpeedIndicator(feedback, analysis) {
        const value = feedback.value || 0;
        const ideal = feedback.ideal || 9.5;
        const ratio = value / ideal;

        const height = 0.15;
        const maxWidth = 3;
        const actualWidth = Math.min(maxWidth, maxWidth * ratio);

        const bgGeo = new THREE.PlaneGeometry(maxWidth, height);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.8 });
        const bg = new THREE.Mesh(bgGeo, bgMat);
        bg.position.set(0, 2.5, 15);
        bg.rotation.x = -0.2;
        this.scene.add(bg);

        const barGeo = new THREE.PlaneGeometry(actualWidth, height * 0.8);
        const barMat = new THREE.MeshBasicMaterial({
            color: ratio > 0.95 && ratio < 1.05 ? 0x44ff44 : 0xffaa00,
            transparent: true,
            opacity: 0.9
        });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(-(maxWidth - actualWidth) / 2, 2.5, 15);
        bar.rotation.x = -0.2;
        this.scene.add(bar);

        const group = new THREE.Group();
        group.add(bg);
        group.add(bar);
        this.addVisualObject('speedIndicator', group, 3000);
    }

    showHeightIndicator(feedback, analysis) {
        const barH = this.config.training.barHeight;
        const clearance = feedback.value || 0;

        const color = clearance > 0 ? 0x44ff44 : 0xff4444;
        const yPos = barH + clearance / 2;

        const arrowGeo = new THREE.ConeGeometry(0.15, 0.5, 8);
        const arrowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9
        });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.set(2.5, yPos, -2.5);
        arrow.rotation.z = clearance > 0 ? Math.PI : 0;

        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(2.5, barH, -2.5),
            new THREE.Vector3(2.5, barH + clearance, -2.5)
        ]);
        const lineMat = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9
        });
        const line = new THREE.Line(lineGeo, lineMat);

        this.scene.add(arrow);
        this.scene.add(line);

        const group = new THREE.Group();
        group.add(arrow);
        group.add(line);
        this.addVisualObject('heightIndicator', group, 4000);
    }

    showPoleBendIndicator(feedback, analysis) {
        const bend = feedback.value || 0;
        const color = feedback.severity === 'warning' ? 0xffaa00 : 0x44ff44;

        const ringGeo = new THREE.TorusGeometry(2.0, 0.05, 8, 50, bend * 3);
        const ringMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 2.5, -2);
        ring.rotation.x = Math.PI / 3;

        this.scene.add(ring);
        this.addVisualObject('poleBendIndicator', ring, 3000);
    }

    showMarkerHighlight(feedback, analysis) {
        const color = feedback.severity === 'error' ? 0xff4444 :
                      feedback.severity === 'warning' ? 0xffaa00 : 0x44ff44;

        const pulseGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const pulseMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6
        });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        pulse.position.set(0, 1, 0);
        pulse.userData.isPulse = true;
        pulse.userData.startTime = performance.now();

        this.scene.add(pulse);
        this.addVisualObject('markerHighlight', pulse, 2000);
    }

    addVisualObject(key, obj, duration) {
        const existing = this.visualObjects.get(key);
        if (existing) {
            this.removeVisualObject(key);
        }

        this.visualObjects.set(key, {
            object: obj,
            createdAt: performance.now(),
            duration: duration
        });
    }

    removeVisualObject(key) {
        const entry = this.visualObjects.get(key);
        if (entry && this.scene) {
            this.scene.remove(entry.object);
            entry.object.traverse?.((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        this.visualObjects.delete(key);
    }

    onPhaseChange(newPhase, oldPhase) {
        const phaseNames = {
            idle: '待机',
            approach: '助跑',
            plant: '插杆',
            swing: '摆体',
            extension: '推杆',
            fly: '腾空',
            land: '落地'
        };

        this.phaseBadge.className = `phase-badge ${newPhase}`;
        this.phaseBadge.textContent = phaseNames[newPhase] || newPhase;

        if (newPhase !== oldPhase && this.feedbackConfig.voiceEnabled) {
            const phaseVoiceNames = {
                approach: '助跑开始',
                plant: '插杆',
                swing: '摆体',
                extension: '推杆',
                fly: '腾空过杆',
                land: '落地'
            };
            if (phaseVoiceNames[newPhase] && newPhase !== 'idle') {
                this.speak(phaseVoiceNames[newPhase], 'info');
            }
        }
    }

    onJumpComplete(jump) {
        setTimeout(() => {
            if (jump.success) {
                this.showMessage(
                    `成功过杆！得分 ${jump.scores.overall.toFixed(0)} 分，杆高 ${jump.barHeight.toFixed(2)}m`,
                    'success',
                    6000
                );
                this.speak(`成功过杆，得分${jump.scores.overall.toFixed(0)}分`, 'success');
            } else {
                this.showMessage(
                    `试跳结束，得分 ${jump.scores.overall.toFixed(0)} 分，继续加油！`,
                    'warning',
                    6000
                );
            }

            this.showScoreBreakdown(jump.scores);
        }, 500);
    }

    showScoreBreakdown(scores) {
        const items = [
            { key: 'approach', label: '助跑' },
            { key: 'takeoff', label: '起跳' },
            { key: 'swing', label: '摆体' },
            { key: 'extension', label: '推杆' },
            { key: 'fly', label: '过杆' },
            { key: 'overall', label: '综合' }
        ];

        items.forEach((item, idx) => {
            setTimeout(() => {
                const score = scores[item.key] || 0;
                const severity = score > 80 ? 'success' : score > 60 ? 'info' : score > 40 ? 'warning' : 'error';
                this.showMessage(`${item.label}: ${score.toFixed(0)}分`, severity, 3000);
            }, idx * 600);
        });
    }

    update(deltaTime) {
        const now = performance.now();

        for (const [key, entry] of [...this.visualObjects]) {
            if (now - entry.createdAt > entry.duration) {
                this.removeVisualObject(key);
            } else if (entry.object.userData?.isPulse) {
                const t = (now - entry.createdAt) / entry.duration;
                const scale = 1 + t * 2;
                entry.object.scale.setScalar(scale);
                entry.object.material.opacity = 0.6 * (1 - t);
            }
        }

        this.activeMessages = this.activeMessages.filter(msg => {
            if (now - msg.createdAt > 4500) {
                return false;
            }
            return true;
        });
    }

    setVoiceEnabled(enabled) {
        this.feedbackConfig.voiceEnabled = enabled;
        if (!enabled && this.voiceSynthesizer) {
            this.voiceSynthesizer.cancel();
        }
    }

    setVolume(volume) {
        this.feedbackConfig.volume = Math.max(0, Math.min(1, volume));
    }

    clearAll() {
        for (const [key] of [...this.visualObjects]) {
            this.removeVisualObject(key);
        }
        if (this.voiceSynthesizer) {
            this.voiceSynthesizer.cancel();
        }
    }
}
