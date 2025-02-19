import { rooms, type Room, type InsertRoom } from "@shared/schema";

export interface IStorage {
  createRoom(room: InsertRoom): Promise<Room>;
  getRoomByRoomId(roomId: string): Promise<Room | undefined>;
}

export class MemStorage implements IStorage {
  private rooms: Map<number, Room>;
  currentId: number;

  constructor() {
    this.rooms = new Map();
    this.currentId = 1;
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = this.currentId++;
    const room: Room = {
      id,
      ...insertRoom,
      createdAt: new Date().toISOString()
    };
    this.rooms.set(id, room);
    return room;
  }

  async getRoomByRoomId(roomId: string): Promise<Room | undefined> {
    return Array.from(this.rooms.values()).find(
      (room) => room.roomId === roomId
    );
  }
}

export const storage = new MemStorage();
export const rooms = new Map<string, Set<WebSocket>>();
