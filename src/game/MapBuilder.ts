import * as THREE from 'three';
import { createBrickTexture, createBrickFaceMaterials, createContainerFaceMaterials, createBrickNormalMap, createConcreteTexture, createGrassTexture, createSandTexture, createRustTexture } from './ProceduralTextures';

export interface CollidableBox {
  box: THREE.Box3;
  mesh: THREE.Mesh;
  type: 'wall' | 'crate' | 'ramp' | 'floor';
}

export interface MapData {
  spawnPoints: THREE.Vector3[];
  colliders: CollidableBox[];
  ambientColor: string;
  directionalColor: string;
  fogColor: string;
  fogDensity: number;
}

export function buildMap(scene: THREE.Scene, mapId: 'shipment' | 'rust' | 'dust2' | 'nuketown' | 'teams_combo' | 'tutorial' | 'campaign2' | 'campaign3'): MapData {
  const colliders: CollidableBox[] = [];
  const spawnPoints: THREE.Vector3[] = [];

  // Helper to create a solid collidable crate/wall box
  // Uses per-face materials so brick textures tile correctly on each face
  const createCrate = (
    pos: [number, number, number],
    size: [number, number, number],
    color: number,
    rotY = 0,
    type: 'wall' | 'crate' | 'ramp' = 'crate'
  ) => {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    let mat: THREE.Material | THREE.Material[];
    if (type === 'wall') {
      // Per-face materials: each face gets correct brick repeat for its dimensions
      // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
      // +X/-X are D wide x H tall, +Z/-Z are W wide x H tall, +Y/-Y are flat
      mat = createBrickFaceMaterials(color, size[0], size[1], size[2]);
    } else {
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.2,
        flatShading: true,
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push({ box, mesh, type });
    return mesh;
  };

  // Helper to create a walk-through hollow container (open on front/back ends)
  const createOpenContainer = (
    pos: [number, number, number],
    size: [number, number, number], // [width, height, length] along Z
    color: number,
    rotY = 0
  ) => {
    const [w, h, l] = size;
    const wallThick = 0.3;
    const group = new THREE.Group();
    group.position.set(...pos);
    group.rotation.y = rotY;

    // Per-face materials for each sub-wall of the container
    const makeSideMat = (faceW: number, faceH: number) => {
      const tex = createBrickTexture(color, 0x4b5563, 48, 24, 3);
      tex.repeat.set(Math.max(1, Math.round(faceW / 3)), Math.max(1, Math.round(faceH / 2)));
      return new THREE.MeshStandardMaterial({
        map: tex,
        color,
        roughness: 0.7,
        metalness: 0.3,
        side: THREE.DoubleSide,
      });
    };

    // Left Wall (wallThick wide x h tall x l deep)
    const leftMats = createContainerFaceMaterials(color, wallThick, h, l);
    const leftMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, l), leftMats);
    leftMesh.position.set(-w / 2 + wallThick / 2, 0, 0);
    leftMesh.castShadow = true;
    leftMesh.receiveShadow = true;
    group.add(leftMesh);

    // Right Wall
    const rightMats = createContainerFaceMaterials(color, wallThick, h, l);
    const rightMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, l), rightMats);
    rightMesh.position.set(w / 2 - wallThick / 2, 0, 0);
    rightMesh.castShadow = true;
    rightMesh.receiveShadow = true;
    group.add(rightMesh);

    // Roof
    const roofMats = createContainerFaceMaterials(color, w, wallThick, l);
    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallThick, l), roofMats);
    roofMesh.position.set(0, h / 2 - wallThick / 2, 0);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    scene.add(group);

    // Add colliders for left wall, right wall, and roof
    colliders.push(
      { box: new THREE.Box3().setFromObject(leftMesh), mesh: leftMesh, type: 'crate' },
      { box: new THREE.Box3().setFromObject(rightMesh), mesh: rightMesh, type: 'crate' },
      { box: new THREE.Box3().setFromObject(roofMesh), mesh: roofMesh, type: 'crate' }
    );

    return group;
  };

  // ============================================================
  // createDetailedBuilding: multi-part building with windows,
  // ledges, and cornices for realistic architecture.
  // Each sub-wall gets per-face materials so textures tile correctly.
  // ============================================================
  const createDetailedBuilding = (
    pos: [number, number, number],
    size: [number, number, number], // [width, height, depth]
    color: number,
    opts?: {
      rotY?: number;
      windowRows?: number;
      windowCols?: number;
      windowColor?: number;
      ledgeSize?: number;
      corniceSize?: number;
    }
  ) => {
    const [w, h, d] = size;
    const rotY = opts?.rotY ?? 0;
    const windowRows = opts?.windowRows ?? 2;
    const windowCols = opts?.windowCols ?? 3;
    const windowColor = opts?.windowColor ?? 0x1e293b;
    const ledgeSize = opts?.ledgeSize ?? 0.3;
    const corniceSize = opts?.corniceSize ?? 0.5;
    const group = new THREE.Group();
    group.position.set(...pos);
    group.rotation.y = rotY;

    const addPart = (
      localPos: [number, number, number],
      partSize: [number, number, number],
      partColor: number,
      isWall = false
    ) => {
      const geo = new THREE.BoxGeometry(partSize[0], partSize[1], partSize[2]);
      let mat: THREE.Material | THREE.Material[];
      if (isWall) {
        mat = createBrickFaceMaterials(partColor, partSize[0], partSize[1], partSize[2]);
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: partColor,
          roughness: 0.7,
          metalness: isWall ? 0.15 : 0.4,
          flatShading: !isWall,
        });
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...localPos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    // Main body (slightly smaller than outer bounds to leave room for ledges)
    const inset = 0.15;
    addPart([0, 0, 0], [w - inset * 2, h, d - inset * 2], color, true);

    // Bottom ledge / foundation
    if (ledgeSize > 0) {
      addPart([0, -h / 2 + ledgeSize / 2, 0], [w + 0.2, ledgeSize, d + 0.2], 0x374151);
    }

    // Top cornice / ledge
    if (corniceSize > 0) {
      addPart([0, h / 2 - corniceSize / 2, 0], [w + 0.2, corniceSize, d + 0.2], 0x475569);
    }

    // Windows on front face (+Z side)
    const winW = (w * 0.6) / windowCols;
    const winH = (h * 0.35) / windowRows;
    const winD = 0.3;
    const startX = -(windowCols - 1) * (winW + 0.8) / 2;
    const startY = h * 0.15;

    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const wx = startX + col * (winW + 0.8);
        const wy = startY + row * (winH + 1.5);
        if (wy + winH / 2 < h - corniceSize - 0.5) {
          // Window recess (dark inset)
          addPart([wx, wy, d / 2 - 0.1], [winW, winH, winD], windowColor);
          // Window sill (small ledge below window)
          addPart([wx, wy - winH / 2 - 0.15, d / 2], [winW + 0.3, 0.15, 0.4], 0x475569);
          // Window lintel (small ledge above window)
          addPart([wx, wy + winH / 2 + 0.1, d / 2], [winW + 0.2, 0.15, 0.3], 0x475569);
        }
      }
    }

    // Windows on back face (-Z side)
    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const wx = startX + col * (winW + 0.8);
        const wy = startY + row * (winH + 1.5);
        if (wy + winH / 2 < h - corniceSize - 0.5) {
          addPart([wx, wy, -d / 2 + 0.1], [winW, winH, winD], windowColor);
          addPart([wx, wy - winH / 2 - 0.15, -d / 2], [winW + 0.3, 0.15, 0.4], 0x475569);
          addPart([wx, wy + winH / 2 + 0.1, -d / 2], [winW + 0.2, 0.15, 0.3], 0x475569);
        }
      }
    }

    scene.add(group);

    // Use the main body mesh for the collider
    const mainMesh = group.children[0] as THREE.Mesh;
    const box = new THREE.Box3().setFromObject(group);
    colliders.push({ box, mesh: mainMesh, type: 'wall' });

    return group;
  };

  // Setup sky & map-specific lighting/fog defaults
  let ambientColor = '#ffffff';
  let directionalColor = '#ffffff';
  let fogColor = '#1e1b4b';
  let fogDensity = 0.012;

  if (mapId === 'nuketown') {
    ambientColor = '#fef08a'; // Bright suburban sunshine
    directionalColor = '#ffffff';
    fogColor = '#fde047'; // Warm nuclear test haze
    fogDensity = 0.006;

    const floorWidth = 140;
    const floorDepth = 120;
    
    // Main asphalt road floor
    const roadGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
    const roadTex = createConcreteTexture(0x334155, 1.0, 18);
    roadTex.repeat.set(floorWidth / 8, floorDepth / 8);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, color: 0x334155, roughness: 0.85 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    scene.add(road);

    // Green grass yards on West and East sides
    const yardGeo = new THREE.PlaneGeometry(45, 100);
    const grassTex = createGrassTexture(0x15803d);
    grassTex.repeat.set(8, 16);
    const yardMat = new THREE.MeshStandardMaterial({ map: grassTex, color: 0x15803d, roughness: 0.9 });
    const yardW = new THREE.Mesh(yardGeo, yardMat);
    yardW.position.set(-42, 0.05, 0);
    yardW.rotation.x = -Math.PI / 2;
    yardW.receiveShadow = true;
    scene.add(yardW);

    const yardE = new THREE.Mesh(yardGeo, yardMat);
    yardE.position.set(42, 0.05, 0);
    yardE.rotation.x = -Math.PI / 2;
    yardE.receiveShadow = true;
    scene.add(yardE);

    // Perimeter Suburban Fence/Walls
    const wallHeight = 10;
    const wallColor = 0xe2e8f0;
    createCrate([0, wallHeight / 2, -55], [140, wallHeight, 2], wallColor, 0, 'wall'); // N
    createCrate([0, wallHeight / 2, 55], [140, wallHeight, 2], wallColor, 0, 'wall');  // S
    createCrate([-68, wallHeight / 2, 0], [2, wallHeight, 110], wallColor, 0, 'wall'); // W
    createCrate([68, wallHeight / 2, 0], [2, wallHeight, 110], wallColor, 0, 'wall');  // E

    // Helper for hollow Nuketown houses
    const buildNuketownHouse = (x: number, color1: number, color2: number, sign: number) => {
      const w = 22, h = 8, d = 28, t = 1.5;
      
      // Ground floor walls
      createCrate([x + sign * (w/2), h/2, 0], [t, h, d], color1);
      createCrate([x - sign * (w/2), h/2, 9], [t, h, 10], color1);
      createCrate([x - sign * (w/2), h/2, -10], [t, h, 8], color1);
      createCrate([x - sign * (w/2), h - 1.5, 0], [t, 3, d], color1);
      
      // Side walls
      createCrate([x, h/2, d/2], [w, h, t], color1);
      createCrate([x, h/2, -d/2], [w, h, t], color1);
      
      // 2nd floor floor
      createCrate([x, h + 0.5, 9], [w, 1, 10], color2);
      createCrate([x, h + 0.5, -9], [w, 1, 10], color2);
      createCrate([x + sign * 7.5, h + 0.5, 0], [5, 1, 8], color2);
      createCrate([x - sign * 7.5, h + 0.5, 0], [5, 1, 8], color2);

      // 2nd floor walls
      createCrate([x + sign * (w/2 - 1), h + 4, 0], [t, 6, d - 2], color2);
      createCrate([x - sign * (w/2 - 1), h + 4, 8], [t, 6, 10], color2);
      createCrate([x - sign * (w/2 - 1), h + 4, -8], [t, 6, 10], color2);
      createCrate([x - sign * (w/2 - 1), h + 6.5, 0], [t, 1, d], color2);
      
      createCrate([x, h + 4, d/2 - 1], [w, 6, t], color2);
      createCrate([x, h + 4, -d/2 + 1], [w, 6, t], color2);
      
      // Roof
      createCrate([x, h + 7.5, 0], [w + 2, 1, d + 2], 0x334155);

      // Stairs
      const numSteps = 16;
      const stepWidth = 8;
      const stepHeight = (h + 1) / numSteps;
      const stepDepth = 10 / numSteps;
      for (let i = 0; i < numSteps; i++) {
        const stepX = (x + sign * 5) - (sign * (i * stepDepth));
        const stepY = i * stepHeight + (stepHeight / 2);
        createCrate([stepX, stepY, 0], [stepDepth, stepHeight, stepWidth], 0x475569);
      }

      // Balcony
      createCrate([x - sign * 13, h - 0.5, 0], [6, 1, 14], 0x854d0e);
      createCrate([x - sign * 16, h + 0.5, 0], [0.5, 1.5, 14], 0x451a03);
      createCrate([x - sign * 13.25, h + 0.5, 7], [6, 1.5, 0.5], 0x451a03);
      createCrate([x - sign * 13.25, h + 0.5, -7], [6, 1.5, 0.5], 0x451a03);

      // Garage — detailed building with windows
      createDetailedBuilding([x, 3, -20], [18, 6, 12], color1, {
        windowRows: 1, windowCols: 3, windowColor: 0x0f172a
      });
    };

    // West House (Green) & East House (Yellow)
    buildNuketownHouse(-40, 0x166534, 0x15803d, -1);
    buildNuketownHouse(40, 0xca8a04, 0xeab308, 1);

    // School Bus & Delivery Truck
    createCrate([-6, 3.5, -8], [7, 6, 22], 0xef4444, 0.15);
    createCrate([8, 4, 12], [8, 7, 24], 0xf8fafc, -0.1);
    createCrate([8, 3, 26], [7, 5, 6], 0x0284c7, -0.1);

    // Welcome Billboard
    createCrate([0, 12, -42], [24, 8, 1.5], 0xf59e0b);
    createCrate([-10, 4, -42], [1.5, 8, 1.5], 0x334155);
    createCrate([10, 4, -42], [1.5, 8, 1.5], 0x334155);

    // Cars & Sandbags
    createCrate([-22, 1.5, 25], [5, 3, 10], 0x2563eb, 0.2);
    createCrate([22, 1.5, -25], [5, 3, 10], 0xdc2626, -0.2);
    createCrate([0, 1.5, 0], [6, 3, 2], 0xb45309);
    createCrate([-16, 1.5, -30], [8, 3, 2], 0x475569);
    createCrate([16, 1.5, 30], [8, 3, 2], 0x475569);

    // 16+ Nuketown Spawns
    spawnPoints.push(
      new THREE.Vector3(-27, 8, 0),    // Green Balcony
      new THREE.Vector3(27, 8, 0),     // Yellow Balcony
      new THREE.Vector3(-45, 1.5, 35),  // Green Backyard
      new THREE.Vector3(45, 1.5, 35),   // Yellow Backyard
      new THREE.Vector3(-40, 1.5, -22), // Green Garage
      new THREE.Vector3(40, 1.5, -22),  // Yellow Garage
      new THREE.Vector3(-15, 1.5, -35), // Billboard West
      new THREE.Vector3(15, 1.5, -35),  // Billboard East
      new THREE.Vector3(-5, 1.5, 25),   // Cul-de-sac South W
      new THREE.Vector3(5, 1.5, 25),    // Cul-de-sac South E
      new THREE.Vector3(-40, 1.5, 10),  // Green Living Room
      new THREE.Vector3(40, 1.5, 10),   // Yellow Living Room
      new THREE.Vector3(-18, 1.5, -8),  // Bus Flank West
      new THREE.Vector3(18, 1.5, 8),    // Truck Flank East
      new THREE.Vector3(-30, 1.5, -35), // Green Alley North
      new THREE.Vector3(30, 1.5, -35)   // Yellow Alley North
    );

  } else if (mapId === 'shipment') {
    ambientColor = '#94a3b8'; // Dockyard twilight
    directionalColor = '#cbd5e1';
    fogColor = '#0f172a';
    fogDensity = 0.010;

    // Shipment Map Floor (80x80)
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const shipFloorTex = createConcreteTexture(0x334155, 1.0, 20);
    shipFloorTex.repeat.set(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({ map: shipFloorTex, color: 0x334155, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Perimeter Dockyard Concrete Walls
    const wallHeight = 12;
    const wallColor = 0x1e293b;
    createCrate([0, wallHeight / 2, -40], [80, wallHeight, 2], wallColor, 0, 'wall'); // North
    createCrate([0, wallHeight / 2, 40], [80, wallHeight, 2], wallColor, 0, 'wall');  // South
    createCrate([-40, wallHeight / 2, 0], [2, wallHeight, 80], wallColor, 0, 'wall'); // West
    createCrate([40, wallHeight / 2, 0], [2, wallHeight, 80], wallColor, 0, 'wall');  // East

    // --- CENTER CLUSTER (WALK-THROUGH OPEN CONTAINERS) ---
    // North-South Center Tunnel (Blue)
    createOpenContainer([0, 3, 0], [6, 6, 18], 0x2563eb, 0);
    
    // West-East Center Tunnel (Orange)
    createOpenContainer([0, 3, 0], [6, 6, 18], 0xd97706, Math.PI / 2);

    // Stacked Container on top of Center Cross (Red)
    createCrate([0, 9, 0], [6, 6, 16], 0xdc2626, 0.1);

    // --- CORNER & SECTOR CONTAINERS ---
    // North-West Cluster
    createOpenContainer([-20, 3, -20], [6, 6, 16], 0x16a34a, Math.PI / 4); // Green open container
    createCrate([-22, 9, -20], [6, 6, 14], 0x4f46e5, Math.PI / 4 + 0.1);  // Stacked purple container
    createDetailedBuilding([-32, 3, -32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 }); // NW Storage vault

    // North-East Cluster
    createOpenContainer([20, 3, -20], [6, 6, 16], 0x2563eb, -Math.PI / 4); // Blue open container
    createCrate([22, 9, -20], [6, 6, 14], 0xd97706, -Math.PI / 4 - 0.1);  // Stacked orange container
    createDetailedBuilding([32, 3, -32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 });  // NE Storage vault

    // South-West Cluster
    createOpenContainer([-20, 3, 20], [6, 6, 16], 0xd97706, -Math.PI / 4); // Orange open container
    createCrate([-22, 9, 20], [6, 6, 14], 0x16a34a, -Math.PI / 4 + 0.1);   // Stacked green container
    createDetailedBuilding([-32, 3, 32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 });  // SW Storage vault

    // South-East Cluster
    createOpenContainer([20, 3, 20], [6, 6, 16], 0xdc2626, Math.PI / 4);  // Red open container
    createCrate([22, 9, 20], [6, 6, 14], 0x2563eb, Math.PI / 4 - 0.1);    // Stacked blue container
    createDetailedBuilding([32, 3, 32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 });   // SE Storage vault

    // --- COVER & OBSTACLES (Forklifts, Wooden Crates, Sandbag Bunkers, Barrels) ---
    // Wooden Crate stacks
    createCrate([-12, 1.5, 12], [3, 3, 3], 0x78350f);
    createCrate([-12, 4.5, 12], [2.5, 2.5, 2.5], 0xb45309);
    createCrate([12, 1.5, -12], [3, 3, 3], 0x78350f);
    createCrate([12, 4.5, -12], [2.5, 2.5, 2.5], 0xb45309);

    // Sandbag barricades
    createCrate([0, 1.2, -26], [10, 2.4, 2], 0xb45309);
    createCrate([0, 1.2, 26], [10, 2.4, 2], 0xb45309);
    createCrate([-26, 1.2, 0], [2, 2.4, 10], 0xb45309);
    createCrate([26, 1.2, 0], [2, 2.4, 10], 0xb45309);

    // Forklift mock obstacles
    createCrate([-14, 2, -5], [4, 4, 6], 0xf59e0b, 0.2);
    createCrate([14, 2, 5], [4, 4, 6], 0xf59e0b, -0.2);

    // 18 Safe Spawn Points across Shipment
    spawnPoints.push(
      new THREE.Vector3(-28, 1.5, -28), // NW Corner
      new THREE.Vector3(28, 1.5, -28),  // NE Corner
      new THREE.Vector3(-28, 1.5, 28),   // SW Corner
      new THREE.Vector3(28, 1.5, 28),    // SE Corner
      new THREE.Vector3(0, 1.5, -32),    // North Alley
      new THREE.Vector3(0, 1.5, 32),     // South Alley
      new THREE.Vector3(-32, 1.5, 0),    // West Alley
      new THREE.Vector3(32, 1.5, 0),     // East Alley
      new THREE.Vector3(0, 1.5, -8),     // Inside North Container
      new THREE.Vector3(0, 1.5, 8),      // Inside South Container
      new THREE.Vector3(-8, 1.5, 0),     // Inside West Container
      new THREE.Vector3(8, 1.5, 0),      // Inside East Container
      new THREE.Vector3(-18, 1.5, -10),  // NW Flank
      new THREE.Vector3(18, 1.5, -10),   // NE Flank
      new THREE.Vector3(-18, 1.5, 10),   // SW Flank
      new THREE.Vector3(18, 1.5, 10),    // SE Flank
      new THREE.Vector3(-10, 1.5, -28),  // North West Corner Flank
      new THREE.Vector3(10, 1.5, 28)     // South East Corner Flank
    );

  } else if (mapId === 'rust') {
    ambientColor = '#fbbf24'; // Sandy Desert sun
    directionalColor = '#fff7ed';
    fogColor = '#854d0e'; // Dusty desert haze
    fogDensity = 0.012;

    // Rust Desert Floor (110x110)
    const floorGeo = new THREE.PlaneGeometry(110, 110);
    const rustFloorTex = createRustTexture(0xc2410c);
    rustFloorTex.repeat.set(28, 28);
    const floorMat = new THREE.MeshStandardMaterial({ map: rustFloorTex, color: 0xc2410c, roughness: 0.95 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Perimeter Scrapyard Walls & Dunes
    const limit = 55;
    createCrate([0, 8, -limit], [110, 16, 2], 0x7c2d12, 0, 'wall'); // N
    createCrate([0, 8, limit], [110, 16, 2], 0x7c2d12, 0, 'wall');  // S
    createCrate([-limit, 8, 0], [2, 16, 110], 0x7c2d12, 0, 'wall');  // W
    createCrate([limit, 8, 0], [2, 16, 110], 0x7c2d12, 0, 'wall');   // E

    // --- CENTRAL RUST MULTI-TIER TOWER ---
    // Tier 1 Base Frame
    createCrate([0, 4, 0], [18, 8, 18], 0x451a03);
    // Tier 2 Mid Cabin (Sniper platform level)
    createCrate([0, 12, 0], [12, 8, 12], 0x78350f);
    // Tier 3 Lookout Perch / Crane Top
    createCrate([0, 18, 0], [6, 4, 6], 0x1e293b);

    // Tower Access Ramps (4 angled climbable ramps)
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.9, flatShading: true });
    
    // South Ramp to Tier 1
    const rampGeo1 = new THREE.BoxGeometry(5, 1, 16);
    const ramp1 = new THREE.Mesh(rampGeo1, rampMat);
    ramp1.position.set(0, 3.2, 13);
    ramp1.rotation.x = -0.28;
    ramp1.receiveShadow = true;
    ramp1.castShadow = true;
    scene.add(ramp1);
    colliders.push({ box: new THREE.Box3().setFromObject(ramp1), mesh: ramp1, type: 'ramp' });

    // West Ramp to Tier 1
    const rampGeo2 = new THREE.BoxGeometry(16, 1, 5);
    const ramp2 = new THREE.Mesh(rampGeo2, rampMat);
    ramp2.position.set(-13, 3.2, 0);
    ramp2.rotation.z = 0.28;
    ramp2.receiveShadow = true;
    ramp2.castShadow = true;
    scene.add(ramp2);
    colliders.push({ box: new THREE.Box3().setFromObject(ramp2), mesh: ramp2, type: 'ramp' });

    // North Ramp to Tier 2 (Upper catwalk)
    const rampGeo3 = new THREE.BoxGeometry(5, 1, 14);
    const ramp3 = new THREE.Mesh(rampGeo3, rampMat);
    ramp3.position.set(0, 10.2, -10);
    ramp3.rotation.x = 0.32;
    ramp3.receiveShadow = true;
    ramp3.castShadow = true;
    scene.add(ramp3);
    colliders.push({ box: new THREE.Box3().setFromObject(ramp3), mesh: ramp3, type: 'ramp' });

    // --- INDUSTRIAL SURROUNDINGS (Fuel Tanks, Pipelines, Sandbag Trenches, Generator Blocks) ---
    // NW Fuel Silo
    const siloGeo = new THREE.CylinderGeometry(5, 5, 16, 12);
    const siloMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.6, roughness: 0.4 });
    const silo = new THREE.Mesh(siloGeo, siloMat);
    silo.position.set(-28, 8, -28);
    silo.castShadow = true;
    silo.receiveShadow = true;
    scene.add(silo);
    silo.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(silo), mesh: silo as any, type: 'crate' });

    // NE Oil Tank
    const tankGeo = new THREE.CylinderGeometry(6, 6, 12, 12);
    const tank = new THREE.Mesh(tankGeo, siloMat);
    tank.position.set(28, 6, -28);
    tank.castShadow = true;
    tank.receiveShadow = true;
    scene.add(tank);
    tank.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(tank), mesh: tank as any, type: 'crate' });

    // Horizontal Oil Pipelines
    const pipeGeo = new THREE.CylinderGeometry(2, 2, 18, 8);
    const pipe1 = new THREE.Mesh(pipeGeo, siloMat);
    pipe1.position.set(25, 2, 0);
    pipe1.rotation.z = Math.PI / 2;
    pipe1.castShadow = true;
    scene.add(pipe1);
    pipe1.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(pipe1), mesh: pipe1 as any, type: 'crate' });

    const pipe2 = new THREE.Mesh(pipeGeo, siloMat);
    pipe2.position.set(-25, 2, 18);
    pipe2.rotation.x = Math.PI / 2;
    pipe2.castShadow = true;
    scene.add(pipe2);
    pipe2.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(pipe2), mesh: pipe2 as any, type: 'crate' });

    // Sandbag Trench Bunkers
    createCrate([-20, 1.5, -15], [10, 3, 2], 0xb45309);
    createCrate([20, 1.5, 15], [10, 3, 2], 0xb45309);
    createCrate([15, 1.5, -20], [2, 3, 10], 0xb45309);
    createCrate([-15, 1.5, 20], [2, 3, 10], 0xb45309);

    // Industrial Cargo Container Cover
    createCrate([-32, 3, 28], [14, 6, 6], 0x78350f, Math.PI / 6);
    createCrate([32, 3, -28], [14, 6, 6], 0xb45309, -Math.PI / 6);

    // 18 Safe Spawn Points across Rust
    spawnPoints.push(
      new THREE.Vector3(-40, 1.5, -40), // NW Outer Spawn
      new THREE.Vector3(40, 1.5, -40),  // NE Outer Spawn
      new THREE.Vector3(-40, 1.5, 40),   // SW Outer Spawn
      new THREE.Vector3(40, 1.5, 40),    // SE Outer Spawn
      new THREE.Vector3(0, 1.5, -42),    // North Trench Spawn
      new THREE.Vector3(0, 1.5, 42),     // South Trench Spawn
      new THREE.Vector3(-42, 1.5, 0),    // West Pipe Spawn
      new THREE.Vector3(42, 1.5, 0),     // East Pipe Spawn
      new THREE.Vector3(-22, 1.5, -22),  // NW Silo Flank
      new THREE.Vector3(22, 1.5, -22),   // NE Tank Flank
      new THREE.Vector3(-22, 1.5, 22),   // SW Container Flank
      new THREE.Vector3(22, 1.5, 22),    // SE Container Flank
      new THREE.Vector3(0, 8.5, 6),      // Central Tower Tier 1 South
      new THREE.Vector3(-6, 8.5, 0),     // Central Tower Tier 1 West
      new THREE.Vector3(0, 16.5, 0),     // Tower Tier 2 Lookout
      new THREE.Vector3(-12, 1.5, -12),  // Mid NW Cover
      new THREE.Vector3(12, 1.5, 12),    // Mid SE Cover
      new THREE.Vector3(-30, 1.5, 0)     // West Dune Spawn
    );

  } else if (mapId === 'teams_combo') {
    ambientColor = '#c4b5fd'; // Violet dusk
    directionalColor = '#e2e8f0';
    fogColor = '#1e1b4b'; // Deep indigo fog
    fogDensity = 0.005;

    const FLOOR_W = 260;
    const FLOOR_D = 220;

    // === MASSIVE COMBINED FLOOR ===
    // Nuketown zone (left half, z = -40..60)
    const nukeFloor = new THREE.PlaneGeometry(140, 120);
    const nukeRoadTex = createConcreteTexture(0x334155, 1.0, 18);
    nukeRoadTex.repeat.set(18, 15);
    const nukeFloorMat = new THREE.MeshStandardMaterial({ map: nukeRoadTex, color: 0x334155, roughness: 0.85 });
    const nukeFloorMesh = new THREE.Mesh(nukeFloor, nukeFloorMat);
    nukeFloorMesh.rotation.x = -Math.PI / 2;
    nukeFloorMesh.position.set(-55, 0, 10);
    nukeFloorMesh.receiveShadow = true;
    scene.add(nukeFloorMesh);

    // Nuketown grass yards
    const grassGeo = new THREE.PlaneGeometry(40, 100);
    const grassTex = createGrassTexture(0x15803d);
    grassTex.repeat.set(8, 16);
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, color: 0x15803d, roughness: 0.9 });
    const yardW = new THREE.Mesh(grassGeo, grassMat);
    yardW.position.set(-95, 0.05, 10);
    yardW.rotation.x = -Math.PI / 2;
    yardW.receiveShadow = true;
    scene.add(yardW);
    const yardE = new THREE.Mesh(grassGeo, grassMat);
    yardE.position.set(-15, 0.05, 10);
    yardE.rotation.x = -Math.PI / 2;
    yardE.receiveShadow = true;
    scene.add(yardE);

    // Shipment zone (right half, z = -40..40)
    const shipFloorGeo = new THREE.PlaneGeometry(90, 90);
    const shipFloorTex = createConcreteTexture(0x1e293b, 1.0, 20);
    shipFloorTex.repeat.set(22, 22);
    const shipFloorMat = new THREE.MeshStandardMaterial({ map: shipFloorTex, color: 0x1e293b, roughness: 0.9 });
    const shipFloorMesh = new THREE.Mesh(shipFloorGeo, shipFloorMat);
    shipFloorMesh.rotation.x = -Math.PI / 2;
    shipFloorMesh.position.set(65, 0, 0);
    shipFloorMesh.receiveShadow = true;
    scene.add(shipFloorMesh);

    // Central connecting plaza (between the two zones)
    const plazaGeo = new THREE.PlaneGeometry(50, 50);
    const plazaTex = createSandTexture(0x78716c);
    plazaTex.repeat.set(12, 12);
    const plazaMat = new THREE.MeshStandardMaterial({ map: plazaTex, color: 0x78716c, roughness: 0.85 });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.rotation.x = -Math.PI / 2;
    plazaMesh.position.set(10, 0.03, 10);
    plazaMesh.receiveShadow = true;
    scene.add(plazaMesh);

    // === PERIMETER WALLS ===
    const wallH = 12;
    createCrate([0, wallH / 2, -115], [FLOOR_W, wallH, 2], 0x1e1b4b, 0, 'wall'); // N
    createCrate([0, wallH / 2, 105], [FLOOR_W, wallH, 2], 0x1e1b4b, 0, 'wall');  // S
    createCrate([-128, wallH / 2, 0], [2, wallH, FLOOR_D], 0x1e1b4b, 0, 'wall'); // W
    createCrate([128, wallH / 2, 0], [2, wallH, FLOOR_D], 0x1e1b4b, 0, 'wall');  // E

    // === NUKETOWN ZONE (left half) ===
    // Green House (mirrored from original)
    const buildComboHouse = (x: number, z: number, color1: number, color2: number, sign: number) => {
      const w = 22, h = 8, d = 28, t = 1.5;
      createCrate([x + sign * (w/2), h/2, z], [t, h, d], color1);
      createCrate([x - sign * (w/2), h/2, z + 9], [t, h, 10], color1);
      createCrate([x - sign * (w/2), h/2, z - 10], [t, h, 8], color1);
      createCrate([x - sign * (w/2), h - 1.5, z], [t, 3, d], color1);
      createCrate([x, h/2, z + d/2], [w, h, t], color1);
      createCrate([x, h/2, z - d/2], [w, h, t], color1);
      // 2nd floor
      createCrate([x, h + 0.5, z + 9], [w, 1, 10], color2);
      createCrate([x, h + 0.5, z - 9], [w, 1, 10], color2);
      // Roof
      createCrate([x, h + 7.5, z], [w + 2, 1, d + 2], 0x334155);
      // Stairs
      const numSteps = 16;
      const stepHeight = (h + 1) / numSteps;
      const stepDepth = 10 / numSteps;
      for (let i = 0; i < numSteps; i++) {
        const stepX = (x + sign * 5) - (sign * (i * stepDepth));
        const stepY = i * stepHeight + (stepHeight / 2);
        createCrate([stepX, stepY, z], [stepDepth, stepHeight, 8], 0x475569);
      }
      // Garage
      createDetailedBuilding([x, 3, z - 20], [18, 6, 12], color1, {
        windowRows: 1, windowCols: 3, windowColor: 0x0f172a
      });
    };

    // Position args: x, z, color1, color2, sign (which side door is on)
    buildComboHouse(-75, 10, 0x166534, 0x15803d, -1);
    buildComboHouse(-35, 10, 0xca8a04, 0xeab308, 1);

    // Vehicles
    createCrate([-61, 3.5, 2], [7, 6, 22], 0xef4444, 0.15);
    createCrate([-47, 4, 22], [8, 7, 24], 0xf8fafc, -0.1);
    createCrate([-47, 3, 36], [7, 5, 6], 0x0284c7, -0.1);

    // Billboard
    createCrate([-55, 12, -32], [24, 8, 1.5], 0xf59e0b);
    createCrate([-65, 4, -32], [1.5, 8, 1.5], 0x334155);
    createCrate([-45, 4, -32], [1.5, 8, 1.5], 0x334155);

    // Cars & Sandbags
    createCrate([-77, 1.5, 35], [5, 3, 10], 0x2563eb, 0.2);
    createCrate([-33, 1.5, -15], [5, 3, 10], 0xdc2626, -0.2);
    createCrate([-55, 1.5, 10], [6, 3, 2], 0xb45309);

    // === SHIPMENT ZONE (right half) ===
    // Center cross containers
    createOpenContainer([65, 3, 0], [6, 6, 18], 0x2563eb, 0);
    createOpenContainer([65, 3, 0], [6, 6, 18], 0xd97706, Math.PI / 2);
    createCrate([65, 9, 0], [6, 6, 16], 0xdc2626, 0.1);

    // Corner clusters
    createOpenContainer([45, 3, -20], [6, 6, 16], 0x16a34a, Math.PI / 4);
    createCrate([43, 9, -20], [6, 6, 14], 0x4f46e5, Math.PI / 4 + 0.1);
    createDetailedBuilding([33, 3, -32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 });

    createOpenContainer([85, 3, -20], [6, 6, 16], 0x2563eb, -Math.PI / 4);
    createCrate([87, 9, -20], [6, 6, 14], 0xd97706, -Math.PI / 4 - 0.1);
    createDetailedBuilding([97, 3, -32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 });

    createOpenContainer([45, 3, 20], [6, 6, 16], 0xd97706, -Math.PI / 4);
    createCrate([43, 9, 20], [6, 6, 14], 0x16a34a, -Math.PI / 4 + 0.1);
    createDetailedBuilding([33, 3, 32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 });

    createOpenContainer([85, 3, 20], [6, 6, 16], 0xdc2626, Math.PI / 4);
    createCrate([87, 9, 20], [6, 6, 14], 0x2563eb, Math.PI / 4 - 0.1);
    createDetailedBuilding([97, 3, 32], [10, 6, 10], 0x475569, { windowRows: 1, windowCols: 2 });

    // Cover crates & sandbags
    createCrate([53, 1.5, 12], [3, 3, 3], 0x78350f);
    createCrate([53, 4.5, 12], [2.5, 2.5, 2.5], 0xb45309);
    createCrate([77, 1.5, -12], [3, 3, 3], 0x78350f);
    createCrate([77, 4.5, -12], [2.5, 2.5, 2.5], 0xb45309);
    createCrate([65, 1.2, -26], [10, 2.4, 2], 0xb45309);
    createCrate([65, 1.2, 26], [10, 2.4, 2], 0xb45309);
    createCrate([39, 1.2, 0], [2, 2.4, 10], 0xb45309);
    createCrate([91, 1.2, 0], [2, 2.4, 10], 0xb45309);
    createCrate([51, 2, -5], [4, 4, 6], 0xf59e0b, 0.2);
    createCrate([79, 2, 5], [4, 4, 6], 0xf59e0b, -0.2);

    // === CENTRAL CONNECTING PLAZA (unique buildings) ===
    // Central Command Building (large 2-story HQ)
    const hqX = 10, hqZ = 10;
    createCrate([hqX - 10, 5, hqZ], [2, 10, 24], 0x475569);
    createCrate([hqX + 10, 5, hqZ], [2, 10, 24], 0x475569);
    createCrate([hqX, 5, hqZ - 12], [22, 10, 2], 0x475569);
    createCrate([hqX, 5, hqZ + 12], [22, 10, 2], 0x475569);
    createCrate([hqX, 10.5, hqZ], [22, 1, 24], 0x6366f1);
    // HQ entrance gap (south wall)
    createCrate([hqX - 6, 5, hqZ + 12], [10, 10, 2], 0x475569);
    createCrate([hqX + 6, 5, hqZ + 12], [10, 10, 2], 0x475569);

    // Two Watchtowers flanking the plaza
    const buildWatchtower = (wx: number, wz: number) => {
    createCrate([wx, 4, wz], [4, 8, 4], 0x475569);
    createCrate([wx, 8.5, wz], [6, 1, 6], 0x854d0e);
    // Ladder ramp
    for (let i = 0; i < 8; i++) {
      createCrate([wx + 2.5, i + 0.5, wz], [0.5, 1, 3], 0x78350f);
    }
    // Railing
    createCrate([wx - 3.2, 9.5, wz], [0.3, 1.5, 6], 0x451a03);
    createCrate([wx + 3.2, 9.5, wz], [0.3, 1.5, 6], 0x451a03);
    createCrate([wx, 9.5, wz - 3.2], [6, 1.5, 0.3], 0x451a03);
    createCrate([wx, 9.5, wz + 3.2], [6, 1.5, 0.3], 0x451a03);
    };
    buildWatchtower(-20, -25);
    buildWatchtower(40, -25);

    // === UNDERGROUND TUNNEL SYSTEM (covered trenches) ===
    // North-South trench
    createCrate([10, -1, -50], [8, 3, 60], 0x374151);
    createCrate([10, 1.5, -50], [10, 1, 60], 0x374151);
    // East-West trench
    createCrate([-30, -1, -50], [60, 3, 8], 0x374151);
    createCrate([-30, 1.5, -50], [60, 1, 10], 0x374151);

    // === ADDITIONAL UNIQUE BUILDINGS ===
    // Radio Tower (tall, at north)
    createCrate([10, 6, -80], [3, 12, 3], 0x7c2d12);
    createCrate([10, 13, -80], [8, 1, 8], 0x475569);
    // Guy wires (diagonal beams)
    createCrate([10, 10, -75], [1, 1, 10], 0x78350f, 0.3);
    createCrate([10, 10, -85], [1, 1, 10], 0x78350f, -0.3);

    // Bunker complex (south area) — detailed buildings
    createDetailedBuilding([-30, 2.5, 70], [16, 5, 12], 0x451a03, { windowRows: 1, windowCols: 3, windowColor: 0x1e293b });
    createDetailedBuilding([30, 2.5, 70], [16, 5, 12], 0x451a03, { windowRows: 1, windowCols: 3, windowColor: 0x1e293b });
    // Bunker connecting wall
    createCrate([0, 2.5, 70], [16, 5, 2], 0x451a03);

    // Guard towers at south corners
    createCrate([-80, 5, 80], [6, 10, 6], 0x475569);
    createCrate([80, 5, 80], [6, 10, 6], 0x475569);

    // Oil Pipeline (connects zones)
    const pipeMat2 = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.6, roughness: 0.4 });
    const pipeGeo2 = new THREE.CylinderGeometry(2, 2, 60, 8);
    const pipeMain = new THREE.Mesh(pipeGeo2, pipeMat2);
    pipeMain.position.set(-10, 2, -60);
    pipeMain.rotation.z = Math.PI / 2;
    pipeMain.castShadow = true;
    scene.add(pipeMain);
    pipeMain.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(pipeMain), mesh: pipeMain as any, type: 'crate' });

    // Fuel Silo near Shipment
    const siloGeo2 = new THREE.CylinderGeometry(5, 5, 16, 12);
    const silo2 = new THREE.Mesh(siloGeo2, pipeMat2);
    silo2.position.set(110, 8, -40);
    silo2.castShadow = true;
    silo2.receiveShadow = true;
    scene.add(silo2);
    silo2.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(silo2), mesh: silo2 as any, type: 'crate' });

    // Supply depot (west side) — detailed buildings
    createDetailedBuilding([-110, 2.5, 40], [14, 5, 10], 0x78350f, { windowRows: 1, windowCols: 3, windowColor: 0x1e293b });
    createDetailedBuilding([-110, 2.5, 55], [10, 5, 10], 0x78350f, { windowRows: 1, windowCols: 2, windowColor: 0x1e293b });

    // Scattered cover between zones
    createCrate([-20, 1.5, 40], [4, 3, 4], 0xb45309);
    createCrate([-10, 1.5, 45], [4, 3, 4], 0xb45309);
    createCrate([20, 1.5, 35], [6, 3, 2], 0x475569);
    createCrate([30, 1.5, -40], [6, 3, 2], 0x475569);
    createCrate([40, 1.5, 45], [3, 3, 3], 0x78350f);
    createCrate([-25, 1.5, -40], [3, 3, 3], 0x78350f);

    // 30+ Spawn Points across the massive map
    spawnPoints.push(
      // Nuketown zone spawns
      new THREE.Vector3(-62, 8, 10),    // Green Balcony
      new THREE.Vector3(-22, 8, 10),    // Yellow Balcony
      new THREE.Vector3(-80, 1.5, 45),   // Green Backyard
      new THREE.Vector3(-30, 1.5, 45),   // Yellow Backyard
      new THREE.Vector3(-75, 1.5, -12),  // Green Garage
      new THREE.Vector3(-35, 1.5, -12),  // Yellow Garage
      new THREE.Vector3(-50, 1.5, -25),  // Billboard West
      new THREE.Vector3(-60, 1.5, 30),   // Bus Flank
      new THREE.Vector3(-40, 1.5, 25),   // Truck Flank

      // Shipment zone spawns
      new THREE.Vector3(37, 1.5, -28),    // NW Corner
      new THREE.Vector3(93, 1.5, -28),    // NE Corner
      new THREE.Vector3(37, 1.5, 28),     // SW Corner
      new THREE.Vector3(93, 1.5, 28),     // SE Corner
      new THREE.Vector3(65, 1.5, -32),    // North Alley
      new THREE.Vector3(65, 1.5, 32),     // South Alley
      new THREE.Vector3(33, 1.5, 0),      // West Alley
      new THREE.Vector3(97, 1.5, 0),      // East Alley
      new THREE.Vector3(65, 1.5, -8),     // Inside N Container
      new THREE.Vector3(65, 1.5, 8),      // Inside S Container

      // Central plaza spawns
      new THREE.Vector3(10, 1.5, 0),      // HQ entrance
      new THREE.Vector3(10, 1.5, 25),     // HQ south
      new THREE.Vector3(-20, 9, -25),    // West Watchtower
      new THREE.Vector3(40, 9, -25),     // East Watchtower
      new THREE.Vector3(-5, 1.5, 10),     // Plaza west
      new THREE.Vector3(25, 1.5, 10),     // Plaza east

      // Unique building spawns
      new THREE.Vector3(10, 13, -80),     // Radio tower top
      new THREE.Vector3(10, 1.5, -65),    // Radio tower base
      new THREE.Vector3(-30, 3, 70),     // West bunker
      new THREE.Vector3(30, 3, 70),      // East bunker
      new THREE.Vector3(-80, 6, 80),     // SW guard tower
      new THREE.Vector3(80, 6, 80),      // SE guard tower
      new THREE.Vector3(-110, 3.5, 40),   // Supply depot
      new THREE.Vector3(110, 1.5, -40),   // Silo area
      new THREE.Vector3(10, 1.5, -50),    // Trench intersection
      new THREE.Vector3(-30, 1.5, -50),   // West trench
      new THREE.Vector3(-25, 1.5, -80)    // North flank
    );

  } else if (mapId === 'dust2') {
    // DUST2 (Desert Compound)
    ambientColor = '#fed7aa'; // Bright desert sunlight
    directionalColor = '#fffbeb';
    fogColor = '#ea580c';
    fogDensity = 0.007;

    // Dust2 Floor (130x130)
    const floorGeo = new THREE.PlaneGeometry(130, 130);
    const sandFloorTex = createSandTexture(0xca8a04);
    sandFloorTex.repeat.set(32, 32);
    const floorMat = new THREE.MeshStandardMaterial({ map: sandFloorTex, color: 0xca8a04, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Perimeter Compound Walls
    const limit = 65;
    const wallColor = 0xa16207;
    createCrate([0, 10, -limit], [130, 20, 2], wallColor, 0, 'wall'); // North Wall
    createCrate([0, 10, limit], [130, 20, 2], wallColor, 0, 'wall');  // South Wall
    createCrate([-limit, 10, 0], [2, 20, 130], wallColor, 0, 'wall'); // West Wall
    createCrate([limit, 10, 0], [2, 20, 130], wallColor, 0, 'wall');  // East Wall

    // --- A SITE (North-East Zone) ---
    // A Site Bomb Platform
    createCrate([35, 2, -35], [20, 4, 20], 0x854d0e);
    // Triple Stack Wooden Crates on A Platform
    createCrate([32, 5, -38], [4, 4, 4], 0xb45309);
    createCrate([36, 5, -38], [4, 4, 4], 0xb45309);
    createCrate([34, 8, -38], [3.5, 3.5, 3.5], 0x78350f);
    // Goose Corner Wall
    createCrate([48, 5, -48], [8, 10, 8], 0x713f12);
    // Long A Ramp Wall
    createCrate([48, 4, -15], [4, 8, 30], 0x713f12);

    // --- B SITE (North-West Zone) ---
    // B Site Platform
    createCrate([-35, 2, -35], [20, 4, 20], 0x854d0e);
    // B Bomb Site Crates
    createCrate([-35, 5, -35], [5, 4, 5], 0xb45309);
    createCrate([-38, 5, -32], [4, 4, 4], 0x78350f);
    // B Doors Wall
    createCrate([-25, 5, -20], [4, 10, 16], 0x713f12);
    // B Window Platform Wall
    createCrate([-48, 6, -20], [8, 12, 10], 0x713f12);

    // --- MID & CATWALK / SHORT A ---
    // Mid Doors Split Wall
    createCrate([0, 5, -15], [16, 10, 4], 0x713f12);
    // Xbox Crate at Mid
    createCrate([-4, 2, 5], [5, 4, 5], 0xb45309);
    // Catwalk / Short A Ledge
    createCrate([18, 3, -15], [16, 6, 6], 0x854d0e);

    // --- TUNNELS (South-West Upper & Lower Tunnels) ---
    // Upper Tunnel Enclosure — detailed building
    createDetailedBuilding([-38, 5, 20], [16, 10, 30], 0x713f12, { windowRows: 2, windowCols: 3, windowColor: 0x1e293b });
    // Lower Tunnel Exit Wall
    createCrate([-20, 4, 15], [12, 8, 4], 0x713f12);

    // --- T SPAWN & CT SPAWN ---
    // T Spawn Back Wall — detailed building
    createDetailedBuilding([0, 4, 48], [40, 8, 12], 0x854d0e, { windowRows: 2, windowCols: 5, windowColor: 0x1e293b });
    // CT Spawn Ramp & Barrier (North)
    createCrate([0, 3, -48], [36, 6, 10], 0x854d0e);

    // --- DECORATIVE COVER & MARKET STALLS ---
    // Market Stall Canopies
    createCrate([20, 1.5, 20], [8, 3, 8], 0xd97706);
    createCrate([-18, 1.5, -5], [6, 3, 6], 0x2563eb);
    // Sandbag positions
    createCrate([10, 1.2, 35], [8, 2.4, 2], 0xb45309);
    createCrate([-10, 1.2, -35], [8, 2.4, 2], 0xb45309);

    // 20 Safe Spawn Points across Dust2
    spawnPoints.push(
      new THREE.Vector3(0, 1.5, 40),     // T Spawn Center
      new THREE.Vector3(-15, 1.5, 40),   // T Spawn West
      new THREE.Vector3(15, 1.5, 40),    // T Spawn East
      new THREE.Vector3(0, 1.5, -40),    // CT Spawn Center
      new THREE.Vector3(-15, 1.5, -40),  // CT Spawn B-side
      new THREE.Vector3(15, 1.5, -40),   // CT Spawn A-side
      new THREE.Vector3(35, 4.5, -30),   // A Site Platform
      new THREE.Vector3(45, 1.5, -25),   // Long A Corner
      new THREE.Vector3(45, 1.5, 10),    // Long A Doors
      new THREE.Vector3(20, 3.5, -25),   // Short A / Catwalk
      new THREE.Vector3(-35, 4.5, -30),  // B Site Platform
      new THREE.Vector3(-45, 1.5, -10),  // B Window
      new THREE.Vector3(-35, 1.5, 10),   // Upper Tunnels
      new THREE.Vector3(-18, 1.5, 5),    // Lower Tunnels
      new THREE.Vector3(0, 1.5, 0),      // Mid Doors Crossroads
      new THREE.Vector3(-10, 1.5, 20),   // Mid Suicide Alley
      new THREE.Vector3(20, 1.5, 20),    // Market Plaza East
      new THREE.Vector3(-25, 1.5, -35),  // B Doors Flank
      new THREE.Vector3(30, 1.5, -45),   // A Long Ramp
      new THREE.Vector3(-40, 1.5, 35)    // Tunnels Entrance South
    );
  } else if (mapId === 'tutorial') {
    ambientColor = '#e0e7ff';
    directionalColor = '#ffffff';
    fogColor = '#1e293b';
    fogDensity = 0.015;

    const roomW = 20, roomD = 20, wallH = 4, wallT = 0.5;
    const floorY = 0;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9, flatShading: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(floorGeo.clone(), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95, flatShading: true }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = wallH;
    scene.add(ceil);

    // North wall (z = -roomD/2)
    createCrate([0, wallH / 2, -roomD / 2], [roomW, wallH, wallT], 0x64748b, 0, 'wall');
    // South wall (z = +roomD/2)
    createCrate([0, wallH / 2, roomD / 2], [roomW, wallH, wallT], 0x64748b, 0, 'wall');
    // West wall (x = -roomW/2)
    createCrate([-roomW / 2, wallH / 2, 0], [wallT, wallH, roomD], 0x64748b, 0, 'wall');
    // East wall (x = +roomW/2)
    createCrate([roomW / 2, wallH / 2, 0], [wallT, wallH, roomD], 0x64748b, 0, 'wall');

    // Some interior crates for cover
    createCrate([-4, 0.75, -3], [1.5, 1.5, 1.5], 0x78716c, 0, 'crate');
    createCrate([3, 0.75, 2], [1.5, 1.5, 1.5], 0x78716c, 0, 'crate');
    createCrate([0, 0.5, -6], [3, 1, 1], 0x78716c, 0, 'crate');
    createCrate([-6, 0.75, 5], [1, 1.5, 2], 0x78716c, Math.PI / 6, 'crate');

    // Simple overhead light
    const light = new THREE.PointLight(0xffffff, 1.5, 30);
    light.position.set(0, wallH - 0.5, 0);
    light.castShadow = true;
    scene.add(light);

    spawnPoints.push(
      new THREE.Vector3(0, 1.5, 0)
    );
  } else if (mapId === 'campaign2') {
    // CAMPAIGN MISSION 2: "Behind Enemy Lines"
    // Layout: Forest (z: -80 to -10) -> Gate (z: -10) -> Military Base (z: -8 to 120)
    // Player starts at z=60 (south end of base), truck at z=45
    // Forest patrol enemies in z: -80 to -15
    // Gate privates at z=-10, truck hidden behind building at z=100

    ambientColor = '#4a6741';
    directionalColor = '#ffe4b5';
    fogColor = '#1a2e1a';
    fogDensity = 0.006;

    // === GROUND PLANE ===
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.95, flatShading: true });
    const ground = new THREE.Mesh(groundGeo, grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 20);
    ground.receiveShadow = true;
    scene.add(ground);

    // === FOREST SECTION (z: -80 to -15) ===
    // Trees
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, flatShading: true });
    const foliageGeo = new THREE.ConeGeometry(1.5, 3, 6);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1a4d1a, roughness: 0.85, flatShading: true });

    const treePositions: [number, number, number][] = [
      [-12,0,-25], [8,0,-30], [-5,0,-40], [15,0,-35], [-18,0,-45],
      [3,0,-50], [-10,0,-55], [12,0,-60], [-7,0,-65], [18,0,-70],
      [-15,0,-75], [5,0,-80], [20,0,-50], [-20,0,-35], [0,0,-45],
      [-8,0,-28], [10,0,-42], [-14,0,-58], [6,0,-72], [-3,0,-33],
      [22,0,-65], [-22,0,-50], [16,0,-28], [-6,0,-70],
      // Right side trees
      [25,0,-25], [28,0,-40], [22,0,-55], [30,0,-70], [26,0,-80],
      // Left side trees
      [-25,0,-30], [-28,0,-45], [-24,0,-60], [-30,0,-75], [-26,0,-20],
    ];

    for (const [tx, ty, tz] of treePositions) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 2, tz);
      trunk.castShadow = true;
      scene.add(trunk);
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.set(tx, 5, tz);
      foliage.castShadow = true;
      scene.add(foliage);
    }

    // Forest floor bushes (small non-collidable decoration)
    const bushGeo = new THREE.SphereGeometry(0.6, 5, 4);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x2e6b2e, roughness: 0.9, flatShading: true });
    const bushPositions: [number, number, number][] = [
      [-3,0.3,-27], [7,0.3,-38], [-9,0.3,-48], [11,0.3,-57], [-4,0.3,-67],
      [14,0.3,-32], [-16,0.3,-52], [2,0.3,-62], [-11,0.3,-73], [8,0.3,-78],
    ];
    for (const [bx, by, bz] of bushPositions) {
      const bush = new THREE.Mesh(bushGeo, bushMat);
      bush.position.set(bx, by, bz);
      scene.add(bush);
    }

    // === GATE AREA (z: -15 to -8) ===
    // Gate posts
    createCrate([-6, 2, -12], [0.5, 4, 0.5], 0x555555, 0, 'crate');
    createCrate([6, 2, -12], [0.5, 4, 0.5], 0x555555, 0, 'crate');
    // Gate crossbar
    createCrate([0, 3.8, -12], [12.5, 0.4, 0.4], 0x444444, 0, 'crate');
    // Side walls near gate
    createCrate([-10, 1.5, -12], [8, 3, 0.5], 0x4a4a4a, 0, 'wall');
    createCrate([10, 1.5, -12], [8, 3, 0.5], 0x4a4a4a, 0, 'wall');

    // === EXPANDED MILITARY BASE (z: -8 to 120, x: -50 to 50) ===
    const BASE_W = 100; // total width (-50 to 50)
    const BASE_D = 128; // total depth (-8 to 120)
    const BASE_HW = BASE_W / 2; // 50

    // Base perimeter walls — south wall with GAP for gate (x: -5 to 5)
    createCrate([-(BASE_HW + 5) / 2, 2, -8], [(BASE_HW - 5), 4, 0.5], 0x5c5c5c, 0, 'wall'); // Left segment: x=-50 to x=-5
    createCrate([(BASE_HW + 5) / 2, 2, -8], [(BASE_HW - 5), 4, 0.5], 0x5c5c5c, 0, 'wall');  // Right segment: x=5 to x=50
    // West wall
    createCrate([-BASE_HW, 2, 56], [0.5, 4, BASE_D], 0x5c5c5c, 0, 'wall');
    // East wall
    createCrate([BASE_HW, 2, 56], [0.5, 4, BASE_D], 0x5c5c5c, 0, 'wall');
    // North wall
    createCrate([0, 2, 120], [BASE_W + 0.5, 4, 0.5], 0x5c5c5c, 0, 'wall');

    // === INNER STRUCTURES ===
    // Entry courtyard area (z: -5 to 15) — open with a few low cover crates
    createCrate([-8, 0.5, 5], [1.5, 1, 1.5], 0x78716c, 0, 'crate');
    createCrate([10, 0.5, 8], [1.5, 1, 1.5], 0x78716c, 0, 'crate');
    createCrate([3, 0.5, 12], [1, 1, 1], 0x78716c, 0, 'crate');

    // --- Central barracks / warehouse (z: 15 to 40) — large building blocking line of sight ---
    createCrate([-15, 2.5, 28], [16, 5, 22], 0x5a5a5a, 0, 'wall');  // Left warehouse
    createCrate([20, 2.5, 28], [14, 5, 22], 0x5a5a5a, 0, 'wall');   // Right warehouse
    // Warehouse doors (small openings on the north side)
    // Left warehouse interior detail
    createCrate([-15, 0.5, 22], [2, 1, 2], 0x78716c, 0, 'crate');
    createCrate([-10, 0.5, 34], [2, 1, 2], 0x78716c, 0, 'crate');
    // Right warehouse interior detail
    createCrate([18, 0.5, 25], [2, 1, 2], 0x78716c, 0, 'crate');
    createCrate([23, 0.5, 32], [2, 1, 2], 0x78716c, 0, 'crate');

    // --- Mid-base section (z: 45 to 70) ---
    createCrate([-30, 2, 55], [10, 4, 16], 0x6b705c, 0, 'crate');  // West building
    createCrate([30, 2, 55], [10, 4, 16], 0x6b705c, 0, 'crate');   // East building
    createCrate([0, 1.5, 50], [6, 3, 8], 0x6b705c, 0, 'crate');     // Central small building

    // Scattered cover in mid-base
    createCrate([-20, 0.5, 45], [1.5, 1, 1.5], 0x78716c, 0, 'crate');
    createCrate([15, 0.5, 48], [1, 1, 1], 0x78716c, 0, 'crate');
    createCrate([-5, 0.5, 60], [1.5, 1, 1.5], 0x78716c, 0, 'crate');
    createCrate([8, 0.5, 65], [1, 1, 1], 0x78716c, 0, 'crate');
    createCrate([-35, 0.5, 70], [1.5, 1, 1.5], 0x78716c, 0, 'crate');
    createCrate([38, 0.5, 68], [1, 1, 1], 0x78716c, 0, 'crate');

    // --- North section (z: 75 to 110) — truck area behind large building ---
    // Large vehicle depot / hangar building blocking view from south
    createCrate([0, 3.5, 85], [30, 7, 20], 0x555555, 0, 'wall');   // Big hangar

    // Side buildings near truck area
    createCrate([-35, 2, 90], [12, 4, 14], 0x6b705c, 0, 'crate'); // NW building
    createCrate([35, 2, 95], [12, 4, 14], 0x6b705c, 0, 'crate');  // NE building

    // Cover near truck
    createCrate([-8, 0.5, 100], [1.5, 1, 1.5], 0x78716c, 0, 'crate');
    createCrate([10, 0.5, 105], [1, 1, 1], 0x78716c, 0, 'crate');
    createCrate([-3, 0.5, 108], [1.5, 1, 1.5], 0x78716c, 0, 'crate');

    // Fence sections along perimeter interior
    createCrate([-40, 1.5, 30], [0.3, 3, 20], 0x4a4a4a, 0, 'wall');
    createCrate([40, 1.5, 40], [0.3, 3, 20], 0x4a4a4a, 0, 'wall');
    createCrate([-40, 1.5, 80], [0.3, 3, 20], 0x4a4a4a, 0, 'wall');
    createCrate([40, 1.5, 75], [0.3, 3, 20], 0x4a4a4a, 0, 'wall');

    // === GREEN TRUCK (objective) — hidden behind the hangar at z=100 ===
    const truckBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x2d6a2d, roughness: 0.7, flatShading: true })
    );
    truckBody.position.set(0, 1.2, 100);
    truckBody.castShadow = true;
    scene.add(truckBody);
    // Truck cab
    const truckCab = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.5, 2),
      new THREE.MeshStandardMaterial({ color: 0x256b25, roughness: 0.7, flatShading: true })
    );
    truckCab.position.set(0, 2.2, 102);
    truckCab.castShadow = true;
    scene.add(truckCab);
    // Truck wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, flatShading: true });
    [[-1.4, 0.4, 98], [1.4, 0.4, 98], [-1.4, 0.4, 102.5], [1.4, 0.4, 102.5]].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      scene.add(wheel);
    });
    // Truck bed (flat area)
    const truckBed = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.1, 3),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9, flatShading: true })
    );
    truckBed.position.set(0, 2.0, 99.5);
    scene.add(truckBed);

    // === LIGHTING ===
    // Ambient forest light
    const ambLight = new THREE.AmbientLight(0x4a6741, 0.6);
    scene.add(ambLight);
    // Sunlight through trees
    const dirLight = new THREE.DirectionalLight(0xffe4b5, 1.2);
    dirLight.position.set(20, 30, -30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 250;
    dirLight.shadow.camera.left = -80;
    dirLight.shadow.camera.right = 80;
    dirLight.shadow.camera.top = 80;
    dirLight.shadow.camera.bottom = -120;
    scene.add(dirLight);
    // Base area lights
    const baseLight1 = new THREE.PointLight(0xffcc80, 0.8, 60);
    baseLight1.position.set(0, 6, 30);
    scene.add(baseLight1);
    const baseLight2 = new THREE.PointLight(0xffcc80, 0.5, 50);
    baseLight2.position.set(0, 6, 70);
    scene.add(baseLight2);
    const baseLight3 = new THREE.PointLight(0xffcc80, 0.6, 40);
    baseLight3.position.set(0, 6, 100);
    scene.add(baseLight3);

    // Sky dome (simple)
    const skyGeo = new THREE.SphereGeometry(150, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(0, 0, 20);
    scene.add(sky);

    // Spawn point (in the forest, player works north toward gate then base)
    spawnPoints.push(
      new THREE.Vector3(0, 1.5, -75)
    );
  } else if (mapId === 'campaign3') {
    // CAMPAIGN 3: CUTSCENE - "The Road Home"
    // Ruined city with broken buildings, dirty road, orange sunset

    ambientColor = '#ff8844';
    directionalColor = '#ffaa55';
    fogColor = '#cc6622';
    fogDensity = 0.003;

    // === GROUND / DIRTY ROAD ===
    const groundGeo = new THREE.PlaneGeometry(400, 600);
    const dirtRoadMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95, flatShading: true });
    const ground = new THREE.Mesh(groundGeo, dirtRoadMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    // Road surface (darker strip down the center)
    const roadGeo = new THREE.PlaneGeometry(6, 500);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.9, flatShading: true });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, 100);
    road.receiveShadow = true;
    scene.add(road);

    // === SKY DOME (orange sunset) ===
    const skyGeo = new THREE.SphereGeometry(200, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xff7733, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(0, 0, 100);
    scene.add(sky);

    // === SUN ===
    const sunGeo = new THREE.CircleGeometry(12, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(30, 18, -150);
    scene.add(sun);
    // Sun glow
    const glowGeo = new THREE.CircleGeometry(22, 32);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(sun.position);
    scene.add(glow);

    // === BROKEN BUILDINGS ===
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x555050, roughness: 0.85, flatShading: true });
    const buildingDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a3838, roughness: 0.9, flatShading: true });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.3 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x666060, roughness: 0.9, flatShading: true });

    const buildingDefs: { x: number; z: number; w: number; h: number; d: number; damaged: boolean }[] = [
      // Left side buildings
      { x: -20, z: -60, w: 12, h: 18, d: 10, damaged: true },
      { x: -25, z: -20, w: 14, h: 22, d: 12, damaged: false },
      { x: -18, z: 30, w: 10, h: 15, d: 10, damaged: true },
      { x: -22, z: 80, w: 16, h: 25, d: 14, damaged: false },
      { x: -28, z: 140, w: 11, h: 20, d: 10, damaged: true },
      { x: -15, z: 200, w: 13, h: 17, d: 11, damaged: false },
      // Right side buildings
      { x: 22, z: -50, w: 11, h: 20, d: 10, damaged: true },
      { x: 26, z: 10, w: 15, h: 24, d: 13, damaged: false },
      { x: 20, z: 60, w: 12, h: 16, d: 10, damaged: true },
      { x: 24, z: 120, w: 14, h: 21, d: 12, damaged: false },
      { x: 19, z: 180, w: 10, h: 19, d: 10, damaged: true },
      { x: 27, z: 240, w: 13, h: 23, d: 11, damaged: false },
      // Background buildings (further back, larger)
      { x: -45, z: -40, w: 18, h: 30, d: 15, damaged: true },
      { x: 48, z: 0, w: 20, h: 28, d: 16, damaged: true },
      { x: -50, z: 100, w: 16, h: 26, d: 14, damaged: false },
      { x: 52, z: 160, w: 18, h: 32, d: 15, damaged: true },
    ];

    for (const b of buildingDefs) {
      const mat = b.damaged ? buildingDarkMat : buildingMat;
      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      body.position.set(b.x, b.h / 2, b.z);
      body.castShadow = true;
      body.receiveShadow = true;
      scene.add(body);

      // Window frames (missing glass = just dark rectangles)
      const windowRows = Math.floor(b.h / 4);
      const windowCols = Math.max(1, Math.floor(b.w / 3.5));
      for (let row = 0; row < windowRows; row++) {
        for (let col = 0; col < windowCols; col++) {
          const wx = b.x - b.w / 2 + 1.5 + col * (b.w - 2) / Math.max(windowCols - 1, 1);
          const wy = 2.5 + row * 4;
          const wz = b.z + b.d / 2 + 0.05;

          if (b.damaged && Math.random() > 0.3) {
            // Missing glass - dark void with some broken glass shards
            const voidMesh = new THREE.Mesh(
              new THREE.PlaneGeometry(1.2, 1.8),
              new THREE.MeshBasicMaterial({ color: 0x111111 })
            );
            voidMesh.position.set(wx, wy, wz);
            scene.add(voidMesh);
            // Random glass shard
            if (Math.random() > 0.5) {
              const shard = new THREE.Mesh(
                new THREE.PlaneGeometry(0.4, 0.6),
                glassMat
              );
              shard.position.set(wx + (Math.random() - 0.5) * 0.5, wy + (Math.random() - 0.5) * 0.5, wz + 0.02);
              shard.rotation.z = (Math.random() - 0.5) * 0.5;
              scene.add(shard);
            }
          } else if (!b.damaged && Math.random() > 0.6) {
            // Some intact windows
            const win = new THREE.Mesh(
              new THREE.PlaneGeometry(1.2, 1.8),
              glassMat
            );
            win.position.set(wx, wy, wz);
            scene.add(win);
          }
        }
      }

      // Damaged buildings get broken top edges
      if (b.damaged) {
        const rubbleGeo = new THREE.BoxGeometry(b.w * 0.8, 1.5, b.d * 0.8);
        const rubble = new THREE.Mesh(rubbleGeo, concreteMat);
        rubble.position.set(b.x + (Math.random() - 0.5) * 2, b.h + 0.75, b.z);
        rubble.rotation.y = Math.random() * 0.3;
        rubble.castShadow = true;
        scene.add(rubble);
      }
    }

    // === DEBRIS ON ROAD ===
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x4a4040, roughness: 0.9, flatShading: true });
    const debrisPositions: [number, number, number, number, number, number][] = [
      [-1.5, 0.3, -30, 1.2, 0.6, 0.8],
      [2, 0.2, 20, 0.8, 0.4, 1.0],
      [-0.5, 0.4, 70, 1.5, 0.8, 0.6],
      [1, 0.15, 130, 0.6, 0.3, 0.5],
      [-2, 0.35, 190, 1.0, 0.7, 0.9],
      [0.5, 0.25, -70, 0.9, 0.5, 0.7],
      [-1, 0.3, 250, 1.1, 0.6, 0.8],
    ];
    for (const [dx, dy, dz, dw, dh, dd] of debrisPositions) {
      const debris = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, dd), debrisMat);
      debris.position.set(dx, dy, dz);
      debris.rotation.y = Math.random() * Math.PI;
      debris.castShadow = true;
      scene.add(debris);
    }

    // === OVERTURNED CAR ===
    const carBodyMat = new THREE.MeshStandardMaterial({ color: 0x443322, roughness: 0.7, metalness: 0.3, flatShading: true });
    const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 4.5), carBodyMat);
    carBody.position.set(4, 0.8, -10);
    carBody.rotation.z = 0.3;
    carBody.rotation.y = 0.4;
    carBody.castShadow = true;
    scene.add(carBody);

    // === LIGHTING ===
    const ambLight = new THREE.AmbientLight(0xff8844, 0.6);
    scene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0xffaa55, 1.2);
    dirLight.position.set(30, 30, -100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -80;
    dirLight.shadow.camera.right = 80;
    dirLight.shadow.camera.top = 80;
    dirLight.shadow.camera.bottom = -80;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);
    // Warm fill light from sun side
    const fillLight = new THREE.DirectionalLight(0xff6600, 0.4);
    fillLight.position.set(50, 10, -200);
    scene.add(fillLight);

    // === TRUCK MODEL (drives along the road) ===
    const truckGroup = new THREE.Group();
    const truckCabMat = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.8, flatShading: true });
    const truckBedMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.85, flatShading: true });
    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 2.5), truckCabMat);
    cab.position.set(0, 1.25, 1.5);
    cab.castShadow = true;
    truckGroup.add(cab);
    // Windshield
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), glassMat);
    windshield.position.set(0, 2.0, 2.76);
    truckGroup.add(windshield);
    // Bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 4), truckBedMat);
    bed.position.set(0, 0.75, -1.5);
    bed.castShadow = true;
    truckGroup.add(bed);
    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    for (const [wx, wz] of [[-1.5, 2], [1.5, 2], [-1.5, -2.5], [1.5, -2.5]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.5, wz);
      truckGroup.add(wheel);
    }
    truckGroup.position.set(0, 0, -100);
    scene.add(truckGroup);

    // Spawn point (camera starts here, cutscene is automated)
    spawnPoints.push(
      new THREE.Vector3(0, 3, -95)
    );
  }

  // CRITICAL: Force world matrix update on all scene objects before calculating bounding boxes!
  scene.updateMatrixWorld(true);
  colliders.forEach(c => {
    c.box.setFromObject(c.mesh);
  });

  return {
    spawnPoints,
    colliders,
    ambientColor,
    directionalColor,
    fogColor,
    fogDensity
  };
}
