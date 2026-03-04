# wizard

MediaPipe Face Mesh + WebRTC + WebSockets

A real-time floating 3D wizard head avatar. A phone tracks your face and voice, streams data over WebRTC to a TV display page that renders an animated 3D wizard head.

## Running locally

```bash
# Terminal 1 — signaling server (port 8080)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Open `http://localhost:5173/display` on the TV and `http://localhost:5173/control` on the phone.

## Running with ngrok (for phone HTTPS)

Browsers require HTTPS for camera/mic access on non-localhost origins. ngrok provides that.

```bash
# Terminal 1 — signaling server
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev

# Terminal 3 — ngrok tunnel
ngrok http 5173
```

Then add your ngrok hostname to `frontend/vite.config.js` under `server.allowedHosts`, and open:

- **Phone**: `https://<your-subdomain>.ngrok-free.app/control`
- **TV**: `https://<your-subdomain>.ngrok-free.app/display` (or just `localhost:5173/display`)

The Vite config proxies `/ws` to the backend, so signaling works through the single ngrok tunnel.
