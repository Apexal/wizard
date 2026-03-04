export type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "ready" };

export type SignalHandler = (msg: SignalMessage) => void;

/**
 * Thin wrapper around a WebSocket connection to the signaling server.
 * Handles JSON serialization and reconnection.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private handler: SignalHandler | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  /** Connect to the signaling server. Resolves when the socket is open. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("[signaling] connected");
        resolve();
      };

      this.ws.onerror = (e) => {
        console.error("[signaling] error", e);
        reject(e);
      };

      this.ws.onclose = () => {
        console.log("[signaling] disconnected");
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: SignalMessage = JSON.parse(event.data as string);
          this.handler?.(msg);
        } catch (err) {
          console.error("[signaling] bad message", err);
        }
      };
    });
  }

  /** Register a handler for incoming signaling messages. */
  onMessage(handler: SignalHandler) {
    this.handler = handler;
  }

  /** Send a signaling message to the other peer. */
  send(msg: SignalMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[signaling] cannot send, socket not open");
    }
  }

  close() {
    this.ws?.close();
  }
}

/** Build the signaling server URL based on the current page location. */
export function getSignalingUrl(): string {
  const host = window.location.hostname || "localhost";
  return `wss://${host}/ws`;
}
