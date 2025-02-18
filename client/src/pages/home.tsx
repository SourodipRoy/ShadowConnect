import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Video, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const createRoom = async () => {
    try {
      const res = await apiRequest("POST", "/api/rooms");
      const { roomId } = await res.json();
      navigate(`/room/${roomId}`);
    } catch (err) {
      toast({
        title: "Error creating room",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const joinRoom = () => {
    if (!roomId.trim()) {
      toast({
        title: "Invalid room ID",
        description: "Please enter a valid room ID",
        variant: "destructive"
      });
      return;
    }
    navigate(`/room/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
            <Video className="w-6 h-6" />
            Video Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={createRoom}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Users className="mr-2 h-4 w-4" />
            Create Room
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or join existing
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <Button onClick={joinRoom}>Join</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
