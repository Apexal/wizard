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

### Landmark Data Channel

Face data is sent as a binary `Float32Array` (not JSON blendshapes). Each frame contains all 478 MediaPipe face landmarks packed as `[x0, y0, z0, x1, y1, z1, ...]` — 1434 floats total (~5.5 KB/frame).

```typescript
// Sent from control.ts on each frame
const landmarkBuf = new Float32Array(478 * 3);
// ... fill x/y/z per landmark ...
dataChannel.send(landmarkBuf.buffer); // binary ArrayBuffer
```

The data channel is configured unreliable (`ordered: false, maxRetransmits: 0`) so stale frames are dropped rather than queued.

### Three.js Face Mesh (`wizard-head.ts`)

Renders the real-time face mesh directly from MediaPipe landmarks — not a procedural wizard head:

- 478-vertex `BufferGeometry` with `DynamicDrawUsage` positions
- Triangle indices built from `FaceLandmarker.FACE_LANDMARKS_TESSELATION`
- Green-tinted `MeshPhongMaterial` with `flatShading: true`
- MediaPipe coords (0–1, top-left origin) mapped to Three.js space: center at 0, Y flipped, scaled ×1.5
- Dramatic lighting: green `PointLight` below, white rim `PointLight` behind, dim ambient
- Black background + `FogExp2` for disembodied effect

### Reverse Video

The display page optionally streams its webcam back to the control page (for monitoring). After the initial WebRTC connection is established, `display.ts` adds its webcam track and triggers renegotiation — display becomes the offerer for the second negotiation.

### Signaling Protocol (WebSocket messages)

```typescript
type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "ready" }; // sent by display page when it's listening
```

Server just broadcasts to the other connected client. Both peers can originate offers — control sends the initial offer, display sends a renegotiation offer when it adds its webcam track.

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

# Terminal 3 — ngrok tunnel (for HTTPS on mobile)
ngrok http 5173
```

Vite proxies `/ws` → `ws://localhost:8080` so the frontend only needs one origin for both HTTP and WebSocket.

The ngrok hostname `sheaflike-carley-literately.ngrok-free.dev` is allowlisted in `vite.config.js`. Update it if the tunnel URL changes.

**Access:**
- Local: `http://localhost:5173/control` and `http://localhost:5173/display`
- Remote (phone/TV): use the ngrok HTTPS URL — required for camera/mic permissions on non-localhost

## Current Status

- [x] Vite + TypeScript project scaffolded
- [x] MediaPipe FaceLandmarker integrated in `control.ts`
- [x] Tone.js voice chain implemented in `voice.ts`
- [x] Multi-page Vite config (`control.html`, `display.html`)
- [x] WebSocket signaling server (`backend/`)
- [x] WebRTC connection setup (`signaling-client.ts`)
- [x] Tone.js audio routed to WebRTC track (`voice.ts` returns `MediaStream`)
- [x] Face landmark data channel — binary `Float32Array`, unreliable UDP-like
- [x] Three.js face mesh renderer (`wizard-head.ts`) — green-tinted, dramatic lighting
- [x] Display page (`display.ts`) — receive landmarks + audio, render face mesh
- [x] Reverse video — display webcam streamed back to control page
- [x] ngrok tunneling — HTTPS for camera/mic on mobile devices
- [ ] Polish: mist particles, floating animation
