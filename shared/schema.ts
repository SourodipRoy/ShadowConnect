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
});

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

// WebRTC Signaling Types
export type SignalMessage = {
  type: 'offer' | 'answer' | 'ice-candidate';
  roomId: string;
  data: any;
};
