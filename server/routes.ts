import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { Server as IOServer } from "socket.io";
import { storage } from "./storage";


export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const io = new IOServer(httpServer, { path: '/socket.io' });

  const rooms = new Map<string, Map<string, WebSocket>>();
  io.on("connection", (socket) => {
    socket.on("join-room", async (roomId) => {
      const roomInfo = await storage.getRoomByRoomId(roomId);
      const max = roomInfo?.maxParticipants ?? 2;
      const count = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
      if (max !== Infinity && count >= max) {
        socket.emit("error", { message: "room-full" });
        socket.disconnect();
        return;
      }
      socket.join(roomId);
    });

    socket.on("chat-message", (payload: { roomId: string; message: string; username: string }) => {
      socket.to(payload.roomId).emit("chat-message", { message: payload.message, username: payload.username });
    });
  });

  app.post("/api/rooms", async (req, res) => {
    // Generate 6 digit room ID
    let roomId;
    do {
      roomId = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(roomId));

    let maxParticipants: number | undefined;
    if (req.body && req.body.maxParticipants !== undefined) {
      if (req.body.maxParticipants === "Infinity") {
        maxParticipants = Infinity;
      } else {
        const parsed = parseInt(req.body.maxParticipants, 10);
        if (!Number.isNaN(parsed)) {
          maxParticipants = Math.min(Math.max(parsed, 2), 5);
        }
      }
    }

    const room = await storage.createRoom({
      roomId,
      maxParticipants: maxParticipants ?? 2,
    });
    res.json(room);
  });

  app.get("/api/rooms/:roomId", async (req, res) => {
    const room = await storage.getRoomByRoomId(req.params.roomId);
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    const participants = rooms.get(req.params.roomId)?.size ?? 0;
    res.json({ ...room, participants });
  });

  wss.on("connection", (ws) => {
    const clientId = uuidv4();
    ws.send(JSON.stringify({ type: "init", data: clientId }));
    let currentRoom: string | null = null;

    ws.on("message", async (message) => {
      try {
        const { type, roomId, data, target } = JSON.parse(message.toString());

        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Map());
        }

        if (!currentRoom) {
          const roomInfo = await storage.getRoomByRoomId(roomId);
          const max = roomInfo?.maxParticipants ?? 2;
          const map = rooms.get(roomId)!;
          if (max !== Infinity && map.size >= max) {
            ws.send(JSON.stringify({ type: "error", data: "room-full" }));
            ws.close();
            return;
          }
          currentRoom = roomId;
          map.set(clientId, ws);
          const peers = Array.from(map.keys()).filter((id) => id !== clientId);
          ws.send(JSON.stringify({ type: "peers", data: peers }));
          map.forEach((client, id) => {
            if (id !== clientId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "new-peer", data: clientId }));
            }
          });
        }

        if (target) {
          const targetWs = rooms.get(roomId)?.get(target);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({ type, data, senderId: clientId, target })
            );
          }
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (currentRoom) {
        const map = rooms.get(currentRoom);
        map?.delete(clientId);
        map?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "peer-leave", data: clientId }));
          }
        });
        if (map && map.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });

  return httpServer;
}
