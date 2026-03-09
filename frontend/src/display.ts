import { SignalingClient, getSignalingUrl } from "./signaling-client";
import { createWizardScene, updateFaceMesh } from "./wizard-head";
import { SOUNDS } from "./sounds";

const connectButton = document.getElementById("connect") as HTMLButtonElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// --- WebRTC receive side ---
const signaling = new SignalingClient(getSignalingUrl());
let pc: RTCPeerConnection | null = null;
let cameraStream: MediaStream | null = null;
let cameraAdded = false;

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

  // Preload sounds as AudioBuffers (Web Audio API avoids stealing the media session)
  const audioCtx = new AudioContext();
  const bufferCache: Record<string, AudioBuffer> = {};
  for (const s of SOUNDS) {
    fetch(s.file)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx.decodeAudioData(buf))
      .then((decoded) => { bufferCache[s.id] = decoded; })
      .catch((err) => console.warn("[sound] failed to load", s.id, err));
  }

  // Reusable buffer to avoid per-frame allocation
  const landmarkBuf = new Float32Array(478 * 3);

  // Receive data channels
  pc.ondatachannel = (e) => {
    console.log("[webrtc] data channel received:", e.channel.label);
    if (e.channel.label === "blendshapes") {
      const channel = e.channel;
      channel.binaryType = "arraybuffer";
      channel.onmessage = (evt) => {
        if (evt.data instanceof ArrayBuffer) {
          landmarkBuf.set(new Float32Array(evt.data));
          updateFaceMesh(landmarkBuf);
        }
      };
    } else if (e.channel.label === "soundboard") {
      e.channel.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === "sound" && bufferCache[msg.id]) {
          const src = audioCtx.createBufferSource();
          src.buffer = bufferCache[msg.id];
          src.connect(audioCtx.destination);
          src.start();
        }
      };
    }
  };

  // Send ICE candidates to the control page
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      signaling.send({ type: "ice", candidate: e.candidate.toJSON() });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("[webrtc] connection state:", pc!.connectionState);
    // Once the initial connection is established, add webcam track and renegotiate
    if (pc!.connectionState === "connected" && cameraStream && !cameraAdded) {
      cameraAdded = true;
      console.log("[display] adding webcam track, renegotiating");
      for (const track of cameraStream.getVideoTracks()) {
        pc!.addTrack(track, cameraStream);
      }
    }
  };

  // Triggered when addTrack causes renegotiation — display becomes the offerer
  pc.onnegotiationneeded = async () => {
    if (pc!.signalingState !== "stable") return;
    console.log("[webrtc] renegotiation needed, sending offer");
    const offer = await pc!.createOffer();
    await pc!.setLocalDescription(offer);
    signaling.send({ type: "offer", sdp: pc!.localDescription! });
  };

  // Handle signaling messages from control page
  signaling.onMessage(async (msg) => {
    if (msg.type === "offer") {
      await pc!.setRemoteDescription(msg.sdp);
      const answer = await pc!.createAnswer();
      await pc!.setLocalDescription(answer);
      signaling.send({ type: "answer", sdp: pc!.localDescription! });
      console.log("[webrtc] sent answer");
    } else if (msg.type === "answer") {
      // Renegotiation answer from control
      await pc!.setRemoteDescription(msg.sdp);
      console.log("[webrtc] received renegotiation answer");
    } else if (msg.type === "ice") {
      await pc!.addIceCandidate(msg.candidate);
    }
  });
}

connectButton.addEventListener("click", async () => {
  connectButton.remove();

  // Init Three.js scene — startBgVideo must be called in this click handler
  const startBgVideo = createWizardScene(canvas);
  startBgVideo();

  // Detect webcam — if present, stream it to the control page once connected
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (devices.some((d) => d.kind === "videoinput")) {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log("[display] webcam detected, will stream to control on connect");
    }
  } catch (err) {
    console.warn("[display] webcam check failed:", err);
  }

  setupWebRTC();
  await signaling.connect();
  signaling.send({ type: "ready" });
  console.log("[display] waiting for control page to connect...");
});
