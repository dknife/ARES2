// Web/Sim_Parts/movement.js
// Servo movement, radar rotation, collision checking, and distance sensing.

const BOX_COLLIDE_R = 1.5;
const BOX_SPAWN_RANGE = 50;
const BOX_CLEAR_R = 5;
const DIST_NO_HIT = 999;
const DIST_BOX_INFLATE = 2.0;

export class Movement {
  constructor(ctx) {
    this.ctx = ctx;
    this.radarOn = false;
    this.radarDir = 1;
    this.antennaPivot = null;
    
    this.servoOn = false;
    this.servoDir = 1;
    this.servoTurnOn = false;
    this.servoTurnDir = 1;
    
    this.obstaclesOn = true;
    this.boxes = [];
    this.irSensorBalls = [];
    this.magSensorBall = null;
    
    this.wheelR = null;
    this.wheelL = null;
  }

  // Setup floor grid, axes helpers, and 150 random box obstacles
  setupWorld(scene, editor) {
    const THREE = this.ctx.THREE;
    const FLOOR_SIZE = 100;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
      new THREE.MeshStandardMaterial({
        color: 0x3a3a3a, roughness: 0.95, metalness: 0.0,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.001;
    floor.receiveShadow = true;
    floor.renderOrder = -1;

    const grid = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 0x444444, 0x666666);
    grid.position.y = 0.002;

    this.worldGroup = new THREE.Group();
    this.worldGroup.add(floor, grid);
    this.ctx.worldGroup = this.worldGroup;

    // Random boxes
    const BOX_COUNT = 150;
    const boxGeom = new THREE.BoxGeometry(1, 2, 1);
    for (let i = 0; i < BOX_COUNT; i++) {
      let x = 0, z = 0;
      do {
        x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
      } while (Math.hypot(x, z) < BOX_CLEAR_R);
      const box = new THREE.Mesh(
        boxGeom,
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.55, 0.5), roughness: 0.8, metalness: 0.0 })
      );
      box.position.set(x, 1, z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.worldGroup.add(box);
      this.boxes.push(box);
      editor?.register(box, `Obstacle ${i + 1}`);
    }
    scene.add(this.worldGroup);
    editor?.register(this.worldGroup, 'Rover World');

    const axes = new THREE.AxesHelper(1);
    axes.position.y = 0.003;
    scene.add(axes);

    // 3-Plane Grids
    const makePlaneGrid = () => new THREE.GridHelper(2, 20, 0x888888, 0x444466);
    const gridXZ = makePlaneGrid();
    const gridXY = makePlaneGrid(); gridXY.rotation.x = Math.PI / 2;
    const gridYZ = makePlaneGrid(); gridYZ.rotation.z = Math.PI / 2;
    this.ctx.planeGrids = new THREE.Group();
    this.ctx.planeGrids.add(gridXZ, gridXY, gridYZ);
    this.ctx.planeGrids.visible = false;
    scene.add(this.ctx.planeGrids);
  }

  // Setup magnet and distance sensor indicators (spheres)
  setupSensorIndicators(roverGroup) {
    const THREE = this.ctx.THREE;
    const LED_R = 0.05;
    const ledGeom = new THREE.SphereGeometry(LED_R, 16, 12);

    this.magSensorBall = new THREE.Mesh(
      ledGeom,
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 })
    );
    this.magSensorBall.position.set(0, -0.3, 0.9);
    roverGroup.add(this.magSensorBall);

    [-0.22, 0.22].forEach((x) => {
      const ball = new THREE.Mesh(
        ledGeom,
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 })
      );
      ball.position.set(x, 0.58, 0.1);
      roverGroup.add(ball);
      this.irSensorBalls.push(ball);
    });
  }

  // Position and attach wheels
  setupWheels(roverGroup, root, editor) {
    root.scale.multiplyScalar(0.8);
    this.wheelR = root;
    this.wheelL = root.clone();
    this.wheelR.rotation.y = Math.PI / 2;
    this.wheelL.rotation.y = Math.PI / 2;
    this.wheelR.position.set(0.7, 0, -0.3);
    this.wheelL.position.set(-0.7, 0, -0.3);
    roverGroup.add(this.wheelR, this.wheelL);
    editor?.register(this.wheelR, 'RoverWheel R');
    editor?.register(this.wheelL, 'RoverWheel L');
  }

  // Position and attach radar
  setupRadar(roverGroup, root, editor) {
    root.scale.multiplyScalar(0.5).multiplyScalar(0.8);
    root.position.set(0, 0.5, -0.9);
    this.antennaPivot = root;
    roverGroup.add(root);
    editor?.register(root, 'RoverRadar');
  }

  // Position and attach head
  setupHead(roverGroup, root, editor) {
    root.position.set(0, 0.6, -0.3);
    root.rotation.y = Math.PI;
    roverGroup.add(root);
    editor?.register(root, 'RoverHead');
  }

  setRadar(on, dir) {
    this.radarOn = !!on;
    if (dir !== undefined && dir !== null) {
      this.radarDir = dir < 0 ? -1 : 1;
    }
  }

  setServoMove(on, dir) {
    this.servoOn = !!on;
    if (this.servoOn) this.servoTurnOn = false;
    if (dir !== undefined && dir !== null) {
      this.servoDir = dir < 0 ? -1 : 1;
    }
  }

  setServoTurn(on, dir) {
    this.servoTurnOn = !!on;
    if (this.servoTurnOn) this.servoOn = false;
    if (dir !== undefined && dir !== null) {
      this.servoTurnDir = dir < 0 ? -1 : 1;
    }
  }

  stopServo() {
    this.servoOn = false;
    this.servoTurnOn = false;
  }

  nearestBoxDist() {
    if (!this.obstaclesOn) return Infinity;
    const THREE = this.ctx.THREE;
    const boxTmp = new THREE.Vector3();
    let m = Infinity;
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].getWorldPosition(boxTmp);
      const d = Math.hypot(boxTmp.x, boxTmp.z);
      if (d < m) m = d;
    }
    return m;
  }

  respawnBoxes() {
    if (!this.ctx.worldGroup) return;
    this.ctx.worldGroup.position.set(0, 0, 0);
    this.ctx.worldGroup.quaternion.identity();
    for (let i = 0; i < this.boxes.length; i++) {
      let x = 0, z = 0;
      do {
        x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
      } while (Math.hypot(x, z) < BOX_CLEAR_R);
      this.boxes[i].position.set(x, 1, z);
    }
  }

  setObstacles(on) {
    this.obstaclesOn = !!on;
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].visible = this.obstaclesOn;
    }
  }

  setDistanceSensor(on) {
    for (let i = 0; i < this.irSensorBalls.length; i++) {
      const m = this.irSensorBalls[i].material;
      if (on) {
        m.color.setHex(0xff2222);
        m.emissive.setHex(0xff2222);
        m.emissiveIntensity = 2.6;
        m.opacity = 0.9;
      } else {
        m.color.setHex(0xffffff);
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
        m.opacity = 0.25;
      }
    }
  }

  measureDistance() {
    if (this.irSensorBalls.length === 0 || !this.obstaclesOn) {
      return DIST_NO_HIT;
    }
    const THREE = this.ctx.THREE;
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, 1);
    const origin = new THREE.Vector3();

    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].scale.set(DIST_BOX_INFLATE, 1, DIST_BOX_INFLATE);
    }
    if (this.ctx.worldGroup) this.ctx.worldGroup.updateMatrixWorld(true);
    
    let minDist = Infinity;
    for (let i = 0; i < this.irSensorBalls.length; i++) {
      this.irSensorBalls[i].getWorldPosition(origin);
      ray.set(origin, dir);
      const hits = ray.intersectObjects(this.boxes, false);
      if (hits.length && hits[0].distance < minDist) {
        minDist = hits[0].distance;
      }
    }
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].scale.set(1, 1, 1);
    }
    
    if (!isFinite(minDist)) return DIST_NO_HIT;
    return Math.round(minDist * 10);
  }
}
