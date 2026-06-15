import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class SceneManager {
    constructor(vrSystem, config) {
        this.vrSystem = vrSystem;
        this.config = config;
        this.physicsEngine = null;
        this.motionCapture = null;
        this.feedbackSystem = null;
        this.networkManager = null;
        this.coachToolkit = null;
        this.uiManager = null;

        this.ground = null;
        this.runway = null;
        this.box = null;
        this.landingPad = null;
        this.standards = null;
        this.crossbar = null;
        this.pole = null;
        this.athlete = null;
        this.crossbarFallen = false;
        this.remotePlayers = new Map();
        this.annotationObjects = [];

        this.crossbarHeight = config.training.barHeight;
        this.athleteStartPos = new THREE.Vector3(0, 0, 20);
    }

    get scene() {
        return this.vrSystem.scene;
    }

    get camera() {
        return this.vrSystem.camera;
    }

    setPhysicsEngine(engine) {
        this.physicsEngine = engine;
    }

    setMotionCapture(capture) {
        this.motionCapture = capture;
    }

    setFeedbackSystem(system) {
        this.feedbackSystem = system;
    }

    setNetworkManager(manager) {
        this.networkManager = manager;
    }

    setCoachToolkit(toolkit) {
        this.coachToolkit = toolkit;
    }

    setUIManager(manager) {
        this.uiManager = manager;
    }

    buildScene() {
        this.buildGround();
        this.buildRunway();
        this.buildTakeoffBox();
        this.buildLandingPad();
        this.buildStandards();
        this.buildCrossbar();
        this.buildAthlete();
        this.buildPole();
        this.buildEnvironment();
    }

    buildGround() {
        const size = this.config.scene.groundSize;
        const geometry = new THREE.PlaneGeometry(size, size, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            color: this.config.scene.groundColor,
            roughness: 0.9,
            metalness: 0.0
        });
        this.ground = new THREE.Mesh(geometry, material);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        const gridHelper = new THREE.GridHelper(size, 100, 0x444444, 0x555555);
        gridHelper.position.y = 0.001;
        this.scene.add(gridHelper);
    }

    buildRunway() {
        const width = this.config.scene.runwayWidth;
        const length = this.config.scene.runwayLength;
        const geometry = new THREE.BoxGeometry(width, 0.02, length);
        const material = new THREE.MeshStandardMaterial({
            color: this.config.scene.runwayColor,
            roughness: 0.7,
            metalness: 0.0
        });
        this.runway = new THREE.Mesh(geometry, material);
        this.runway.position.set(0, 0.01, -(length / 2 - 5));
        this.runway.receiveShadow = true;
        this.scene.add(this.runway);

        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const points1 = [
            new THREE.Vector3(-width / 2, 0.021, -(length / 2 - 5) + length / 2),
            new THREE.Vector3(-width / 2, 0.021, -(length / 2 - 5) - length / 2)
        ];
        const points2 = [
            new THREE.Vector3(width / 2, 0.021, -(length / 2 - 5) + length / 2),
            new THREE.Vector3(width / 2, 0.021, -(length / 2 - 5) - length / 2)
        ];
        const line1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points1), lineMat);
        const line2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points2), lineMat);
        this.scene.add(line1, line2);

        const marksGroup = new THREE.Group();
        for (let i = 0; i <= 8; i++) {
            const markGeo = new THREE.BoxGeometry(0.3, 0.002, 0.02);
            const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const mark = new THREE.Mesh(markGeo, markMat);
            mark.position.set(0, 0.022, -(length / 2 - 5) + (i - 4) * 5);
            marksGroup.add(mark);
        }
        this.scene.add(marksGroup);
    }

    buildTakeoffBox() {
        const width = this.config.scene.boxWidth;
        const length = this.config.scene.boxLength;
        const geometry = new THREE.BoxGeometry(width, 0.1, length);
        const material = new THREE.MeshStandardMaterial({
            color: this.config.scene.boxColor,
            roughness: 0.4,
            metalness: 0.1
        });
        this.box = new THREE.Mesh(geometry, material);
        this.box.position.set(0, 0.05, -this.config.scene.boxLength / 2 - 0.1);
        this.box.receiveShadow = true;
        this.box.castShadow = true;
        this.scene.add(this.box);

        const borderGeo = new THREE.EdgesGeometry(geometry);
        const borderMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        const border = new THREE.LineSegments(borderGeo, borderMat);
        border.position.copy(this.box.position);
        this.scene.add(border);
    }

    buildLandingPad() {
        const width = this.config.scene.landingPadWidth;
        const length = this.config.scene.landingPadLength;
        const height = this.config.scene.landingPadHeight;

        const padGroup = new THREE.Group();

        const baseGeo = new THREE.BoxGeometry(width, height, length);
        const baseMat = new THREE.MeshStandardMaterial({
            color: this.config.scene.padColor,
            roughness: 0.8,
            metalness: 0.0
        });
        const padBase = new THREE.Mesh(baseGeo, baseMat);
        padBase.position.y = height / 2;
        padBase.receiveShadow = true;
        padBase.castShadow = true;
        padGroup.add(padBase);

        const topGeo = new THREE.BoxGeometry(width - 0.2, 0.1, length - 0.2);
        const topMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.6,
            metalness: 0.0
        });
        const padTop = new THREE.Mesh(topGeo, topMat);
        padTop.position.y = height + 0.05;
        padTop.receiveShadow = true;
        padGroup.add(padTop);

        padGroup.position.set(0, 0, -5);
        this.landingPad = padGroup;
        this.scene.add(padGroup);
    }

    buildStandards() {
        this.standards = new THREE.Group();

        const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 6, 16);
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.8,
            roughness: 0.2
        });

        const leftPole = new THREE.Mesh(poleGeo, poleMat);
        leftPole.position.set(-this.config.scene.standardsWidth / 2, 3, -2.5);
        leftPole.castShadow = true;
        this.standards.add(leftPole);

        const rightPole = new THREE.Mesh(poleGeo, poleMat);
        rightPole.position.set(this.config.scene.standardsWidth / 2, 3, -2.5);
        rightPole.castShadow = true;
        this.standards.add(rightPole);

        const baseGeo = new THREE.BoxGeometry(0.6, 0.05, 0.4);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.5,
            roughness: 0.5
        });

        const leftBase = new THREE.Mesh(baseGeo, baseMat);
        leftBase.position.set(-this.config.scene.standardsWidth / 2, 0.025, -2.5);
        leftBase.castShadow = true;
        leftBase.receiveShadow = true;
        this.standards.add(leftBase);

        const rightBase = new THREE.Mesh(baseGeo, baseMat);
        rightBase.position.set(this.config.scene.standardsWidth / 2, 0.025, -2.5);
        rightBase.castShadow = true;
        rightBase.receiveShadow = true;
        this.standards.add(rightBase);

        this.buildHeightMarkers();
        this.scene.add(this.standards);
    }

    buildHeightMarkers() {
        for (let h = 3; h <= 6.5; h += 0.5) {
            const markerGeo = new THREE.BoxGeometry(0.08, 0.02, 0.08);
            const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
            const leftMarker = new THREE.Mesh(markerGeo, markerMat);
            leftMarker.position.set(-this.config.scene.standardsWidth / 2 - 0.05, h, -2.5);
            this.standards.add(leftMarker);

            const rightMarker = new THREE.Mesh(markerGeo, markerMat);
            rightMarker.position.set(this.config.scene.standardsWidth / 2 + 0.05, h, -2.5);
            this.standards.add(rightMarker);
        }
    }

    buildCrossbar() {
        const barLength = this.config.scene.barLength;
        const diameter = this.config.scene.crossbarDiameter;

        const barGeo = new THREE.CylinderGeometry(diameter / 2, diameter / 2, barLength, 16);
        const barMat = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            metalness: 0.3,
            roughness: 0.5
        });
        this.crossbar = new THREE.Mesh(barGeo, barMat);
        this.crossbar.rotation.z = Math.PI / 2;
        this.crossbar.position.set(0, this.crossbarHeight, -2.5);
        this.crossbar.castShadow = true;
        this.crossbar.receiveShadow = true;
        this.scene.add(this.crossbar);

        const leftEndGeo = new THREE.SphereGeometry(diameter / 2 + 0.005, 16, 16);
        const leftEndMat = new THREE.MeshStandardMaterial({ color: 0xcc3300 });
        const leftEnd = new THREE.Mesh(leftEndGeo, leftEndMat);
        leftEnd.position.set(-barLength / 2, 0, 0);
        this.crossbar.add(leftEnd);

        const rightEnd = new THREE.Mesh(leftEndGeo, leftEndMat);
        rightEnd.position.set(barLength / 2, 0, 0);
        this.crossbar.add(rightEnd);

        this.crossbarFallen = false;
    }

    buildAthlete() {
        this.athlete = new THREE.Group();

        const bodyParts = this.createSkeleton();
        Object.assign(this.athlete.userData, bodyParts);

        this.athlete.userData.root.position.copy(this.athleteStartPos);
        this.athlete.userData.root.position.y = 0;
        this.athlete.add(this.athlete.userData.root);

        this.scene.add(this.athlete);
    }

    createSkeleton() {
        const bones = {};
        const height = this.config.physics.athleteHeight;
        const scale = height / 1.85;

        const matSkin = new THREE.MeshStandardMaterial({
            color: 0xfdbcb4,
            roughness: 0.7,
            metalness: 0.0
        });
        const matClothes = new THREE.MeshStandardMaterial({
            color: 0x3498db,
            roughness: 0.6,
            metalness: 0.1
        });
        const matShoes = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5,
            metalness: 0.3
        });

        const root = new THREE.Group();
        bones.root = root;
        bones.rootPos = new THREE.Vector3(0, height * 0.5, 0);

        const torsoGeo = new THREE.CylinderGeometry(0.2 * scale, 0.25 * scale, 0.45 * scale, 16);
        const torso = new THREE.Mesh(torsoGeo, matClothes);
        torso.position.set(0, height * 0.65, 0);
        torso.castShadow = true;
        root.add(torso);
        bones.torso = torso;

        const hipGeo = new THREE.SphereGeometry(0.22 * scale, 16, 16);
        const hip = new THREE.Mesh(hipGeo, matClothes);
        hip.position.set(0, height * 0.45, 0);
        hip.scale.set(1.3, 0.8, 1);
        hip.castShadow = true;
        root.add(hip);
        bones.hip = hip;

        const headGeo = new THREE.SphereGeometry(0.12 * scale, 16, 16);
        const head = new THREE.Mesh(headGeo, matSkin);
        head.position.set(0, height * 0.95, 0);
        head.castShadow = true;
        root.add(head);
        bones.head = head;

        const neckGeo = new THREE.CylinderGeometry(0.05 * scale, 0.06 * scale, 0.08 * scale, 12);
        const neck = new THREE.Mesh(neckGeo, matSkin);
        neck.position.set(0, height * 0.88, 0);
        neck.castShadow = true;
        root.add(neck);
        bones.neck = neck;

        const createArm = (side) => {
            const armGroup = new THREE.Group();
            const xOffset = side === 'left' ? -0.3 * scale : 0.3 * scale;
            armGroup.position.set(xOffset, height * 0.72, 0);

            const upperArmGeo = new THREE.CylinderGeometry(0.055 * scale, 0.05 * scale, 0.28 * scale, 12);
            const upperArm = new THREE.Mesh(upperArmGeo, matSkin);
            upperArm.position.set(0, -0.14 * scale, 0);
            upperArm.castShadow = true;
            armGroup.add(upperArm);

            const forearmGeo = new THREE.CylinderGeometry(0.045 * scale, 0.04 * scale, 0.26 * scale, 12);
            const forearm = new THREE.Mesh(forearmGeo, matSkin);
            forearm.position.set(0, -0.41 * scale, 0);
            forearm.castShadow = true;
            armGroup.add(forearm);

            const handGeo = new THREE.SphereGeometry(0.05 * scale, 12, 12);
            const hand = new THREE.Mesh(handGeo, matSkin);
            hand.position.set(0, -0.57 * scale, 0);
            hand.castShadow = true;
            armGroup.add(hand);

            bones[`${side}Arm`] = armGroup;
            bones[`${side}UpperArm`] = upperArm;
            bones[`${side}Forearm`] = forearm;
            bones[`${side}Hand`] = hand;

            return armGroup;
        };

        root.add(createArm('left'));
        root.add(createArm('right'));

        const createLeg = (side) => {
            const legGroup = new THREE.Group();
            const xOffset = side === 'left' ? -0.1 * scale : 0.1 * scale;
            legGroup.position.set(xOffset, height * 0.4, 0);

            const thighGeo = new THREE.CylinderGeometry(0.07 * scale, 0.06 * scale, 0.4 * scale, 12);
            const thigh = new THREE.Mesh(thighGeo, matClothes);
            thigh.position.set(0, -0.2 * scale, 0);
            thigh.castShadow = true;
            legGroup.add(thigh);

            const shinGeo = new THREE.CylinderGeometry(0.05 * scale, 0.04 * scale, 0.4 * scale, 12);
            const shin = new THREE.Mesh(shinGeo, matClothes);
            shin.position.set(0, -0.6 * scale, 0);
            shin.castShadow = true;
            legGroup.add(shin);

            const footGeo = new THREE.BoxGeometry(0.12 * scale, 0.06 * scale, 0.25 * scale);
            const foot = new THREE.Mesh(footGeo, matShoes);
            foot.position.set(0, -0.82 * scale, 0.05 * scale);
            foot.castShadow = true;
            legGroup.add(foot);

            bones[`${side}Leg`] = legGroup;
            bones[`${side}Thigh`] = thigh;
            bones[`${side}Shin`] = shin;
            bones[`${side}Foot`] = foot;

            return legGroup;
        };

        root.add(createLeg('left'));
        root.add(createLeg('right'));

        return bones;
    }

    buildPole() {
        const poleLen = this.config.physics.poleLength;
        const radius = this.config.physics.poleRadius;

        const poleSegments = 20;
        const points = [];
        for (let i = 0; i <= poleSegments; i++) {
            points.push(new THREE.Vector3(0, i * (poleLen / poleSegments), 0));
        }

        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, poleSegments, radius, 12, false);
        const poleMat = new THREE.MeshStandardMaterial({
            color: this.config.scene.poleColor,
            roughness: 0.3,
            metalness: 0.7
        });

        this.pole = new THREE.Mesh(tubeGeo, poleMat);
        this.pole.castShadow = true;
        this.pole.receiveShadow = true;
        this.pole.userData.controlPoints = points.map(p => p.clone());
        this.pole.userData.curve = curve;
        this.pole.userData.length = poleLen;
        this.pole.userData.segments = poleSegments;
        this.pole.userData.isPlanted = false;
        this.pole.userData.plantPoint = null;
        this.pole.userData.bendAmount = 0;
        this.pole.userData.heldByAthlete = false;

        this.pole.position.set(0.3, 1.5, 20);
        this.scene.add(this.pole);
    }

    buildEnvironment() {
        const stadiumGeo = new THREE.CircleGeometry(80, 64);
        const stadiumMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            side: THREE.DoubleSide,
            roughness: 0.9
        });
        const stadium = new THREE.Mesh(stadiumGeo, stadiumMat);
        stadium.rotation.x = Math.PI / 2;
        stadium.position.y = 0.005;
        stadium.receiveShadow = true;
        this.scene.add(stadium);

        const spectatorCount = 200;
        const spectatorGroup = new THREE.Group();
        const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];

        for (let i = 0; i < spectatorCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 30 + Math.random() * 20;
            const spGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.8, 6);
            const spMat = new THREE.MeshStandardMaterial({
                color: colors[Math.floor(Math.random() * colors.length)],
                roughness: 0.8
            });
            const sp = new THREE.Mesh(spGeo, spMat);
            sp.position.set(Math.cos(angle) * radius, 0.4 + Math.random() * 2, Math.sin(angle) * radius);
            sp.castShadow = true;
            spectatorGroup.add(sp);
        }
        this.scene.add(spectatorGroup);

        const bannerTexts = [];
        const bannerColors = [0x1e88e5, 0xffc107, 0xe53935];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const radius = 40;
            const bannerGeo = new THREE.BoxGeometry(6, 3, 0.2);
            const bannerMat = new THREE.MeshStandardMaterial({
                color: bannerColors[i % bannerColors.length],
                roughness: 0.6,
                side: THREE.DoubleSide
            });
            const banner = new THREE.Mesh(bannerGeo, bannerMat);
            banner.position.set(Math.cos(angle) * radius, 8, Math.sin(angle) * radius);
            banner.lookAt(0, 8, 0);
            banner.rotateY(Math.PI);
            banner.castShadow = true;
            this.scene.add(banner);
        }
    }

    updateAthletePose(poseData) {
        if (!poseData || !this.athlete) return;

        const bones = this.athlete.userData;
        const scale = this.config.physics.athleteHeight / 1.85;

        if (poseData.rootPosition) {
            bones.root.position.set(
                poseData.rootPosition.x,
                poseData.rootPosition.y,
                poseData.rootPosition.z
            );
        }

        if (poseData.rootRotation) {
            bones.root.rotation.set(
                poseData.rootRotation.x,
                poseData.rootRotation.y,
                poseData.rootRotation.z
            );
        }

        const jointMap = {
            head: { bone: bones.head, offset: [0, 0, 0] },
            neck: { bone: bones.neck, offset: [0, 0, 0] },
            torso: { bone: bones.torso, offset: [0, 0, 0] },
            hip: { bone: bones.hip, offset: [0, 0, 0] },
            leftShoulder: { bone: bones.leftArm, offset: [0, 0, 0] },
            leftElbow: { bone: bones.leftForearm, offset: [0, 0.27 * scale, 0] },
            leftWrist: { bone: bones.leftHand, offset: [0, 0.16 * scale, 0] },
            rightShoulder: { bone: bones.rightArm, offset: [0, 0, 0] },
            rightElbow: { bone: bones.rightForearm, offset: [0, 0.27 * scale, 0] },
            rightWrist: { bone: bones.rightHand, offset: [0, 0.16 * scale, 0] },
            leftHip: { bone: bones.leftLeg, offset: [0, 0, 0] },
            leftKnee: { bone: bones.leftShin, offset: [0, 0.4 * scale, 0] },
            leftAnkle: { bone: bones.leftFoot, offset: [0, 0.22 * scale, -0.05 * scale] },
            rightHip: { bone: bones.rightLeg, offset: [0, 0, 0] },
            rightKnee: { bone: bones.rightShin, offset: [0, 0.4 * scale, 0] },
            rightAnkle: { bone: bones.rightFoot, offset: [0, 0.22 * scale, -0.05 * scale] }
        };

        for (const [jointName, mapping] of Object.entries(jointMap)) {
            if (poseData.joints && poseData.joints[jointName] && mapping.bone) {
                const joint = poseData.joints[jointName];
                if (joint.rotation) {
                    mapping.bone.rotation.set(joint.rotation.x, joint.rotation.y, joint.rotation.z);
                }
                if (joint.position && mapping.offset) {
                    mapping.bone.position.set(
                        joint.position.x + mapping.offset[0],
                        joint.position.y + mapping.offset[1],
                        joint.position.z + mapping.offset[2]
                    );
                }
            }
        }

        this.updatePole(poseData);
        this.checkCrossbarCollision();
    }

    updatePole(poseData) {
        if (!this.pole || !poseData) return;

        const rightWrist = poseData.joints?.rightWrist;
        const leftWrist = poseData.joints?.leftWrist;

        if (rightWrist && leftWrist && this.pole.userData.heldByAthlete) {
            const athletePos = this.athlete.userData.root.position;
            const handsCenter = new THREE.Vector3(
                (rightWrist.position.x + leftWrist.position.x) / 2,
                (rightWrist.position.y + leftWrist.position.y) / 2,
                (rightWrist.position.z + leftWrist.position.z) / 2
            );

            const controlPoints = this.pole.userData.controlPoints;
            const length = this.pole.userData.length;
            const segments = this.pole.userData.segments;

            if (this.pole.userData.isPlanted && this.pole.userData.plantPoint) {
                const plantPoint = this.pole.userData.plantPoint;
                const bendAmount = this.pole.userData.bendAmount || 0;

                for (let i = 0; i <= segments; i++) {
                    const t = i / segments;
                    const heightPos = t * length;

                    const startPos = plantPoint.clone();
                    const endPos = new THREE.Vector3(
                        athletePos.x + handsCenter.x,
                        athletePos.y + handsCenter.y,
                        athletePos.z + handsCenter.z
                    );

                    const bendOffset = Math.sin(t * Math.PI) * bendAmount;
                    const dirToEnd = new THREE.Vector3().subVectors(endPos, startPos).normalize();
                    const up = new THREE.Vector3(0, 1, 0);
                    const perpendicular = new THREE.Vector3().crossVectors(dirToEnd, up).normalize();

                    controlPoints[i].set(
                        startPos.x + (endPos.x - startPos.x) * t + perpendicular.x * bendOffset,
                        startPos.y + (endPos.y - startPos.y) * t,
                        startPos.z + (endPos.z - startPos.z) * t + perpendicular.z * bendOffset
                    );
                }
            } else {
                const startPos = new THREE.Vector3(
                    athletePos.x + handsCenter.x,
                    athletePos.y + handsCenter.y - length * 0.1,
                    athletePos.z + handsCenter.z - 0.3
                );
                const dir = new THREE.Vector3(0.2, 0.8, -0.5).normalize();

                for (let i = 0; i <= segments; i++) {
                    const t = i / segments;
                    controlPoints[i].set(
                        startPos.x + dir.x * t * length,
                        startPos.y + dir.y * t * length,
                        startPos.z + dir.z * t * length
                    );
                }
            }

            const curve = this.pole.userData.curve;
            curve.points = controlPoints;
            curve.updateArcLengths();

            const positions = this.pole.geometry.attributes.position;
            const tempVec = new THREE.Vector3();
            const count = positions.count;

            for (let i = 0; i < count; i++) {
                const tubeIndex = Math.floor(i / 13);
                const t = tubeIndex / segments;
                const angle = (i % 13) * (Math.PI * 2 / 12);

                curve.getPointAt(t, tempVec);
                const tangent = curve.getTangentAt(t).normalize();
                const normal = new THREE.Vector3(0, 1, 0);
                if (Math.abs(tangent.y) > 0.99) normal.set(1, 0, 0);
                const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
                const bitangent = new THREE.Vector3().crossVectors(tangent, binormal).normalize();

                const radius = this.config.physics.poleRadius;
                positions.setXYZ(
                    i,
                    tempVec.x + binormal.x * Math.cos(angle) * radius + bitangent.x * Math.sin(angle) * radius,
                    tempVec.y + binormal.y * Math.cos(angle) * radius + bitangent.y * Math.sin(angle) * radius,
                    tempVec.z + binormal.z * Math.cos(angle) * radius + bitangent.z * Math.sin(angle) * radius
                );
            }

            positions.needsUpdate = true;
            this.pole.geometry.computeVertexNormals();
        }
    }

    setPolePlant(planted, plantPoint = null, bendAmount = 0) {
        if (this.pole) {
            this.pole.userData.isPlanted = planted;
            this.pole.userData.plantPoint = plantPoint;
            this.pole.userData.bendAmount = bendAmount;
        }
    }

    setPoleHeld(held) {
        if (this.pole) {
            this.pole.userData.heldByAthlete = held;
        }
    }

    checkCrossbarCollision() {
        if (this.crossbarFallen || !this.crossbar || !this.athlete) return;

        const barPos = this.crossbar.position;
        const athletePos = this.athlete.userData.root.position;
        const athleteHeight = this.config.physics.athleteHeight;

        const dx = athletePos.x - barPos.x;
        const dz = athletePos.z - barPos.z;
        const dy = (athletePos.y + athleteHeight * 0.8) - barPos.y;

        if (Math.abs(dx) < this.config.scene.barLength / 2 &&
            Math.abs(dz) < 0.5 &&
            dy > -0.2 && dy < 0.5) {
            this.dropCrossbar();
        }
    }

    dropCrossbar() {
        this.crossbarFallen = true;
        if (this.feedbackSystem) {
            this.feedbackSystem.showMessage('横杆被碰落！', 'warning');
        }
    }

    resetCrossbar() {
        if (this.crossbar) {
            this.crossbar.position.set(0, this.crossbarHeight, -2.5);
            this.crossbar.rotation.set(0, 0, Math.PI / 2);
        }
        this.crossbarFallen = false;
    }

    setBarHeight(height) {
        this.crossbarHeight = height;
        this.config.setBarHeight(height);
        if (this.crossbar) {
            this.crossbar.position.y = height;
        }
        this.resetCrossbar();
    }

    resetAthlete() {
        if (this.athlete) {
            this.athlete.userData.root.position.copy(this.athleteStartPos);
            this.athlete.userData.root.rotation.set(0, 0, 0);
            this.athlete.userData.root.position.y = 0;
        }
        if (this.pole) {
            this.pole.userData.isPlanted = false;
            this.pole.userData.plantPoint = null;
            this.pole.userData.bendAmount = 0;
            this.pole.userData.heldByAthlete = true;
        }
        this.resetCrossbar();
    }

    addRemotePlayer(playerId, playerData) {
        if (this.remotePlayers.has(playerId)) return;

        const remotePlayer = this.createRemotePlayer(playerData);
        this.remotePlayers.set(playerId, remotePlayer);
        this.scene.add(remotePlayer.group);

        if (this.uiManager) {
            this.uiManager.onPlayerJoined(playerId, playerData);
        }
    }

    createRemotePlayer(playerData) {
        const group = new THREE.Group();
        const color = playerData.color || 0x9b59b6;

        const mat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.6,
            metalness: 0.1,
            transparent: true,
            opacity: playerData.role === 'coach' ? 0.5 : 0.8
        });

        const height = this.config.physics.athleteHeight;
        const scale = height / 1.85;

        const bodyGeo = new THREE.CapsuleGeometry(0.3 * scale, height * 0.6, 8, 16);
        const body = new THREE.Mesh(bodyGeo, mat);
        body.position.y = height * 0.5;
        body.castShadow = true;
        group.add(body);

        const headGeo = new THREE.SphereGeometry(0.15 * scale, 16, 16);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = height * 0.95;
        head.castShadow = true;
        group.add(head);

        const nameCanvas = document.createElement('canvas');
        nameCanvas.width = 256;
        nameCanvas.height = 64;
        const nameCtx = nameCanvas.getContext('2d');
        nameCtx.fillStyle = 'rgba(0,0,0,0.7)';
        nameCtx.fillRect(0, 0, 256, 64);
        nameCtx.fillStyle = '#ffffff';
        nameCtx.font = 'bold 28px Microsoft YaHei';
        nameCtx.textAlign = 'center';
        nameCtx.textBaseline = 'middle';
        nameCtx.fillText(playerData.name || '运动员', 128, 32);

        const nameTex = new THREE.CanvasTexture(nameCanvas);
        const nameMat = new THREE.SpriteMaterial({ map: nameTex, transparent: true });
        const nameSprite = new THREE.Sprite(nameMat);
        nameSprite.scale.set(1.5, 0.375, 1);
        nameSprite.position.y = height + 0.3;
        group.add(nameSprite);

        group.position.set(
            playerData.position?.x || 0,
            playerData.position?.y || 0,
            playerData.position?.z || 25
        );

        return {
            group,
            body,
            head,
            data: playerData,
            lastUpdateTime: performance.now(),
            targetPosition: group.position.clone(),
            targetRotation: group.rotation.clone()
        };
    }

    updateRemotePlayer(playerId, updateData) {
        const remote = this.remotePlayers.get(playerId);
        if (!remote) return;

        if (updateData.position) {
            remote.targetPosition.set(
                updateData.position.x,
                updateData.position.y,
                updateData.position.z
            );
        }
        if (updateData.rotation) {
            remote.targetRotation.set(
                updateData.rotation.x || 0,
                updateData.rotation.y || 0,
                updateData.rotation.z || 0
            );
        }
        if (updateData.barHeight !== undefined) {
            // 教练更新横杆高度
        }

        remote.lastUpdateTime = performance.now();
    }

    removeRemotePlayer(playerId) {
        const remote = this.remotePlayers.get(playerId);
        if (remote) {
            this.scene.remove(remote.group);
            this.remotePlayers.delete(playerId);
            if (this.uiManager) {
                this.uiManager.onPlayerLeft(playerId, remote.data);
            }
        }
    }

    addAnnotation(position, text, color = 0xffff00) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, 512, 128);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(3, 0.75, 1);
        sprite.position.copy(position);
        sprite.position.y += 0.5;

        const markerGeo = new THREE.SphereGeometry(0.1, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.copy(position);

        const annotation = { sprite, marker, text, position: position.clone(), createdAt: performance.now() };
        this.annotationObjects.push(annotation);

        this.scene.add(sprite);
        this.scene.add(marker);

        return annotation;
    }

    removeAnnotation(annotation) {
        const index = this.annotationObjects.indexOf(annotation);
        if (index > -1) {
            this.scene.remove(annotation.sprite);
            this.scene.remove(annotation.marker);
            this.annotationObjects.splice(index, 1);
        }
    }

    clearAnnotations() {
        for (const annotation of [...this.annotationObjects]) {
            this.removeAnnotation(annotation);
        }
    }

    update(deltaTime) {
        for (const [playerId, remote] of this.remotePlayers) {
            const lerpFactor = Math.min(1, deltaTime * 10);
            remote.group.position.lerp(remote.targetPosition, lerpFactor);

            remote.group.rotation.x = THREE.MathUtils.lerp(remote.group.rotation.x, remote.targetRotation.x, lerpFactor);
            remote.group.rotation.y = THREE.MathUtils.lerp(remote.group.rotation.y, remote.targetRotation.y, lerpFactor);
            remote.group.rotation.z = THREE.MathUtils.lerp(remote.group.rotation.z, remote.targetRotation.z, lerpFactor);

            const timeSinceUpdate = performance.now() - remote.lastUpdateTime;
            if (timeSinceUpdate > 5000) {
                this.removeRemotePlayer(playerId);
            }
        }

        if (this.crossbarFallen && this.crossbar) {
            this.crossbar.position.y -= deltaTime * 5;
            this.crossbar.rotation.x += deltaTime * 2;
            if (this.crossbar.position.y < 0.5) {
                this.crossbar.position.y = 0.5;
            }
        }

        const now = performance.now();
        for (const annotation of [...this.annotationObjects]) {
            const age = now - annotation.createdAt;
            if (age > 10000) {
                this.removeAnnotation(annotation);
            }
        }

        if (!this.vrSystem.isInVR && this.config.training.role === 'coach') {
            this.updateFreeCamera(deltaTime);
        }
    }

    updateFreeCamera(deltaTime) {
        const speed = 15 * deltaTime;
        const rotSpeed = 1.0 * deltaTime;

        const keys = this.vrSystem.keyState || {};
        if (keys.KeyW) this.camera.translateZ(-speed);
        if (keys.KeyS) this.camera.translateZ(speed);
        if (keys.KeyA) this.camera.translateX(-speed);
        if (keys.KeyD) this.camera.translateX(speed);
        if (keys.Space) this.camera.position.y += speed;
        if (keys.ShiftLeft) this.camera.position.y -= speed;
        if (keys.Q) this.camera.rotation.y += rotSpeed;
        if (keys.E) this.camera.rotation.y -= rotSpeed;
    }
}
