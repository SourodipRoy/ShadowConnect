import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { v4 as uuidv4 } from "uuid";
import type { SignalMessage } from "@shared/schema";
import { z } from "zod";
import { publicProcedure, router } from "./trpc.js";
import { rooms } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const rooms = new Map<string, Set<WebSocket>>();

  app.post("/api/rooms", async (req, res) => {
    // Generate 6 digit room ID
    let roomId;
    do {
      roomId = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(roomId));

    await storage.createRoom({ roomId });
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

  wss.on("connection", (ws) => {
    let currentRoom: string | null = null;

    ws.on("message", (message) => {
      try {
        const { type, roomId, data } = JSON.parse(message.toString()) as SignalMessage;

        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }

        if (!currentRoom) {
          currentRoom = roomId;
          rooms.get(roomId)?.add(ws);
        }

        // Broadcast to all other clients in the room
        rooms.get(roomId)?.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type, data }));
          }
        });
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (currentRoom) {
        rooms.get(currentRoom)?.delete(ws);
        if (rooms.get(currentRoom)?.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });

  return httpServer;
}

export const appRouter = router({
  checkRoom: publicProcedure
    .input(z.string())
    .query(({ input: roomId }) => {
      return { isEmpty: !rooms.has(roomId) };
    }),
});