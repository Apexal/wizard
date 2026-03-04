import { SignalingClient, getSignalingUrl } from "./signaling-client";
import { createWizardScene, updateFaceMesh } from "./wizard-head";

const connectButton = document.getElementById("connect") as HTMLButtonElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// --- WebRTC receive side ---
const signaling = new SignalingClient(getSignalingUrl());
let pc: RTCPeerConnection | null = null;

function setupWebRTC() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // Play received audio — audio element created after user gesture so play() works
  pc.ontrack = (e) => {
    console.log("[webrtc] received audio track");
    const audio = new Audio();
    audio.srcObject = e.streams[0];
    audio.play();
  };

  // Receive landmark data as binary Float32Array
  pc.ondatachannel = (e) => {
    console.log("[webrtc] data channel received:", e.channel.label);
    const channel = e.channel;
    channel.binaryType = "arraybuffer";
    channel.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        updateFaceMesh(new Float32Array(evt.data));
      }
    };
  };

  // Send ICE candidates to the control page
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      signaling.send({ type: "ice", candidate: e.candidate.toJSON() });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("[webrtc] connection state:", pc!.connectionState);
  };

  // Handle signaling messages from control page
  signaling.onMessage(async (msg) => {
    if (msg.type === "offer") {
      await pc!.setRemoteDescription(msg.sdp);
      const answer = await pc!.createAnswer();
      await pc!.setLocalDescription(answer);
      signaling.send({ type: "answer", sdp: pc!.localDescription! });
      console.log("[webrtc] sent answer");
    } else if (msg.type === "ice") {
      await pc!.addIceCandidate(msg.candidate);
    }
  });
}

connectButton.addEventListener("click", async () => {
  connectButton.remove();

  // Init Three.js scene
  createWizardScene(canvas);

  setupWebRTC();
  await signaling.connect();
  signaling.send({ type: "ready" });
  console.log("[display] waiting for control page to connect...");
});
