import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  username: string;
  message: string;
}

export default function ChatSheet({ roomId, username }: { roomId: string; username: string }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    const s = io({ path: "/socket.io" });
    setSocket(s);
    s.emit("join-room", roomId);
    s.on("chat-message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });
    return () => {
      s.disconnect();
    };
  }, [roomId]);

  const sendMessage = () => {
    if (!input.trim() || !socket) return;
    const msg = { roomId, message: input, username };
    socket.emit("chat-message", msg);
    setMessages((prev) => [...prev, { username, message: input }]);
    setInput("");
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Chat</Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Chat</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto mt-4 space-y-2 flex flex-col">
          {messages.map((m, idx) => {
            const isSelf = m.username === username;
            return (
              <div
                key={idx}
                className={
                  "p-2 rounded max-w-xs " +
                  (isSelf
                    ? "bg-primary text-primary-foreground self-end"
                    : "bg-secondary text-secondary-foreground self-start")
                }
              >
                {m.message}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message" />
          <Button onClick={sendMessage}>Send</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
