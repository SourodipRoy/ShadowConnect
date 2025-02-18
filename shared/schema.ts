import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  roomId: text("room_id").notNull().unique(),
  createdAt: text("created_at").notNull()
});

export const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
  createdAt: true
}).extend({
  roomId: z.string().length(6).regex(/^\d+$/, "Room ID must be 6 digits"),
  username: z.string().min(1, "Username is required")
});

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

// WebRTC Signaling Types
export type SignalMessage = {
  type: 'offer' | 'answer' | 'ice-candidate';
  roomId: string;
  username?: string;
  data: any;
};

// User Status Types
export type UserStatus = {
  username: string;
  isMuted: boolean;
  isVideoOff: boolean;
};