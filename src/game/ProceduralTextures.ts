import * as THREE from 'three';

// Creates a canvas-based brick texture with a given base color and mortar color
export function createBrickTexture(
  baseColor: number,
  mortarColor: number = 0x8b8680,
  brickW = 64,
  brickH = 32,
  mortarSize = 2
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Mortar background
  const mr = (mortarColor >> 16) & 0xff;
  const mg = (mortarColor >> 8) & 0xff;
  const mb = mortarColor & 0xff;
  ctx.fillStyle = `rgb(${mr},${mg},${mb})`;
  ctx.fillRect(0, 0, 256, 256);

  // Base color components
  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;

  // Draw brick rows with offset pattern (running bond)
  const bw = brickW - mortarSize;
  const bh = brickH - mortarSize;
  let row = 0;
  for (let y = 0; y < 256; y += brickH) {
    const offset = (row % 2) * (brickW / 2);
    for (let x = -offset; x < 256; x += brickW) {
      // Per-brick color variation (±15)
      const variation = (Math.random() - 0.5) * 30;
      const r = Math.max(0, Math.min(255, br + variation));
      const g = Math.max(0, Math.min(255, bg + variation));
      const b = Math.max(0, Math.min(255, bb + variation));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + mortarSize / 2, y + mortarSize / 2, bw, bh);

      // Subtle top-left highlight and bottom-right shadow for depth
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
  tex.repeat.set(2, 2);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// Creates a canvas-based concrete/asphalt floor texture
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

  // Fill base
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);

  // Add noise grain for texture detail
  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * noiseAmount * 2;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  // Add subtle crack lines
  ctx.strokeStyle = `rgba(0,0,0,0.06)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.moveTo(x, y);
    let cx = x, cy = y;
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

// Creates a grass texture with green variations
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

  // Draw grass blade-like streaks
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

// Creates a sand/dirt texture
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

  // Noise grain
  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise * 0.6));
  }
  ctx.putImageData(imageData, 0, 0);

  // Small pebble dots
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

// Creates a desert clay/rust texture
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

  // Strong noise for worn rust look
  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 25;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise * 0.5));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise * 0.3));
  }
  ctx.putImageData(imageData, 0, 0);

  // Rust streaks
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
