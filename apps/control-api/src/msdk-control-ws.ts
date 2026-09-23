import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import type { MsdkBridgeService } from "./msdk-bridge.js";
import type {
  MsdkControlHub,
  MsdkControlPeer
} from "./msdk-control.js";

export interface MsdkControlWebSocketBinding {
  close(): Promise<void>;
}

export function attachMsdkControlWebSocket(
  server: Server,
  bridge: MsdkBridgeService,
  hub: MsdkControlHub
): MsdkControlWebSocketBinding {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024
  });

  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`
    );
    const match = url.pathname.match(
      /^\/ws\/msdk\/control\/([^/]+)$/
    );
    if (!match) return;

    const aircraftSn = decodeURIComponent(match[1] ?? "");
    const token = readBearerToken(request);
    const identity =
      token ? bridge.authenticateAgent(token) : undefined;

    if (!identity) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    if (identity.aircraftSn !== aircraftSn) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      bindSocket(ws, identity.aircraftSn, hub, {
        gatewaySn: identity.gatewaySn,
        aircraftSn: identity.aircraftSn,
        expiresAt: identity.expiresAt
      });
    });
  };

  server.on("upgrade", onUpgrade);

  return {
    close() {
      server.off("upgrade", onUpgrade);
      for (const client of wss.clients) {
        client.close(1001, "server_shutdown");
      }
      return new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    }
  };
}

function bindSocket(
  ws: WebSocket,
  aircraftSn: string,
  hub: MsdkControlHub,
  identity: {
    gatewaySn: string;
    aircraftSn: string;
    expiresAt: number;
  }
): void {
  const peer: MsdkControlPeer = {
    send(text) {
      if (ws.readyState !== WebSocket.OPEN) return false;
      ws.send(text);
      return true;
    },
    close(code, reason) {
      ws.close(code, reason);
    }
  };

  hub.registerPeer(identity, peer);

  ws.send(
    JSON.stringify({
      type: "connected",
      aircraftSn: identity.aircraftSn,
      gatewaySn: identity.gatewaySn,
      tokenExpiresAt: identity.expiresAt
    })
  );

  ws.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      ws.close(1003, "binary_not_supported");
      return;
    }

    try {
      hub.handleAgentMessage(
        aircraftSn,
        rawDataToText(data)
      );
    } catch (error) {
      ws.send(
        JSON.stringify({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "msdk_control_message_failed"
        })
      );
    }
  });

  ws.on("close", () => {
    hub.unregisterPeer(aircraftSn, peer);
  });

  ws.on("error", () => {
    hub.unregisterPeer(aircraftSn, peer);
  });
}

function rawDataToText(data: RawData): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function readBearerToken(
  request: IncomingMessage
): string | undefined {
  const value = request.headers.authorization;
  if (!value) return undefined;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function rejectUpgrade(
  socket: Duplex,
  status: number,
  text: string
): void {
  socket.write(
    `HTTP/1.1 ${status} ${text}\r\n` +
      "Connection: close\r\n" +
      "Content-Length: 0\r\n" +
      "\r\n"
  );
  socket.destroy();
}
