import * as THREE from 'three';

// ============================================================
// Brick texture (no repeat set — caller controls repeat per face)
// ============================================================
export function createBrickTexture(
  baseColor: number,
  mortarColor: number = 0x8b8680,
  brickW = 64,
  brickH = 32,
  mortarSize = 2
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const mr = (mortarColor >> 16) & 0xff;
  const mg = (mortarColor >> 8) & 0xff;
  const mb = mortarColor & 0xff;
  ctx.fillStyle = `rgb(${mr},${mg},${mb})`;
  ctx.fillRect(0, 0, size, size);

  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;

  const bw = brickW - mortarSize;
  const bh = brickH - mortarSize;
  let row = 0;
  for (let y = 0; y < size; y += brickH) {
    const offset = (row % 2) * (brickW / 2);
    for (let x = -offset; x < size; x += brickW) {
      const variation = (Math.random() - 0.5) * 30;
      const r = Math.max(0, Math.min(255, br + variation));
      const g = Math.max(0, Math.min(255, bg + variation));
      const b = Math.max(0, Math.min(255, bb + variation));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + mortarSize / 2, y + mortarSize / 2, bw, bh);

      ctx.fillStyle = `rgba(255,255,255,0.08)`;
      ctx.fillRect(x + mortarSize / 2, y + mortarSize / 2, bw, 1);
      ctx.fillRect(x + mortarSize / 2, y + mortarSize / 2, 1, bh);
      ctx.fillStyle = `rgba(0,0,0,0.08)`;
      ctx.fillRect(x + mortarSize / 2, y + mortarSize / 2 + bh - 1, bw, 1);
      ctx.fillRect(x + mortarSize / 2 + bw - 1, y + mortarSize / 2, 1, bh);
    }
    row++;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ============================================================
// Brick normal map — gives depth to bricks without extra geometry
// ============================================================
export function createBrickNormalMap(
  brickW = 64,
  brickH = 32,
  mortarSize = 2
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Flat normal (pointing up) = rgb(128, 128, 255)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  let row = 0;
  for (let y = 0; y < size; y += brickH) {
    const offset = (row % 2) * (brickW / 2);
    for (let x = -offset; x < size; x += brickW) {
      const bx = x + mortarSize / 2;
      const by = y + mortarSize / 2;
      const bw = brickW - mortarSize;
      const bh = brickH - mortarSize;

      // Brick face — slightly pushed out (brighter blue)
      ctx.fillStyle = '#9090ff';
      ctx.fillRect(bx, by, bw, bh);

      // Top edge highlight (normal points up)
      ctx.fillStyle = '#80c0ff';
      ctx.fillRect(bx, by, bw, 2);

      // Bottom edge shadow (normal points down)
      ctx.fillStyle = '#804080';
      ctx.fillRect(bx, by + bh - 2, bw, 2);

      // Left edge
      ctx.fillStyle = '#c080ff';
      ctx.fillRect(bx, by, 2, bh);

      // Right edge
      ctx.fillStyle = '#4080ff';
      ctx.fillRect(bx + bw - 2, by, 2, bh);

      // Mortar groove — recessed (darker)
      // Top mortar
      if (by > 0) {
        ctx.fillStyle = '#6060cc';
        ctx.fillRect(bx - 1, by - mortarSize, bw + 2, mortarSize);
      }
      // Left mortar
      if (bx > 0) {
        ctx.fillStyle = '#6060cc';
        ctx.fillRect(bx - mortarSize, by, mortarSize, bh);
      }
    }
    row++;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ============================================================
// Per-face brick material array for BoxGeometry
// BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
// For a box of size [W, H, D]:
//   +X/-X faces are D wide x H tall
//   +Y/-Y faces are W wide x D tall  
//   +Z/-Z faces are W wide x H tall
// ============================================================
export function createBrickFaceMaterials(
  color: number,
  w: number,  // box width  (X axis)
  h: number,  // box height (Y axis)
  d: number,  // box depth  (Z axis)
  opts?: { mortarColor?: number; metalness?: number; roughness?: number }
): THREE.MeshStandardMaterial[] {
  const baseOpts = {
    roughness: opts?.roughness ?? 0.8,
    metalness: opts?.metalness ?? 0.15,
    flatShading: false as const,
  };

  // Helper: create a material with correctly-repeated brick texture for a face
  const makeFaceMat = (faceW: number, faceH: number) => {
    const tex = createBrickTexture(color, opts?.mortarColor);
    tex.repeat.set(
      Math.max(1, Math.round(faceW / 3)),
      Math.max(1, Math.round(faceH / 1.5))
    );
    const normTex = createBrickNormalMap();
    normTex.repeat.copy(tex.repeat);
    return new THREE.MeshStandardMaterial({
      ...baseOpts,
      map: tex,
      normalMap: normTex,
      normalScale: new THREE.Vector2(0.6, 0.6),
    });
  };

  // Top/bottom faces — plain concrete color (no brick on roof/floor)
  const topMat = new THREE.MeshStandardMaterial({
    ...baseOpts,
    color,
    roughness: 0.9,
  });

  return [
    makeFaceMat(d, h),  // +X (right side: D x H)
    makeFaceMat(d, h),  // -X (left side:  D x H)
    topMat,             // +Y (top)
    topMat,             // -Y (bottom)
    makeFaceMat(w, h),  // +Z (front: W x H)
    makeFaceMat(w, h),  // -Z (back:  W x H)
  ];
}

// ============================================================
// Per-face container/corrugated material array
// ============================================================
export function createContainerFaceMaterials(
  color: number,
  w: number,
  h: number,
  d: number
): THREE.MeshStandardMaterial[] {
  const baseOpts = {
    roughness: 0.7,
    metalness: 0.35,
    flatShading: false as const,
    side: THREE.DoubleSide as const,
  };

  const makeFaceMat = (faceW: number, faceH: number) => {
    const tex = createBrickTexture(color, 0x4b5563, 48, 24, 3);
    tex.repeat.set(
      Math.max(1, Math.round(faceW / 3)),
      Math.max(1, Math.round(faceH / 2))
    );
    return new THREE.MeshStandardMaterial({ ...baseOpts, map: tex });
  };

  const topMat = new THREE.MeshStandardMaterial({
    ...baseOpts,
    color,
    roughness: 0.8,
  });

  return [
    makeFaceMat(d, h),
    makeFaceMat(d, h),
    topMat,
    topMat,
    makeFaceMat(w, h),
    makeFaceMat(w, h),
  ];
}

// ============================================================
// Concrete/asphalt floor texture
// ============================================================
export function createConcreteTexture(
  baseColor: number,
  scale = 1.0,
  noiseAmount = 15
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;

  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * noiseAmount * 2;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = `rgba(0,0,0,0.06)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let cx = Math.random() * size;
    let cy = Math.random() * size;
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 4; s++) {
      cx += (Math.random() - 0.5) * 40;
      cy += (Math.random() - 0.5) * 10 + 5;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ============================================================
// Grass texture
// ============================================================
export function createGrassTexture(
  baseColor: number = 0x15803d
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;

  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const blade = Math.sin(x * 0.3 + y * 0.7) * 8 + Math.sin(x * 0.8) * 5;
      const noise = (Math.random() - 0.5) * 12;
      const v = blade + noise;
      imageData.data[idx] = Math.max(0, Math.min(255, br + v));
      imageData.data[idx + 1] = Math.max(0, Math.min(255, bg + v + 3));
      imageData.data[idx + 2] = Math.max(0, Math.min(255, bb + v * 0.5));
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ============================================================
// Sand/dirt texture
// ============================================================
export function createSandTexture(
  baseColor: number = 0xca8a04
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;

  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise * 0.6));
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.fillStyle = `rgba(0,0,0,0.05)`;
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ============================================================
// Desert clay/rust texture
// ============================================================
export function createRustTexture(
  baseColor: number = 0xc2410c
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;

  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 25;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise * 0.5));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise * 0.3));
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = `rgba(60,20,5,0.15)`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      x += (Math.random() - 0.3) * 20;
      y += Math.random() * 15 + 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
