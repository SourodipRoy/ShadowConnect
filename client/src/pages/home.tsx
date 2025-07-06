
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Video, Users } from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const copyRoomId = () => {
    navigator.clipboard.writeText(createdRoomId);
    toast({
      title: "Room ID copied",
      description: "You can now share this with others",
    });
  };

  const validateUsername = () => {
    if (!username.trim()) {
      toast({
        title: "Username required",
        description: "Please enter a username",
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const createRoom = async () => {
    if (!validateUsername()) return;
    
    try {
      const res = await apiRequest("POST", "/api/rooms");
      const { roomId } = await res.json();
      setCreatedRoomId(roomId);
    } catch (err) {
      toast({
        title: "Error creating room",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const joinRoom = async () => {
    if (!validateUsername()) return;

    if (!roomId.trim() || roomId.length !== 6) {
      toast({
        title: "Invalid room ID",
        description: "Please enter a valid 6-digit room ID",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (!res.ok) {
        toast({
          title: "Room not found",
          description: "This room is not active",
          variant: "destructive"
        });
        return;
      }
      navigate(`/room/${roomId}?username=${encodeURIComponent(username)}`);
    } catch (err) {
      toast({
        title: "Error joining room",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const joinCreatedRoom = () => {
    if (!validateUsername()) return;
    navigate(`/room/${createdRoomId}?username=${encodeURIComponent(username)}`);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Video className="w-6 h-6" />
            Video Chat
          </CardTitle>
          <ThemeToggle />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <Input
              id="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Button
              onClick={createRoom}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Users className="mr-2 h-4 w-4" />
              Create Room
            </Button>
            {createdRoomId && (
              <div className="flex gap-2 items-center bg-secondary p-2 rounded">
                <div className="flex-1 font-mono">{createdRoomId}</div>
                <Button size="sm" variant="outline" onClick={copyRoomId}>
                  Copy
                </Button>
                <Button size="sm" onClick={joinCreatedRoom}>
                  Join
                </Button>
              </div>
            )}
          </div>
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
          <div>
            <div className="flex gap-2">
              <Input
                placeholder="Enter 6-digit Room ID"
                value={roomId}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length <= 6) {
                    setRoomId(value);
                  }
                }}
                pattern="\d{6}"
                maxLength={6}
                inputMode="numeric"
              />
              <Button onClick={joinRoom}>Join</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
