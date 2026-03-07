import * as THREE from "three";
import { FaceLandmarker } from "@mediapipe/tasks-vision";

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let positionAttr: THREE.BufferAttribute;

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

/** Initialize the Three.js scene, camera, renderer, and face mesh. */
export function createWizardScene(canvas: HTMLCanvasElement) {
  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Scene
  scene = new THREE.Scene();
  renderer.setClearColor(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 1.5);

  // Camera
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );
  camera.position.set(0, 0, 1.5);
  camera.lookAt(0, 0, 0);

  // Face mesh geometry — 478 vertices, start at origin
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(478 * 3);
  positionAttr = new THREE.BufferAttribute(positions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setIndex(new THREE.BufferAttribute(buildTriangleIndices(), 1));

  // Green-tinted material
  const material = new THREE.MeshPhongMaterial({
    color: 0x22ee66,
    emissive: 0x0a6630,
    specular: 0x33aa66,
    shininess: 30,
    side: THREE.DoubleSide,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Lighting — green key light in front, rim from behind
  const keyLight = new THREE.PointLight(0x00ff44, 4, 10);
  keyLight.position.set(0, 0, 1.2);
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(0xffffff, 2, 10);
  rimLight.position.set(0, 0.2, -1);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0x22aa44, 1.5));

  // Background video — looping plane behind the face
  const bgVideo = document.createElement("video");
  bgVideo.src = "/video/bg.mp4";
  bgVideo.loop = true;
  bgVideo.muted = true;
  bgVideo.playsInline = true;
  bgVideo.play();
  const videoTexture = new THREE.VideoTexture(bgVideo);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  const bgPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: videoTexture, fog: false }),
  );
  bgPlane.position.z = -2;
  scene.add(bgPlane);

  // Size the bg plane to cover the viewport at z=-2
  function sizeBgPlane() {
    const dist = camera.position.z - bgPlane.position.z;
    const vFov = (camera.fov * Math.PI) / 180;
    const h = 2 * Math.tan(vFov / 2) * dist;
    const w = h * camera.aspect;
    bgPlane.scale.set(w, h, 1);
  }
  sizeBgPlane();

  // Handle resize
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    sizeBgPlane();
  });

  // Start render loop
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

/**
 * Update face mesh vertex positions from a flat landmark array.
 * Input: [x0, y0, z0, x1, y1, z1, ...] — 478 * 3 values,
 * in MediaPipe normalized coords (0–1, origin top-left).
 */
export function updateFaceMesh(landmarks: Float32Array | number[]) {
  const arr = positionAttr.array as Float32Array;
  const scale = 1.5;
  for (let i = 0; i < 478; i++) {
    const si = i * 3;
    // Center (subtract 0.5) and flip Y so the face is right-side-up
    arr[si] = (landmarks[si] - 0.5) * scale;
    arr[si + 1] = -(landmarks[si + 1] - 0.5) * scale;
    arr[si + 2] = -(landmarks[si + 2] - 0.5) * scale;
  }
  positionAttr.needsUpdate = true;
}
