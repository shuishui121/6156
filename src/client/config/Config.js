export class Config {
    constructor() {
        this.physics = {
            gravity: -9.81,
            timestep: 1 / 120,
            maxSubSteps: 4,
            friction: 0.4,
            restitution: 0.2,
            poleYoungsModulus: 1.5e11,
            poleMass: 3.5,
            poleLength: 5.0,
            poleRadius: 0.02,
            athleteMass: 70,
            athleteHeight: 1.85,
            airResistance: 0.05
        };

        this.vr = {
            fov: 75,
            near: 0.01,
            far: 500,
            roomScale: true,
            renderScale: 1.0,
            shadowQuality: 'high'
        };

        this.training = {
            role: 'athlete',
            sessionId: null,
            barHeight: 5.0,
            runwayLength: 45,
            autoReplay: false,
            language: 'zh-CN'
        };

        this.capture = {
            deviceType: 'simulated',
            sampleRate: 120,
            smoothing: 0.85,
            boneMapping: null
        };

        this.network = {
            serverUrl: (typeof window !== 'undefined')
                ? `${window.location.protocol}//${window.location.hostname}:3000`
                : 'http://localhost:3000',
            maxLatency: 20,
            tickRate: 60,
            interpolation: true,
            extrapolation: true,
            extrapolationTime: 0.05
        };

        this.analysis = {
            idealApproachSpeed: 9.5,
            idealTakeoffAngle: 20,
            minTakeoffAngle: 15,
            maxTakeoffAngle: 25,
            idealPoleBend: 0.35,
            minPoleBend: 0.15,
            maxPoleBend: 0.6,
            idealPlantAngle: 65,
            minPlantAngle: 60,
            maxPlantAngle: 75,
            swingPhaseDuration: 0.6,
            extensionPhaseDuration: 0.4
        };

        this.feedback = {
            cooldownTime: 1.5,
            voiceEnabled: true,
            visualEnabled: true,
            textEnabled: true,
            volume: 0.8
        };

        this.scene = {
            groundSize: 200,
            runwayWidth: 1.22,
            runwayLength: 45,
            boxWidth: 1.22,
            boxLength: 1,
            landingPadWidth: 6,
            landingPadLength: 7,
            landingPadHeight: 0.7,
            standardsWidth: 4.52,
            barLength: 4.5,
            crossbarDiameter: 0.03,
            skyColor: 0x87CEEB,
            groundColor: 0x3d5c3d,
            runwayColor: 0xe8d4a8,
            padColor: 0xff6b6b,
            boxColor: 0xffffff,
            poleColor: 0xd4a574
        };
    }

    setBarHeight(height) {
        this.training.barHeight = Math.max(2.0, Math.min(6.5, height));
    }

    setRole(role) {
        this.training.role = role;
    }

    getNetworkConfig() {
        return {
            ...this.network,
            serverUrl: this.network.serverUrl
        };
    }
}
