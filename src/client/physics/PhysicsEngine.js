import * as CANNON from 'cannon-es';

export class PhysicsEngine {
    constructor(config) {
        this.config = config;
        this.world = null;
        this.bodies = new Map();
        this.constraints = [];
        this.contactMaterials = [];
        this.poleSegments = [];
        this.poleSpringForces = [];
        this.isInitialized = false;

        this.timeSinceLastStep = 0;
        this.accumulator = 0;
        this.groundBody = null;
        this.runwayBody = null;
        this.boxBody = null;
        this.padBody = null;
        this.crossbarBody = null;
        this.athleteBody = null;
    }

    init(sceneManager) {
        this.sceneManager = sceneManager;

        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, this.config.physics.gravity, 0),
            allowSleep: false
        });

        try {
            if (CANNON.SAPBroadphase) {
                this.world.broadphase = new CANNON.SAPBroadphase(this.world);
            }
        } catch (e) {
            console.warn('[PhysicsEngine] SAPBroadphase不可用，使用默认碰撞检测');
        }

        this.world.defaultContactMaterial.friction = this.config.physics.friction;
        this.world.defaultContactMaterial.restitution = this.config.physics.restitution;

        this.createMaterials();
        this.createGround();
        this.createRunway();
        this.createTakeoffBox();
        this.createLandingPad();
        this.createCrossbar();
        this.createAthlete();
        this.createPole();

        this.isInitialized = true;
        console.log('[PhysicsEngine] 物理引擎初始化完成');
    }

    createMaterials() {
        this.materials = {
            ground: new CANNON.Material('ground'),
            shoe: new CANNON.Material('shoe'),
            pole: new CANNON.Material('pole'),
            mat: new CANNON.Material('mat'),
            metal: new CANNON.Material('metal')
        };

        const groundShoe = new CANNON.ContactMaterial(
            this.materials.ground,
            this.materials.shoe,
            { friction: 1.2, restitution: 0.0 }
        );
        this.world.addContactMaterial(groundShoe);
        this.contactMaterials.push(groundShoe);

        const poleBox = new CANNON.ContactMaterial(
            this.materials.pole,
            this.materials.metal,
            { friction: 0.8, restitution: 0.1 }
        );
        this.world.addContactMaterial(poleBox);
        this.contactMaterials.push(poleBox);

        const matContact = new CANNON.ContactMaterial(
            this.materials.mat,
            this.materials.shoe,
            { friction: 0.5, restitution: 0.4 }
        );
        this.world.addContactMaterial(matContact);
        this.contactMaterials.push(matContact);
    }

    createGround() {
        const size = this.config.scene.groundSize;
        const groundShape = new CANNON.Plane();
        this.groundBody = new CANNON.Body({
            mass: 0,
            shape: groundShape,
            material: this.materials.ground,
            position: new CANNON.Vec3(0, 0, 0)
        });
        this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(this.groundBody);
        this.bodies.set('ground', this.groundBody);
    }

    createRunway() {
        const width = this.config.scene.runwayWidth;
        const length = this.config.scene.runwayLength;
        const runwayShape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.01, length / 2));
        this.runwayBody = new CANNON.Body({
            mass: 0,
            shape: runwayShape,
            material: this.materials.ground,
            position: new CANNON.Vec3(0, 0.01, -(length / 2 - 5))
        });
        this.world.addBody(this.runwayBody);
        this.bodies.set('runway', this.runwayBody);
    }

    createTakeoffBox() {
        const width = this.config.scene.boxWidth;
        const length = this.config.scene.boxLength;
        const boxShape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.05, length / 2));
        this.boxBody = new CANNON.Body({
            mass: 0,
            shape: boxShape,
            material: this.materials.metal,
            position: new CANNON.Vec3(0, 0.05, -length / 2 - 0.1)
        });
        this.world.addBody(this.boxBody);
        this.bodies.set('box', this.boxBody);
    }

    createLandingPad() {
        const width = this.config.scene.landingPadWidth;
        const length = this.config.scene.landingPadLength;
        const height = this.config.scene.landingPadHeight;

        const padShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, length / 2));
        this.padBody = new CANNON.Body({
            mass: 0,
            shape: padShape,
            material: this.materials.mat,
            position: new CANNON.Vec3(0, height / 2, -5)
        });
        this.world.addBody(this.padBody);
        this.bodies.set('pad', this.padBody);
    }

    createCrossbar() {
        const barLength = this.config.scene.barLength;
        const radius = this.config.scene.crossbarDiameter / 2;

        const barShape = new CANNON.Cylinder(radius, radius, barLength, 16);
        this.crossbarBody = new CANNON.Body({
            mass: 0.5,
            shape: barShape,
            material: this.materials.metal,
            position: new CANNON.Vec3(0, this.config.training.barHeight, -2.5),
            type: CANNON.Body.STATIC
        });
        this.crossbarBody.quaternion.setFromEuler(0, 0, Math.PI / 2);
        this.world.addBody(this.crossbarBody);
        this.bodies.set('crossbar', this.crossbarBody);
    }

    createAthlete() {
        const mass = this.config.physics.athleteMass;
        const height = this.config.physics.athleteHeight;

        const torsoShape = new CANNON.Sphere(height * 0.25);
        this.athleteBody = new CANNON.Body({
            mass: mass,
            shape: torsoShape,
            material: this.materials.shoe,
            position: new CANNON.Vec3(0, height * 0.5, 20),
            linearDamping: 0.01,
            angularDamping: 0.05,
            fixedRotation: false
        });
        this.athleteBody.allowSleep = false;
        this.world.addBody(this.athleteBody);
        this.bodies.set('athlete', this.athleteBody);

        const leftFootShape = new CANNON.Box(new CANNON.Vec3(0.06, 0.03, 0.125));
        const leftFootBody = new CANNON.Body({
            mass: 2,
            shape: leftFootShape,
            material: this.materials.shoe,
            position: new CANNON.Vec3(-0.1, height * 0.05, 20)
        });
        this.world.addBody(leftFootBody);
        this.bodies.set('leftFoot', leftFootBody);

        const rightFootShape = new CANNON.Box(new CANNON.Vec3(0.06, 0.03, 0.125));
        const rightFootBody = new CANNON.Body({
            mass: 2,
            shape: rightFootShape,
            material: this.materials.shoe,
            position: new CANNON.Vec3(0.1, height * 0.05, 20)
        });
        this.world.addBody(rightFootBody);
        this.bodies.set('rightFoot', rightFootBody);

        const leftArmShape = new CANNON.Sphere(0.08);
        const leftArmBody = new CANNON.Body({
            mass: 3,
            shape: leftArmShape,
            material: this.materials.shoe,
            position: new CANNON.Vec3(-0.3, height * 0.75, 20)
        });
        this.world.addBody(leftArmBody);
        this.bodies.set('leftArm', leftArmBody);

        const rightArmShape = new CANNON.Sphere(0.08);
        const rightArmBody = new CANNON.Body({
            mass: 3,
            shape: rightArmShape,
            material: this.materials.shoe,
            position: new CANNON.Vec3(0.3, height * 0.75, 20)
        });
        this.world.addBody(rightArmBody);
        this.bodies.set('rightArm', rightArmBody);

        const legDistance = 0.1;
        const hipHeight = height * 0.4;

        const leftHinge = new CANNON.HingeConstraint(
            this.athleteBody,
            leftFootBody,
            {
                pivotA: new CANNON.Vec3(-legDistance, -hipHeight + 0.1, 0),
                axisA: new CANNON.Vec3(1, 0, 0),
                pivotB: new CANNON.Vec3(0, 0.03, 0),
                axisB: new CANNON.Vec3(1, 0, 0)
            }
        );
        this.world.addConstraint(leftHinge);
        this.constraints.push(leftHinge);

        const rightHinge = new CANNON.HingeConstraint(
            this.athleteBody,
            rightFootBody,
            {
                pivotA: new CANNON.Vec3(legDistance, -hipHeight + 0.1, 0),
                axisA: new CANNON.Vec3(1, 0, 0),
                pivotB: new CANNON.Vec3(0, 0.03, 0),
                axisB: new CANNON.Vec3(1, 0, 0)
            }
        );
        this.world.addConstraint(rightHinge);
        this.constraints.push(rightHinge);

        const shoulderHeight = height * 0.75 - height * 0.5;
        const armDistance = 0.3;

        const leftBall = new CANNON.PointToPointConstraint(
            this.athleteBody,
            new CANNON.Vec3(-armDistance, shoulderHeight, 0),
            leftArmBody,
            new CANNON.Vec3(0, 0, 0)
        );
        this.world.addConstraint(leftBall);
        this.constraints.push(leftBall);

        const rightBall = new CANNON.PointToPointConstraint(
            this.athleteBody,
            new CANNON.Vec3(armDistance, shoulderHeight, 0),
            rightArmBody,
            new CANNON.Vec3(0, 0, 0)
        );
        this.world.addConstraint(rightBall);
        this.constraints.push(rightBall);

        this.athleteBody.addEventListener('collide', (event) => {
            if (event.body === this.crossbarBody && this.sceneManager) {
                this.sceneManager.dropCrossbar();
                this.crossbarBody.type = CANNON.Body.DYNAMIC;
            }
        });
    }

    createPole() {
        const length = this.config.physics.poleLength;
        const radius = this.config.physics.poleRadius;
        const mass = this.config.physics.poleMass;
        const segments = 10;

        const segmentLength = length / segments;
        const segmentMass = mass / segments;
        const youngsModulus = this.config.physics.poleYoungsModulus;
        const I = (Math.PI * Math.pow(radius, 4)) / 4;
        const EI = youngsModulus * I;
        const springStiffness = (2 * EI) / Math.pow(segmentLength, 3);
        const damping = springStiffness * 0.02;

        this.poleSegments = [];
        this.poleSpringForces = [];

        for (let i = 0; i <= segments; i++) {
            const segmentShape = new CANNON.Sphere(radius * 1.2);
            const yPos = i * segmentLength;
            const segmentBody = new CANNON.Body({
                mass: i === 0 ? 0.1 : segmentMass,
                shape: segmentShape,
                material: this.materials.pole,
                position: new CANNON.Vec3(0.3, yPos + 1.5, 20),
                linearDamping: 0.1,
                angularDamping: 0.1
            });
            segmentBody.allowSleep = false;
            this.world.addBody(segmentBody);
            this.poleSegments.push(segmentBody);
            this.bodies.set(`pole_${i}`, segmentBody);
        }

        for (let i = 0; i < segments; i++) {
            const distanceConstraint = new CANNON.DistanceConstraint(
                this.poleSegments[i],
                this.poleSegments[i + 1],
                segmentLength,
                1e8
            );
            this.world.addConstraint(distanceConstraint);
            this.constraints.push(distanceConstraint);
        }

        for (let i = 0; i < segments - 1; i++) {
            const spring = {
                bodyA: this.poleSegments[i],
                bodyB: this.poleSegments[i + 1],
                bodyC: this.poleSegments[i + 2],
                stiffness: springStiffness,
                damping: damping,
                restAngle: Math.PI
            };
            this.poleSpringForces.push(spring);
        }
    }

    setAthleteKinematic(isKinematic) {
        const type = isKinematic ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
        this.athleteBody.type = type;

        const limbs = ['leftFoot', 'rightFoot', 'leftArm', 'rightArm'];
        for (const limb of limbs) {
            const body = this.bodies.get(limb);
            if (body) body.type = type;
        }
    }

    setAthletePosition(position) {
        this.athleteBody.position.set(position.x, position.y, position.z);
        this.athleteBody.velocity.setZero();
    }

    setAthleteVelocity(velocity) {
        this.athleteBody.velocity.set(velocity.x, velocity.y, velocity.z);
    }

    applyJumpForce(takeoffAngle, forceMagnitude) {
        const angleRad = (takeoffAngle * Math.PI) / 180;
        const forwardForce = forceMagnitude * Math.cos(angleRad);
        const upwardForce = forceMagnitude * Math.sin(angleRad);

        const force = new CANNON.Vec3(0, upwardForce, -forwardForce);
        this.athleteBody.applyImpulse(force, this.athleteBody.position);
    }

    plantPole(plantPoint) {
        if (this.poleSegments.length === 0) return;

        const tip = this.poleSegments[0];
        tip.type = CANNON.Body.STATIC;
        tip.position.set(plantPoint.x, plantPoint.y, plantPoint.z);
        tip.velocity.setZero();

        if (this.sceneManager) {
            this.sceneManager.setPolePlant(true, {
                x: plantPoint.x,
                y: plantPoint.y,
                z: plantPoint.z
            });
        }
    }

    releasePole() {
        if (this.poleSegments.length === 0) return;

        const tip = this.poleSegments[0];
        tip.type = CANNON.Body.DYNAMIC;
        tip.mass = this.config.physics.poleMass / 11;

        if (this.sceneManager) {
            this.sceneManager.setPolePlant(false);
        }
    }

    applyPoleHoldingForce(handPosition) {
        if (this.poleSegments.length < 2) return;

        const topSegment = this.poleSegments[this.poleSegments.length - 1];
        const stiffness = 5000;
        const damping = 100;

        const target = new CANNON.Vec3(handPosition.x, handPosition.y, handPosition.z);
        const current = topSegment.position;

        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const dz = target.z - current.z;

        const forceX = dx * stiffness - topSegment.velocity.x * damping;
        const forceY = dy * stiffness - topSegment.velocity.y * damping;
        const forceZ = dz * stiffness - topSegment.velocity.z * damping;

        topSegment.applyForce(new CANNON.Vec3(forceX, forceY, forceZ), current);
    }

    calculatePoleBend() {
        if (this.poleSegments.length < 3) return 0;

        let maxBend = 0;
        const tip = this.poleSegments[0].position;
        const tail = this.poleSegments[this.poleSegments.length - 1].position;

        const poleDir = new CANNON.Vec3(
            tail.x - tip.x,
            tail.y - tip.y,
            tail.z - tip.z
        );
        const poleLength = Math.sqrt(poleDir.x ** 2 + poleDir.y ** 2 + poleDir.z ** 2);
        poleDir.scale(1 / poleLength, poleDir);

        for (let i = 1; i < this.poleSegments.length - 1; i++) {
            const seg = this.poleSegments[i].position;
            const toPoint = new CANNON.Vec3(seg.x - tip.x, seg.y - tip.y, seg.z - tip.z);

            const projection = toPoint.x * poleDir.x + toPoint.y * poleDir.y + toPoint.z * poleDir.z;
            const closest = new CANNON.Vec3(
                tip.x + poleDir.x * projection,
                tip.y + poleDir.y * projection,
                tip.z + poleDir.z * projection
            );

            const bendDist = Math.sqrt(
                (seg.x - closest.x) ** 2 +
                (seg.y - closest.y) ** 2 +
                (seg.z - closest.z) ** 2
            );
            maxBend = Math.max(maxBend, bendDist);
        }

        const normalizedBend = maxBend / poleLength;

        if (this.sceneManager && this.sceneManager.pole) {
            this.sceneManager.pole.userData.bendAmount = maxBend;
        }

        return normalizedBend;
    }

    getPoleEnergyStored() {
        const bend = this.calculatePoleBend();
        const length = this.config.physics.poleLength;
        const EI = this.config.physics.poleYoungsModulus *
                   (Math.PI * Math.pow(this.config.physics.poleRadius, 4)) / 4;

        return 0.5 * EI * Math.pow(bend * 8 / (length * length), 2) * length;
    }

    updatePoleBendingSprings() {
        for (const spring of this.poleSpringForces) {
            const a = spring.bodyA.position;
            const b = spring.bodyB.position;
            const c = spring.bodyC.position;

            const ab = new CANNON.Vec3(b.x - a.x, b.y - a.y, b.z - a.z);
            const bc = new CANNON.Vec3(c.x - b.x, c.y - b.y, c.z - b.z);

            const abLen = Math.sqrt(ab.x ** 2 + ab.y ** 2 + ab.z ** 2);
            const bcLen = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);

            const abN = new CANNON.Vec3(ab.x / abLen, ab.y / abLen, ab.z / abLen);
            const bcN = new CANNON.Vec3(bc.x / bcLen, bc.y / bcLen, bc.z / bcLen);

            const dot = abN.x * bcN.x + abN.y * bcN.y + abN.z * bcN.z;
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            const angleDelta = Math.PI - angle;

            const cross = new CANNON.Vec3(
                abN.y * bcN.z - abN.z * bcN.y,
                abN.z * bcN.x - abN.x * bcN.z,
                abN.x * bcN.y - abN.y * bcN.x
            );
            const crossLen = Math.sqrt(cross.x ** 2 + cross.y ** 2 + cross.z ** 2);
            if (crossLen > 0.0001) {
                cross.scale(1 / crossLen, cross);
            }

            const torqueMag = spring.stiffness * angleDelta;

            const torqueB = new CANNON.Vec3(cross.x * torqueMag, cross.y * torqueMag, cross.z * torqueMag);
            const torqueA = new CANNON.Vec3(-torqueB.x * 0.5, -torqueB.y * 0.5, -torqueB.z * 0.5);
            const torqueC = new CANNON.Vec3(-torqueB.x * 0.5, -torqueB.y * 0.5, -torqueB.z * 0.5);

            spring.bodyA.applyTorque(torqueA);
            spring.bodyB.applyTorque(torqueB);
            spring.bodyC.applyTorque(torqueC);

            const angVelA = spring.bodyA.angularVelocity;
            const angVelB = spring.bodyB.angularVelocity;
            const angVelC = spring.bodyC.angularVelocity;

            const dampTorque = -spring.damping * angleDelta;
            spring.bodyA.applyTorque(new CANNON.Vec3(cross.x * dampTorque * 0.3, cross.y * dampTorque * 0.3, cross.z * dampTorque * 0.3));
            spring.bodyC.applyTorque(new CANNON.Vec3(cross.x * dampTorque * 0.3, cross.y * dampTorque * 0.3, cross.z * dampTorque * 0.3));
        }
    }

    resetPole() {
        const length = this.config.physics.poleLength;
        const segments = 10;
        const segmentLength = length / segments;

        for (let i = 0; i < this.poleSegments.length; i++) {
            const yPos = i * segmentLength;
            this.poleSegments[i].position.set(0.3, yPos + 1.5, 20);
            this.poleSegments[i].velocity.setZero();
            this.poleSegments[i].angularVelocity.setZero();
            this.poleSegments[i].quaternion.setFromEuler(0, 0, 0);

            if (i === 0) {
                this.poleSegments[i].type = CANNON.Body.DYNAMIC;
                this.poleSegments[i].mass = 0.1;
            }
        }
    }

    resetAthlete() {
        const height = this.config.physics.athleteHeight;
        this.athleteBody.position.set(0, height * 0.5, 20);
        this.athleteBody.velocity.setZero();
        this.athleteBody.angularVelocity.setZero();
        this.athleteBody.quaternion.setFromEuler(0, 0, 0);

        const leftFoot = this.bodies.get('leftFoot');
        if (leftFoot) {
            leftFoot.position.set(-0.1, height * 0.05, 20);
            leftFoot.velocity.setZero();
        }
        const rightFoot = this.bodies.get('rightFoot');
        if (rightFoot) {
            rightFoot.position.set(0.1, height * 0.05, 20);
            rightFoot.velocity.setZero();
        }

        this.crossbarBody.type = CANNON.Body.STATIC;
        this.crossbarBody.position.set(0, this.config.training.barHeight, -2.5);
        this.crossbarBody.quaternion.setFromEuler(0, 0, Math.PI / 2);
        this.crossbarBody.velocity.setZero();
    }

    getAthleteState() {
        const height = this.config.physics.athleteHeight;
        return {
            position: {
                x: this.athleteBody.position.x,
                y: this.athleteBody.position.y - height * 0.5,
                z: this.athleteBody.position.z
            },
            velocity: {
                x: this.athleteBody.velocity.x,
                y: this.athleteBody.velocity.y,
                z: this.athleteBody.velocity.z
            },
            speed: Math.sqrt(
                this.athleteBody.velocity.x ** 2 +
                this.athleteBody.velocity.y ** 2 +
                this.athleteBody.velocity.z ** 2
            ),
            horizontalSpeed: Math.sqrt(
                this.athleteBody.velocity.x ** 2 +
                this.athleteBody.velocity.z ** 2
            )
        };
    }

    getPoleTipPosition() {
        if (this.poleSegments.length === 0) return { x: 0, y: 0, z: 0 };
        const tip = this.poleSegments[0].position;
        return { x: tip.x, y: tip.y, z: tip.z };
    }

    step(deltaTime) {
        if (!this.isInitialized) return;

        const fixedStep = this.config.physics.timestep;
        const maxSubSteps = this.config.physics.maxSubSteps;

        this.updatePoleBendingSprings();
        this.applyAirResistance();

        this.world.step(fixedStep, deltaTime, maxSubSteps);
    }

    applyAirResistance() {
        const drag = this.config.physics.airResistance;
        const vel = this.athleteBody.velocity;
        const speed2 = vel.x ** 2 + vel.y ** 2 + vel.z ** 2;

        if (speed2 > 0.01) {
            const dragForce = drag * speed2;
            const speed = Math.sqrt(speed2);
            const force = new CANNON.Vec3(
                -vel.x / speed * dragForce,
                -vel.y / speed * dragForce,
                -vel.z / speed * dragForce
            );
            this.athleteBody.applyForce(force, this.athleteBody.position);
        }
    }

    dispose() {
        for (const constraint of this.constraints) {
            this.world.removeConstraint(constraint);
        }
        for (const [name, body] of this.bodies) {
            this.world.removeBody(body);
        }
        this.constraints = [];
        this.bodies.clear();
        this.poleSegments = [];
        this.poleSpringForces = [];
        this.world = null;
        this.isInitialized = false;
    }
}
