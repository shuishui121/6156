import * as THREE from 'three';

export class VRSystem {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controller1 = null;
        this.controller2 = null;
        this.isInVR = false;
        this.isVRSupported = false;
        this.vrSession = null;
        this.animationLoop = null;
    }

    async init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.scene.skyColor);
        this.scene.fog = new THREE.Fog(this.config.scene.skyColor, 100, 300);

        this.camera = new THREE.PerspectiveCamera(
            this.config.vr.fov,
            window.innerWidth / window.innerHeight,
            this.config.vr.near,
            this.config.vr.far
        );
        this.camera.position.set(0, 1.85, 15);
        this.camera.lookAt(0, 2, 0);
        this.scene.add(this.camera);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        if ('xr' in navigator) {
            this.isVRSupported = true;
            this.renderer.xr.enabled = true;

            const supported = await navigator.xr.isSessionSupported('immersive-vr');
            this.isVRSupported = supported;

            if (supported) {
                this.renderer.xr.addEventListener('sessionstart', () => {
                    this.isInVR = true;
                    console.log('[VRSystem] VR会话开始');
                });
                this.renderer.xr.addEventListener('sessionend', () => {
                    this.isInVR = false;
                    this.vrSession = null;
                    console.log('[VRSystem] VR会话结束');
                });
            }
        }

        this.setupLighting();
        this.setupControllers();
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.position.set(50, 100, 30);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 400;
        sunLight.shadow.camera.left = -80;
        sunLight.shadow.camera.right = 80;
        sunLight.shadow.camera.top = 80;
        sunLight.shadow.camera.bottom = -80;
        sunLight.shadow.bias = -0.0001;
        this.scene.add(sunLight);

        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3d5c3d, 0.4);
        this.scene.add(hemiLight);
    }

    setupControllers() {
        const controllerModelFactory = (hand) => {
            const group = new THREE.Group();

            const bodyGeo = new THREE.BoxGeometry(0.05, 0.08, 0.18);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.5 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.castShadow = true;
            group.add(body);

            const buttonGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.01, 16);
            const buttonMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff3333, emissiveIntensity: 0.3 });
            const button = new THREE.Mesh(buttonGeo, buttonMat);
            button.rotation.x = Math.PI / 2;
            button.position.set(0, 0.03, 0.02);
            group.add(button);

            const triggerGeo = new THREE.BoxGeometry(0.03, 0.02, 0.04);
            const triggerMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
            const trigger = new THREE.Mesh(triggerGeo, triggerMat);
            trigger.position.set(0, -0.02, 0.06);
            group.add(trigger);

            const handIndicator = new THREE.Object3D();
            handIndicator.position.set(0, 0, -0.1);
            group.add(handIndicator);
            group.userData.targetRay = handIndicator;

            return group;
        };

        if (this.renderer.xr.enabled) {
            this.controller1 = this.renderer.xr.getController(0);
            this.controller1.userData.hand = 'left';
            this.scene.add(this.controller1);

            const model1 = controllerModelFactory('left');
            this.controller1.add(model1);

            this.controller2 = this.renderer.xr.getController(1);
            this.controller2.userData.hand = 'right';
            this.scene.add(this.controller2);

            const model2 = controllerModelFactory('right');
            this.controller2.add(model2);

            const grip1 = this.renderer.xr.getControllerGrip(0);
            this.scene.add(grip1);

            const grip2 = this.renderer.xr.getControllerGrip(1);
            this.scene.add(grip2);
        }
    }

    async enterVR() {
        if (!this.isVRSupported) {
            console.warn('[VRSystem] VR不受支持');
            return;
        }

        if (this.isInVR) return;

        const sessionInit = {
            requiredFeatures: ['local-floor', 'bounded-floor'],
            optionalFeatures: ['hand-tracking']
        };

        try {
            this.vrSession = await navigator.xr.requestSession('immersive-vr', sessionInit);
            await this.renderer.xr.setSession(this.vrSession);
        } catch (error) {
            console.error('[VRSystem] 进入VR失败:', error);
            throw error;
        }
    }

    async exitVR() {
        if (this.vrSession && this.isInVR) {
            await this.vrSession.end();
        }
    }

    setAnimationLoop(callback) {
        this.animationLoop = callback;
        this.renderer.setAnimationLoop(callback);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    getCameraPosition() {
        return this.camera.position.clone();
    }

    getControllerState(hand) {
        const controller = hand === 'left' ? this.controller1 : this.controller2;
        if (!controller) return null;

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        controller.getWorldPosition(worldPos);
        controller.getWorldQuaternion(worldQuat);

        return {
            position: worldPos,
            quaternion: worldQuat,
            visible: controller.visible
        };
    }
}
