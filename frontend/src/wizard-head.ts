import * as THREE from "three";
import { FaceLandmarker } from "@mediapipe/tasks-vision";

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let positionAttr: THREE.BufferAttribute;
let normalAttr: THREE.BufferAttribute;
let faceIndices: Uint16Array;

/** Build triangle indices from MediaPipe's tesselation connections. */
function buildTriangleIndices(): Uint16Array {
  const conns = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
  const numTriangles = conns.length / 3;
  const indices = new Uint16Array(numTriangles * 3);
  for (let i = 0; i < numTriangles; i++) {
    const base = i * 3;
    indices[base] = conns[base].start;
    indices[base + 1] = conns[base + 1].start;
    indices[base + 2] = conns[base + 2].start;
  }
  return indices;
}

/** Initialize the Three.js scene, camera, renderer, and face mesh.
 *  Returns a function that starts the background video (must be called from a user gesture). */
export function createWizardScene(canvas: HTMLCanvasElement): () => void {
  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);

  // Scene — no fog (fog + alpha canvas makes mesh edges transparent)
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.01,
    5,
  );
  camera.position.set(0, 0, 1.5);
  camera.lookAt(0, 0, 0);

  // Face mesh geometry — 478 vertices, start at origin
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(478 * 3);
  positionAttr = new THREE.BufferAttribute(positions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  faceIndices = buildTriangleIndices();
  geometry.setIndex(new THREE.BufferAttribute(faceIndices, 1));
  const normals = new Float32Array(478 * 3);
  normalAttr = new THREE.BufferAttribute(normals, 3);
  normalAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("normal", normalAttr);

  // Procedural environment map for bronze reflections
  const envSize = 128;
  const envCanvas = document.createElement("canvas");
  envCanvas.width = envSize;
  envCanvas.height = envSize;
  const ectx = envCanvas.getContext("2d")!;
  // Warm bronze gradient — simulates studio lighting reflections
  const envGrad = ectx.createLinearGradient(0, 0, 0, envSize);
  envGrad.addColorStop(0, "#2a1c08");
  envGrad.addColorStop(0.3, "#c49a4a");
  envGrad.addColorStop(0.5, "#f0d890");
  envGrad.addColorStop(0.7, "#a07830");
  envGrad.addColorStop(1, "#1a1208");
  ectx.fillStyle = envGrad;
  ectx.fillRect(0, 0, envSize, envSize);
  const envTexture = new THREE.CanvasTexture(envCanvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;

  // Shiny bronze material — smooth, reflective (Phong for perf on low-end TVs)
  const material = new THREE.MeshPhongMaterial({
    color: 0x7a5528,
    emissive: 0x120a04,
    specular: 0xc09050,
    shininess: 60,
    envMap: envTexture,
    reflectivity: 0.5,
    combine: THREE.AddOperation,
    side: THREE.FrontSide,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Lighting — warm key from front, golden fill from below, neutral rim
  const keyLight = new THREE.PointLight(0xffeedd, 0.7, 10);
  keyLight.position.set(0, 0.05, 0.6);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0xcc9944, 0.35, 10);
  fillLight.position.set(0, -0.3, 0.3);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xddccaa, 0.35, 10);
  rimLight.position.set(0, 0.15, -0.5);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0xffeedd, 0.07));

  // Emerald ambient — reflected room light
  scene.add(new THREE.AmbientLight(0x20cc60, 0.1));

  // Background video — HTML element behind transparent canvas
  const bgVideo = document.createElement("video");
  bgVideo.src = "/video/bg.mp4";
  bgVideo.loop = true;
  bgVideo.muted = true;
  bgVideo.playsInline = true;
  bgVideo.setAttribute("playsinline", "");
  bgVideo.setAttribute("webkit-playsinline", "");
  bgVideo.preload = "auto";
  Object.assign(bgVideo.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    objectFit: "cover",
    zIndex: "-1",
  });
  document.body.appendChild(bgVideo);

  // Handle resize
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Fire light synced to video — fades in at 2s, fades out at 4s
  const fireLight = new THREE.PointLight(0xff6620, 0, 10);
  fireLight.position.set(0, -0.1, 0.4);
  scene.add(fireLight);
  const fireMaxIntensity = 0.7;
  const fireFadeIn = 0.3; // seconds to fade in
  const fireFadeOut = 0.5; // seconds to fade out

  // Start render loop
  function animate() {
    requestAnimationFrame(animate);

    // Update fire light based on video time
    const t = bgVideo.currentTime;
    let fireIntensity = 0;
    if (t >= 2 && t < 2 + fireFadeIn) {
      fireIntensity = ((t - 2) / fireFadeIn) * fireMaxIntensity;
    } else if (t >= 2 + fireFadeIn && t < 5 - fireFadeOut) {
      fireIntensity = fireMaxIntensity;
    } else if (t >= 5 - fireFadeOut && t < 5) {
      fireIntensity = ((5 - t) / fireFadeOut) * fireMaxIntensity;
    }
    fireLight.intensity = fireIntensity;

    renderer.render(scene, camera);
  }
  animate();

  // Return a function to start the bg video — must be called from user gesture
  return () => {
    console.log("[wizard-head] starting bg video from user gesture");
    bgVideo.load();
    bgVideo.addEventListener("canplay", () => {
      console.log("[wizard-head] bg video canplay, calling play()");
      bgVideo.play().then(() => {
        console.log("[wizard-head] bg video playing");
      }).catch((err) => {
        console.error("[wizard-head] bg video play failed:", err.name, err.message);
      });
    }, { once: true });
  };
}

// MediaPipe landmark regions
const NOSE_TIP = 1;
// Brow ridge — push forward for imposing overhang
const BROW_RIDGE: Set<number> = new Set([
  70, 63, 105, 66, 107, 55, 65, 52, 53, 46,
  336, 296, 334, 293, 300, 285, 295, 282, 283, 276,
]);

/**
 * Update face mesh vertex positions from a flat landmark array.
 * Applies theatrical exaggeration — enlarged forehead, prominent brow,
 * elongated jaw — to evoke the Wizard of Oz floating head.
 *
 * Input: [x0, y0, z0, x1, y1, z1, ...] — 478 * 3 values,
 * in MediaPipe normalized coords (0–1, origin top-left).
 */
export function updateFaceMesh(landmarks: Float32Array | number[]) {
  const arr = positionAttr.array as Float32Array;
  const scale = 0.75;

  // Get nose tip as face center (in MediaPipe coords)
  const noseX = landmarks[NOSE_TIP * 3];
  const noseY = landmarks[NOSE_TIP * 3 + 1];
  const noseZ = landmarks[NOSE_TIP * 3 + 2];

  for (let i = 0; i < 478; i++) {
    const si = i * 3;
    // Raw centered + flipped coords
    let x = (landmarks[si] - 0.5) * scale;
    let y = -(landmarks[si + 1] - 0.5) * scale;
    let z = -(landmarks[si + 2] - 0.5) * scale;

    // Delta from nose in MediaPipe space (before flip)
    const dyRaw = landmarks[si + 1] - noseY; // positive = below nose in MP coords
    const dxRaw = landmarks[si] - noseX;
    const dzRaw = landmarks[si + 2] - noseZ;

    // --- Forehead: push up and slightly forward ---
    if (dyRaw < -0.02) {
      const strength = Math.min(Math.abs(dyRaw) / 0.15, 1);
      y += strength * 0.09 * scale;
      z -= strength * 0.02 * scale;
      x += Math.sign(dxRaw) * strength * 0.03 * scale;
    }

    // --- Brow ridge: push forward for imposing overhang ---
    if (BROW_RIDGE.has(i)) {
      z -= 0.02 * scale;
      y += 0.01 * scale;
    }

    // --- Jaw & chin: elongate downward, widen jaw ---
    if (dyRaw > 0.03) {
      const strength = Math.min(dyRaw / 0.15, 1);
      y -= strength * 0.06 * scale;
      x += Math.sign(dxRaw) * strength * 0.02 * scale;
    }

    // --- Overall: deepen the Z profile for more dramatic depth ---
    z += dzRaw * 0.15 * scale;

    arr[si] = x;
    arr[si + 1] = y;
    arr[si + 2] = z;
  }
  positionAttr.needsUpdate = true;

  // Inline vertex normal computation — avoids Three.js overhead & allocations
  const nArr = normalAttr.array as Float32Array;
  nArr.fill(0);
  for (let i = 0; i < faceIndices.length; i += 3) {
    const ia = faceIndices[i] * 3;
    const ib = faceIndices[i + 1] * 3;
    const ic = faceIndices[i + 2] * 3;
    const abx = arr[ib] - arr[ia], aby = arr[ib + 1] - arr[ia + 1], abz = arr[ib + 2] - arr[ia + 2];
    const acx = arr[ic] - arr[ia], acy = arr[ic + 1] - arr[ia + 1], acz = arr[ic + 2] - arr[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    nArr[ia] += nx; nArr[ia + 1] += ny; nArr[ia + 2] += nz;
    nArr[ib] += nx; nArr[ib + 1] += ny; nArr[ib + 2] += nz;
    nArr[ic] += nx; nArr[ic + 1] += ny; nArr[ic + 2] += nz;
  }
  for (let i = 0; i < nArr.length; i += 3) {
    const len = Math.sqrt(nArr[i] * nArr[i] + nArr[i + 1] * nArr[i + 1] + nArr[i + 2] * nArr[i + 2]);
    if (len > 0) { nArr[i] /= len; nArr[i + 1] /= len; nArr[i + 2] /= len; }
  }
  normalAttr.needsUpdate = true;
}
