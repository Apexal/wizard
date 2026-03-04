import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.PORT || "8080", 10);

function ts(): string {
  return new Date().toISOString();
}

function log(tag: string, msg: string) {
  console.log(`${ts()} [${tag}] ${msg}`);
}

const wss = new WebSocketServer({ port: PORT });

// Only two clients: control (phone) and display (TV)
let nextId = 1;
const clients = new Map<WebSocket, number>();

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;

  if (clients.size >= 2) {
    log("reject", `${ip} — room full (${clients.size}/2)`);
    ws.close(4000, "Room full");
    return;
  }

  const id = nextId++;
  clients.set(ws, id);
  log("connect", `client #${id} from ${ip} (${clients.size}/2)`);

  ws.on("message", (data) => {
    let type = "unknown";
    try {
      type = JSON.parse(data.toString()).type;
    } catch {}

    const targets: number[] = [];
    for (const [client, cid] of clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
        targets.push(cid);
      }
    }

    log("relay", `#${id} → [${targets.join(", ")}] type=${type}`);
  });

  ws.on("close", (code, reason) => {
    clients.delete(ws);
    log("disconnect", `client #${id} code=${code} reason=${reason || "none"} (${clients.size}/2)`);
  });

  ws.on("error", (err) => {
    log("error", `client #${id} ${err.message}`);
    clients.delete(ws);
  });
});

log("server", `listening on ws://0.0.0.0:${PORT}`);
