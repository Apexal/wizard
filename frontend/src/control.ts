import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { startVoice } from "./voice";

const videoElement = document.getElementById("webcam") as HTMLVideoElement;
const startButton = document.getElementById("start") as HTMLButtonElement;
const stopButton = document.getElementById("stop") as HTMLButtonElement;

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
);

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "/face_landmarker.task",
    delegate: "GPU",
  },
  runningMode: "VIDEO",
  numFaces: 1,
  outputFaceBlendshapes: true,
});

let lastVideoTime = -1;
let run = true;
function renderLoop() {
  if (videoElement.currentTime !== lastVideoTime) {
    const faceLandmarkerResult = faceLandmarker.detectForVideo(
      videoElement,
      videoElement.currentTime,
    );
    console.log(faceLandmarkerResult);
    lastVideoTime = videoElement.currentTime;
  }

  requestAnimationFrame(() => {
    if (run) {
      renderLoop();
    }
  });
}

const stream = await navigator.mediaDevices.getUserMedia({ video: true });
videoElement.srcObject = stream;
videoElement.play();
console.log("Webcam stream started");

startButton.addEventListener("click", async () => {
  try {
    videoElement.play();
    renderLoop();
  } catch (err) {
    console.error("Error accessing webcam: ", err);
  }

  await startVoice();
});

stopButton.addEventListener("click", () => {
  run = false;
  videoElement.pause();
  console.log("Webcam stream stopped");
});
