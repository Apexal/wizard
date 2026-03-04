import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { startVoice } from "./voice";
import { SignalingClient, getSignalingUrl } from "./signaling-client";

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

// --- WebRTC setup ---
const signaling = new SignalingClient(getSignalingUrl());
let pc: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;

async function setupWebRTC(audioStream: MediaStream) {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // Add processed audio track
  for (const track of audioStream.getAudioTracks()) {
    pc.addTrack(track, audioStream);
  }

  // Create data channel for blendshapes
  dataChannel = pc.createDataChannel("blendshapes", { ordered: false });
  dataChannel.onopen = () => console.log("[webrtc] data channel open");
  dataChannel.onclose = () => console.log("[webrtc] data channel closed");

  // Send ICE candidates to the display page
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      signaling.send({ type: "ice", candidate: e.candidate.toJSON() });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("[webrtc] connection state:", pc!.connectionState);
  };

  // Handle signaling messages from display page
  signaling.onMessage(async (msg) => {
    if (msg.type === "ready") {
      // Display is waiting — create and send offer
      const offer = await pc!.createOffer();
      await pc!.setLocalDescription(offer);
      signaling.send({ type: "offer", sdp: pc!.localDescription! });
      console.log("[webrtc] sent offer");
    } else if (msg.type === "answer") {
      await pc!.setRemoteDescription(msg.sdp);
      console.log("[webrtc] received answer");
    } else if (msg.type === "ice") {
      await pc!.addIceCandidate(msg.candidate);
    }
  });

  await signaling.connect();
  console.log("[control] connected to signaling, waiting for display...");
}

// --- Face tracking ---
let lastVideoTime = -1;
let run = true;

function renderLoop() {
  if (videoElement.currentTime !== lastVideoTime) {
    const result = faceLandmarker.detectForVideo(
      videoElement,
      videoElement.currentTime,
    );

    // Send blendshapes over the data channel
    if (
      dataChannel?.readyState === "open" &&
      result.faceBlendshapes?.[0]
    ) {
      const bs: Record<string, number> = {};
      for (const cat of result.faceBlendshapes[0].categories) {
        if (cat.score > 0.01) {
          bs[cat.categoryName] = Math.round(cat.score * 1000) / 1000;
        }
      }
      dataChannel.send(JSON.stringify({ t: Date.now(), bs }));
    }

    lastVideoTime = videoElement.currentTime;
  }

  requestAnimationFrame(() => {
    if (run) {
      renderLoop();
    }
  });
}

// --- Camera init ---
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
videoElement.srcObject = stream;
videoElement.play();
console.log("Webcam stream started");

startButton.addEventListener("click", async () => {
  try {
    videoElement.play();
    run = true;
    renderLoop();
  } catch (err) {
    console.error("Error accessing webcam: ", err);
  }

  const audioStream = await startVoice();
  await setupWebRTC(audioStream);
});

stopButton.addEventListener("click", () => {
  run = false;
  videoElement.pause();
  dataChannel?.close();
  pc?.close();
  signaling.close();
  console.log("Streaming stopped");
});
