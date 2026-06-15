import * as THREE from 'three';

export class CoachToolkit {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.networkManager = null;
        this.uiManager = null;

        this.isActive = false;
        this.toolMode = 'select';
        this.currentAnnotationColor = 0xffff00;

        this.freeCamera = null;
        this.freeCameraActive = false;
        this.cameraMode = 'free';
        this.cameraTargetId = null;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.planeNormal = new THREE.Vector3(0, 1, 0);
        this.planeConstant = 0;

        this.drawMode = false;
        this.currentDrawing = null;
        this.drawPoints = [];

        this.measureMode = false;
        this.measureStart = null;
        this.measureLine = null;

        this.viewPresets = [
            { name: '正面', position: [0, 3, 15], target: [0, 2, -5] },
            { name: '侧面', position: [15, 3, -5], target: [0, 2, -5] },
            { name: '俯视', position: [0, 25, -5], target: [0, 0, -5] },
            { name: '助跑起点', position: [0, 2, 25], target: [0, 1, 0] },
            { name: '落地区', position: [0, 3, -12], target: [0, 1, -5] }
        ];

        this.quickCommands = [
            { id: 'reset', label: '重置训练', icon: '🔄', color: '#3498db' },
            { id: 'start', label: '开始试跳', icon: '▶️', color: '#2ecc71' },
            { id: 'slow', label: '慢动作回放', icon: '🐢', color: '#f39c12' },
            { id: 'focus', label: '聚焦运动员', icon: '🎯', color: '#9b59b6' },
            { id: 'raise_bar', label: '升高杆 +10cm', icon: '⬆️', color: '#e74c3c' },
            { id: 'lower_bar', label: '降低杆 -10cm', icon: '⬇️', color: '#1abc9c' }
        ];
    }

    setNetworkManager(manager) {
        this.networkManager = manager;
    }

    setUIManager(manager) {
        this.uiManager = manager;
    }

    activate() {
        this.isActive = true;
        this.initFreeCamera();
        this.enableFreeCamera();
        console.log('[CoachToolkit] 教练工具已激活');
    }

    deactivate() {
        this.isActive = false;
        this.disableFreeCamera();
        this.clearAllAnnotations();
        console.log('[CoachToolkit] 教练工具已停用');
    }

    initFreeCamera() {
        if (!this.sceneManager || !this.sceneManager.camera) return;

        this.freeCamera = this.sceneManager.camera;
        this.cameraOriginalPos = this.freeCamera.position.clone();
        this.cameraOriginalRot = this.freeCamera.rotation.clone();

        this.cameraKeys = new Set();
        this.mouseDown = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.cameraYaw = 0;
        this.cameraPitch = -0.1;

        this.canvas = this.sceneManager.vrSystem?.renderer?.domElement;
        if (this.canvas) {
            this.setupInputHandlers();
        }
    }

    setupInputHandlers() {
        this.keyDownHandler = (e) => {
            if (!this.freeCameraActive) return;
            this.cameraKeys.add(e.code);

            if (e.code === 'Digit1') this.setViewPreset(0);
            if (e.code === 'Digit2') this.setViewPreset(1);
            if (e.code === 'Digit3') this.setViewPreset(2);
            if (e.code === 'Digit4') this.setViewPreset(3);
            if (e.code === 'Digit5') this.setViewPreset(4);
            if (e.code === 'KeyM') this.toggleMeasureMode();
            if (e.code === 'KeyD') this.toggleDrawMode();
            if (e.code === 'KeyA') this.executeQuickCommand('focus');
            if (e.code === 'KeyR') this.executeQuickCommand('reset');
        };

        this.keyUpHandler = (e) => {
            this.cameraKeys.delete(e.code);
        };

        this.mouseDownHandler = (e) => {
            if (!this.freeCameraActive) return;
            if (e.button === 0) {
                this.mouseDown = true;
                this.lastMousePos = { x: e.clientX, y: e.clientY };

                if (this.toolMode === 'annotation') {
                    this.handleAnnotationClick(e);
                } else if (this.measureMode) {
                    this.handleMeasureClick(e);
                } else if (this.drawMode) {
                    this.handleDrawStart(e);
                }
            }
        };

        this.mouseUpHandler = (e) => {
            this.mouseDown = false;
            if (this.drawMode && this.currentDrawing) {
                this.handleDrawEnd();
            }
        };

        this.mouseMoveHandler = (e) => {
            if (!this.freeCameraActive) return;

            if (this.mouseDown && this.toolMode === 'select') {
                const dx = e.clientX - this.lastMousePos.x;
                const dy = e.clientY - this.lastMousePos.y;

                this.cameraYaw -= dx * 0.003;
                this.cameraPitch -= dy * 0.003;
                this.cameraPitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.cameraPitch));

                this.lastMousePos = { x: e.clientX, y: e.clientY };
            } else if (this.drawMode && this.mouseDown) {
                this.handleDrawMove(e);
            }

            this.updateMouseNDC(e);
        };

        this.wheelHandler = (e) => {
            if (!this.freeCameraActive) return;
            e.preventDefault();
            const speed = e.deltaY > 0 ? -1 : 1;
            this.freeCamera.translateZ(speed * 0.5);
        };

        window.addEventListener('keydown', this.keyDownHandler);
        window.addEventListener('keyup', this.keyUpHandler);
        this.canvas.addEventListener('mousedown', this.mouseDownHandler);
        window.addEventListener('mouseup', this.mouseUpHandler);
        this.canvas.addEventListener('mousemove', this.mouseMoveHandler);
        this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
    }

    updateMouseNDC(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    enableFreeCamera() {
        if (!this.freeCamera) return;
        this.freeCameraActive = true;
        this.cameraMode = 'free';
        this.freeCamera.position.set(0, 5, 15);
        this.cameraYaw = 0;
        this.cameraPitch = -0.2;
        console.log('[CoachToolkit] 自由相机已启用');
    }

    disableFreeCamera() {
        this.freeCameraActive = false;
    }

    toggleFreeCamera() {
        if (this.freeCameraActive) {
            this.disableFreeCamera();
        } else {
            this.enableFreeCamera();
        }
        return this.freeCameraActive;
    }

    setCameraTarget(playerId) {
        this.cameraTargetId = playerId;
        this.cameraMode = 'follow';
        console.log(`[CoachToolkit] 相机跟随玩家: ${playerId}`);
    }

    setViewPreset(index) {
        if (!this.freeCamera || index >= this.viewPresets.length) return;

        const preset = this.viewPresets[index];
        const startPos = this.freeCamera.position.clone();
        const startTarget = this.getCameraLookAt();
        const endPos = new THREE.Vector3(...preset.position);
        const endTarget = new THREE.Vector3(...preset.target);

        this.animateCamera(startPos, endPos, startTarget, endTarget, 0.8);
    }

    getCameraLookAt() {
        const dir = new THREE.Vector3(0, 0, -1);
        dir.applyQuaternion(this.freeCamera.quaternion);
        return this.freeCamera.position.clone().add(dir.multiplyScalar(10));
    }

    animateCamera(startPos, endPos, startTarget, endTarget, duration) {
        const startTime = performance.now();
        const animate = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            const t = Math.min(1, elapsed / duration);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            const currentPos = startPos.clone().lerp(endPos, ease);
            const currentTarget = startTarget.clone().lerp(endTarget, ease);

            this.freeCamera.position.copy(currentPos);
            this.freeCamera.lookAt(currentTarget);

            const euler = new THREE.Euler().setFromQuaternion(this.freeCamera.quaternion, 'YXZ');
            this.cameraYaw = euler.y;
            this.cameraPitch = euler.x;

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    setToolMode(mode) {
        this.toolMode = mode;
        this.measureMode = mode === 'measure';
        this.drawMode = mode === 'draw';
        this.measureStart = null;
        this.drawPoints = [];
        console.log(`[CoachToolkit] 工具模式: ${mode}`);
    }

    handleAnnotationClick(e) {
        if (!this.sceneManager || !this.networkManager) return;

        this.updateMouseNDC(e);
        const intersectPoint = this.raycastToGround();

        if (intersectPoint) {
            const text = prompt('请输入标注文字：', '技术点标注');
            if (text) {
                this.sceneManager.addAnnotation(intersectPoint, text, this.currentAnnotationColor);
                this.networkManager.sendAnnotation(intersectPoint, text, this.currentAnnotationColor);
            }
        }
    }

    toggleMeasureMode() {
        this.measureMode = !this.measureMode;
        this.toolMode = this.measureMode ? 'measure' : 'select';
        this.measureStart = null;
        if (this.measureLine) {
            this.sceneManager.scene.remove(this.measureLine);
            this.measureLine = null;
        }
        console.log(`[CoachToolkit] 测距模式: ${this.measureMode ? '开启' : '关闭'}`);
    }

    toggleDrawMode() {
        this.drawMode = !this.drawMode;
        this.toolMode = this.drawMode ? 'draw' : 'select';
        this.drawPoints = [];
        console.log(`[CoachToolkit] 绘图模式: ${this.drawMode ? '开启' : '关闭'}`);
    }

    handleMeasureClick(e) {
        const point = this.raycastToGround();
        if (!point) return;

        if (!this.measureStart) {
            this.measureStart = point.clone();

            const markerGeo = new THREE.SphereGeometry(0.08, 16, 16);
            const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            this.measureStartMarker = new THREE.Mesh(markerGeo, markerMat);
            this.measureStartMarker.position.copy(point);
            this.sceneManager.scene.add(this.measureStartMarker);
        } else {
            if (this.measureLine) {
                this.sceneManager.scene.remove(this.measureLine);
            }

            const lineGeo = new THREE.BufferGeometry().setFromPoints([this.measureStart, point]);
            const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
            this.measureLine = new THREE.Line(lineGeo, lineMat);
            this.sceneManager.scene.add(this.measureLine);

            const distance = this.measureStart.distanceTo(point);
            this.showMeasurementLabel(this.measureStart.clone().add(point).multiplyScalar(0.5), distance);

            const endMarkerGeo = new THREE.SphereGeometry(0.08, 16, 16);
            const endMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const endMarker = new THREE.Mesh(endMarkerGeo, endMarkerMat);
            endMarker.position.copy(point);
            this.sceneManager.scene.add(endMarker);

            setTimeout(() => {
                this.sceneManager.scene.remove(this.measureStartMarker);
                this.sceneManager.scene.remove(endMarker);
                this.sceneManager.scene.remove(this.measureLine);
                this.measureStart = null;
            }, 10000);
        }
    }

    showMeasurementLabel(position, distance) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255,0,0,0.9)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${distance.toFixed(2)}m`, 128, 32);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(position);
        sprite.position.y += 0.5;
        sprite.scale.set(1.5, 0.375, 1);
        this.sceneManager.scene.add(sprite);

        setTimeout(() => this.sceneManager.scene.remove(sprite), 10000);
    }

    handleDrawStart(e) {
        const point = this.raycastToGround();
        if (!point) return;

        this.drawPoints = [point.clone()];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(this.drawPoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: this.currentAnnotationColor,
            linewidth: 3
        });
        this.currentDrawing = new THREE.Line(lineGeo, lineMat);
        this.sceneManager.scene.add(this.currentDrawing);
    }

    handleDrawMove(e) {
        if (!this.drawMode || !this.currentDrawing) return;

        const point = this.raycastToGround();
        if (!point) return;

        const lastPoint = this.drawPoints[this.drawPoints.length - 1];
        if (lastPoint.distanceTo(point) > 0.05) {
            this.drawPoints.push(point.clone());
            this.currentDrawing.geometry.dispose();
            this.currentDrawing.geometry = new THREE.BufferGeometry().setFromPoints(this.drawPoints);
        }
    }

    handleDrawEnd() {
        if (this.currentDrawing) {
            setTimeout(() => {
                if (this.currentDrawing) {
                    this.sceneManager.scene.remove(this.currentDrawing);
                    this.currentDrawing = null;
                }
            }, 15000);
        }
        this.drawPoints = [];
    }

    raycastToGround() {
        if (!this.sceneManager?.camera || !this.sceneManager?.scene) return null;

        this.raycaster.setFromCamera(this.mouse, this.freeCamera);
        const intersects = this.raycaster.intersectObjects(
            this.sceneManager.scene.children,
            true
        );

        for (const intersect of intersects) {
            if (intersect.object === this.sceneManager.ground ||
                intersect.object === this.sceneManager.runway ||
                intersect.object === this.sceneManager.box) {
                return intersect.point;
            }
            if (intersect.point.y < 50) {
                return intersect.point;
            }
        }

        const plane = new THREE.Plane(this.planeNormal, this.planeConstant);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, target);
        return target;
    }

    executeQuickCommand(commandId) {
        switch (commandId) {
            case 'reset':
                if (this.sceneManager) {
                    this.sceneManager.resetAthlete();
                }
                if (this.networkManager) {
                    this.networkManager.sendCoachCommand('reset_training');
                }
                break;

            case 'start':
                if (this.networkManager) {
                    this.networkManager.sendCoachCommand('start_attempt');
                }
                break;

            case 'slow':
                if (this.networkManager) {
                    this.networkManager.sendCoachCommand('slow_motion', null, { speed: 0.25 });
                }
                break;

            case 'focus':
                const players = this.sceneManager?.remotePlayers;
                if (players && players.size > 0) {
                    const firstId = players.keys().next().value;
                    this.setCameraTarget(firstId);
                }
                break;

            case 'raise_bar':
                if (this.networkManager) {
                    const newHeight = this.config.training.barHeight + 0.1;
                    this.networkManager.setBarHeight(newHeight);
                }
                break;

            case 'lower_bar':
                if (this.networkManager) {
                    const newHeight = Math.max(2.0, this.config.training.barHeight - 0.1);
                    this.networkManager.setBarHeight(newHeight);
                }
                break;
        }

        console.log(`[CoachToolkit] 执行快捷指令: ${commandId}`);
    }

    setAnnotationColor(color) {
        this.currentAnnotationColor = color;
    }

    clearAllAnnotations() {
        if (this.sceneManager) {
            this.sceneManager.clearAnnotations();
        }
    }

    getCameraState() {
        return {
            position: this.freeCamera?.position.clone() || null,
            rotation: this.freeCamera?.rotation.clone() || null,
            mode: this.cameraMode,
            targetId: this.cameraTargetId
        };
    }

    getViewPresets() {
        return this.viewPresets;
    }

    getQuickCommands() {
        return this.quickCommands;
    }

    update(deltaTime) {
        if (!this.isActive || !this.freeCameraActive || !this.freeCamera) return;

        if (this.cameraMode === 'free') {
            this.updateFreeCameraMovement(deltaTime);
        } else if (this.cameraMode === 'follow' && this.cameraTargetId) {
            this.updateFollowCamera(deltaTime);
        }
    }

    updateFreeCameraMovement(deltaTime) {
        const speed = 12 * deltaTime;
        const rotSpeed = 1.5;

        if (this.cameraKeys.has('KeyW') || this.cameraKeys.has('ArrowUp')) {
            this.freeCamera.translateZ(-speed);
        }
        if (this.cameraKeys.has('KeyS') || this.cameraKeys.has('ArrowDown')) {
            this.freeCamera.translateZ(speed);
        }
        if (this.cameraKeys.has('KeyA') || this.cameraKeys.has('ArrowLeft')) {
            this.freeCamera.translateX(-speed);
        }
        if (this.cameraKeys.has('KeyD') || this.cameraKeys.has('ArrowRight')) {
            this.freeCamera.translateX(speed);
        }
        if (this.cameraKeys.has('Space')) {
            this.freeCamera.position.y += speed;
        }
        if (this.cameraKeys.has('ShiftLeft') || this.cameraKeys.has('ControlLeft')) {
            this.freeCamera.position.y -= speed;
        }
        if (this.cameraKeys.has('KeyQ')) {
            this.cameraYaw += rotSpeed * deltaTime;
        }
        if (this.cameraKeys.has('KeyE')) {
            this.cameraYaw -= rotSpeed * deltaTime;
        }

        const euler = new THREE.Euler(this.cameraPitch, this.cameraYaw, 0, 'YXZ');
        this.freeCamera.quaternion.setFromEuler(euler);
    }

    updateFollowCamera(deltaTime) {
        const remote = this.sceneManager?.remotePlayers?.get(this.cameraTargetId);
        if (!remote) return;

        const targetPos = remote.group.position.clone();
        const desiredPos = targetPos.clone();
        desiredPos.x += 8;
        desiredPos.y += 4;
        desiredPos.z += 8;

        this.freeCamera.position.lerp(desiredPos, deltaTime * 5);
        this.freeCamera.lookAt(targetPos.x, targetPos.y + 1.5, targetPos.z);
    }

    dispose() {
        this.deactivate();

        if (this.keyDownHandler) {
            window.removeEventListener('keydown', this.keyDownHandler);
            window.removeEventListener('keyup', this.keyUpHandler);
        }
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
            window.removeEventListener('mouseup', this.mouseUpHandler);
            this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
            this.canvas.removeEventListener('wheel', this.wheelHandler);
        }
    }
}
