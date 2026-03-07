import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { startVoice } from "./voice";
import { SignalingClient, getSignalingUrl } from "./signaling-client";
import { SOUNDS } from "./sounds";

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
let soundChannel: RTCDataChannel | null = null;

async function setupWebRTC(audioStream: MediaStream) {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // Display received video from the display-page webcam
  pc.ontrack = (e) => {
    if (e.track.kind === "video") {
      console.log("[webrtc] received display cam video track");
      const videoEl = document.getElementById("display-cam") as HTMLVideoElement;
      videoEl.srcObject = e.streams[0];
      videoEl.style.display = "block";
      videoEl.play();
    }
  };

  // Add processed audio track
  for (const track of audioStream.getAudioTracks()) {
    pc.addTrack(track, audioStream);
  }

  // Create data channel for face data — unreliable so stale frames are dropped
  dataChannel = pc.createDataChannel("blendshapes", {
    ordered: false,
    maxRetransmits: 0,
  });
  dataChannel.onopen = () => console.log("[webrtc] data channel open");
  dataChannel.onclose = () => console.log("[webrtc] data channel closed");

  soundChannel = pc.createDataChannel("soundboard", { ordered: true });
  soundChannel.onopen = () => console.log("[webrtc] soundboard channel open");
  soundChannel.onclose = () => console.log("[webrtc] soundboard channel closed");

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
    } else if (msg.type === "offer") {
      // Renegotiation offer from display (e.g. webcam track added)
      await pc!.setRemoteDescription(msg.sdp);
      const answer = await pc!.createAnswer();
      await pc!.setLocalDescription(answer);
      signaling.send({ type: "answer", sdp: pc!.localDescription! });
      console.log("[webrtc] handled renegotiation offer from display");
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
const landmarkBuf = new Float32Array(478 * 3);

function renderLoop() {
  if (videoElement.currentTime !== lastVideoTime) {
    const result = faceLandmarker.detectForVideo(
      videoElement,
      performance.now(),
    );

    // Send landmarks as binary Float32Array for minimal overhead
    if (
      dataChannel?.readyState === "open" &&
      result.faceLandmarks?.[0]
    ) {
      const pts = result.faceLandmarks[0];
      for (let i = 0; i < pts.length; i++) {
        landmarkBuf[i * 3] = pts[i].x;
        landmarkBuf[i * 3 + 1] = pts[i].y;
        landmarkBuf[i * 3 + 2] = pts[i].z;
      }
      dataChannel.send(landmarkBuf.buffer);
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

function playSound(id: string) {
  if (soundChannel?.readyState === "open") {
    soundChannel.send(JSON.stringify({ type: "sound", id }));
  }
}

// Preload sounds locally for preview
const localAudioCache: Record<string, HTMLAudioElement> = {};
for (const s of SOUNDS) {
  const a = new Audio(s.file);
  a.preload = "auto";
  localAudioCache[s.id] = a;
}

// Build soundboard buttons
const soundButtonsEl = document.getElementById("sound-buttons");
if (soundButtonsEl) {
  for (const s of SOUNDS) {
    const btn = document.createElement("button");
    btn.textContent = s.label;
    btn.addEventListener("click", () => {
      playSound(s.id);
      const a = localAudioCache[s.id];
      if (a) { a.currentTime = 0; a.play(); }
    });
    soundButtonsEl.appendChild(btn);
  }
}

stopButton.addEventListener("click", () => {
  run = false;
  videoElement.pause();
  dataChannel?.close();
  soundChannel?.close();
  pc?.close();
  signaling.close();
  console.log("Streaming stopped");
});
