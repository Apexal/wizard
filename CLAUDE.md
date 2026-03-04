# Wizard of Oz — Floating Head Avatar

## Project Overview

A real-time floating 3D wizard head avatar system. A phone tracks the user's face and voice, streams the data over WebRTC to a TV display page that renders an animated 3D wizard head and plays the processed audio.

Aesthetic reference: the Wizard of Oz disembodied floating head — large, theatrical, slightly terrifying. Green-tinted skin, exaggerated features, dramatic lighting, swirling mist or smoke particles underneath.

## Architecture

```
Phone (control page)                    TV (display page)
─────────────────────                   ─────────────────
MediaPipe FaceLandmarker                Three.js wizard head
  └─ blendshapes ──────► WebRTC ──────► animate morph targets
Tone.js voice processing
  └─ audio track ──────► WebRTC ──────► AudioContext playback

         ▲                                      ▲
         └──────── WebSocket signaling ─────────┘
                   (local Node.js server)
```

### Two frontend pages

| Page      | URL path   | Purpose                                                |
| --------- | ---------- | ------------------------------------------------------ |
| `control` | `/control` | Phone: face tracking + voice processing → streams data |
| `display` | `/display` | TV: 3D wizard head renderer + audio output             |

### Backend

Simple Node.js WebSocket signaling server. Only purpose: relay WebRTC offer/answer/ICE between the two pages. No media passes through it.

## Tech Stack

- **Build**: Vite + TypeScript (existing)
- **Face tracking**: MediaPipe Tasks Vision — `FaceLandmarker` with `outputFaceBlendshapes: true`
- **Voice**: Tone.js — pitch shift, EQ, compression, reverb (already implemented in `voice.ts`)
- **3D rendering**: Three.js — procedural wizard head with morph targets
- **Transport**: WebRTC (RTCPeerConnection) for audio + blendshape data channel
- **Signaling**: WebSocket server (`ws` npm package), runs locally on the network

## Directory Structure

```
wizard/
├── CLAUDE.md
├── README.md
├── frontend/                    # Vite app (existing)
│   ├── index.html               # Redirect or landing page
│   ├── control.html             # Phone controller page
│   ├── display.html             # TV display page
│   ├── public/
│   │   └── face_landmarker.task # MediaPipe model (already present)
│   ├── src/
│   │   ├── control.ts           # Phone entry: face tracking + WebRTC send
│   │   ├── voice.ts             # Tone.js audio chain (already implemented)
│   │   ├── display.ts           # TV entry: Three.js + WebRTC receive
│   │   ├── wizard-head.ts       # Three.js procedural head + morph targets
│   │   ├── signaling-client.ts  # WebSocket signaling abstraction
│   │   └── style.css
│   ├── package.json
│   └── tsconfig.json
└── backend/                     # Signaling server (to be created)
    ├── src/
    │   └── server.ts            # WebSocket relay server
    └── package.json
```

## Key Implementation Details

### WebRTC Flow

1. TV display page loads → connects to signaling WebSocket, waits
2. Phone control page loads → connects to signaling WebSocket
3. Phone creates `RTCPeerConnection`, adds:
   - Audio track (Tone.js output captured via `MediaStreamDestinationNode`)
   - Data channel named `"blendshapes"` for JSON face data
4. Phone creates SDP offer → sends via WebSocket → TV receives, creates answer
5. ICE candidates exchanged via WebSocket
6. Connection established — face data and audio flow peer-to-peer

### Tone.js Audio → WebRTC

Tone.js output must be tapped before it reaches `Tone.Destination`:

```typescript
const dest = Tone.context.rawContext.createMediaStreamDestination();
reverb.connect(Tone.context.createGain()); // keep existing chain
reverb.connect(dest); // also send to WebRTC stream
const audioTrack = dest.stream.getAudioTracks()[0];
peerConnection.addTrack(audioTrack, dest.stream);
```

### Blendshape Data Channel

Send MediaPipe blendshapes as compact JSON at ~30fps. Only send changed/nonzero values.

```typescript
// Sent from control.ts on each frame
type BlendshapeFrame = {
  t: number; // timestamp (ms)
  bs: Record<string, number>; // blendshape name → score (0–1)
};
```

Key blendshapes to map to the wizard head:

- `jawOpen` → mouth open
- `mouthSmileLeft`, `mouthSmileRight` → smile
- `eyeBlinkLeft`, `eyeBlinkRight` → blinks
- `browInnerUp`, `browDownLeft`, `browDownRight` → eyebrow anger/surprise
- `mouthFunnel`, `mouthPucker` → lip shapes
- `cheekPuff` → puffed cheeks

### Three.js Wizard Head (`wizard-head.ts`)

Build procedurally — no imported model. Approximate approach:

- Large sphere for the head (scaled vertically), green-tinted Lambert or Phong material
- Separate geometry for eyes (glowing orbs), eyebrows (box geometry), lips
- Use `morphAttributes` on the mouth/eye geometries to create blend shape targets
- Floating animation: slow sinusoidal Y-axis oscillation
- Volumetric mist: particle system (points) beneath the head
- Dramatic lighting: green point light below, white rim light behind
- Optional: disembodied effect with dark background + fog

### Signaling Protocol (WebSocket messages)

```typescript
type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "ready" }; // sent by display page when it's listening
```

Server just broadcasts to the other connected client.

### Vite Multi-Page Config

```typescript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      input: {
        control: "control.html",
        display: "display.html",
      },
    },
  },
};
```

## Development Workflow

```bash
# Terminal 1 — signaling server
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev

# Access on local network:
# Phone: http://<laptop-ip>:5173/control
# TV:    http://<laptop-ip>:5173/display
```

**Important**: Both pages need HTTPS or localhost for camera/mic permissions. In dev, Vite's `--host` flag exposes on local network but browsers may block camera access over plain HTTP on non-localhost. Use a self-signed cert or enable the browser flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

## Current Status

- [x] Vite + TypeScript project scaffolded
- [x] MediaPipe FaceLandmarker integrated in `control.ts`
- [x] Tone.js voice chain implemented in `voice.ts`
- [x] Multi-page Vite config (`control.html`, `display.html`)
- [x] WebSocket signaling server (`backend/`)
- [x] WebRTC connection setup (`signaling-client.ts`)
- [ ] Tone.js audio routed to WebRTC track
- [ ] Blendshape data channel send/receive
- [ ] Three.js wizard head with morph targets (`wizard-head.ts`)
- [ ] Display page (`display.ts`) — receive + render
- [ ] Polish: mist particles, lighting, floating animation
