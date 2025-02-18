import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import type { SignalMessage, UserStatus } from "@shared/schema";

function generateRoomId(): string {
  const min = 100000; // Smallest 6-digit number
  const max = 999999; // Largest 6-digit number
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

type ExtWebSocket = WebSocket & {
  username?: string;
  roomId?: string;
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const rooms = new Map<string, Set<ExtWebSocket>>();
  const userStatus = new Map<string, UserStatus>();

  app.post("/api/rooms", async (req, res) => {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ message: "Username is required" });
      return;
    }

    let roomId: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      roomId = generateRoomId();
      const existingRoom = await storage.getRoomByRoomId(roomId);
      if (!existingRoom) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      res.status(500).json({ message: "Could not generate unique room ID" });
      return;
    }

    await storage.createRoom({ roomId, username });
    res.json({ roomId });
  });

  app.get("/api/rooms/:roomId", async (req, res) => {
    const room = await storage.getRoomByRoomId(req.params.roomId);
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    res.json(room);
  });

  wss.on("connection", (ws: ExtWebSocket) => {
    ws.on("message", (message) => {
      try {
        const { type, roomId, username, data } = JSON.parse(message.toString()) as SignalMessage;

        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }

        if (!ws.roomId) {
          ws.roomId = roomId;
          ws.username = username;
          rooms.get(roomId)?.add(ws);

          // Initialize user status
          userStatus.set(`${roomId}-${username}`, {
            username,
            isMuted: false,
            isVideoOff: false
          });
        }

        // Broadcast to all other clients in the room
        rooms.get(roomId)?.forEach((client: ExtWebSocket) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type,
              data,
              username: ws.username,
              status: userStatus.get(`${roomId}-${ws.username}`)
            }));
          }
        });

        // Update user status if it's a status update
        if (type === 'status-update') {
          userStatus.set(`${roomId}-${username}`, data);
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (ws.roomId) {
        rooms.get(ws.roomId)?.delete(ws);
        if (rooms.get(ws.roomId)?.size === 0) {
          rooms.delete(ws.roomId);
        }
        if (ws.username) {
          userStatus.delete(`${ws.roomId}-${ws.username}`);
        }
      }
    });
  });

  return httpServer;
}