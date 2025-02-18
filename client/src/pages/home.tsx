import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Video, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRoomSchema } from "@shared/schema";
import { z } from "zod";

const joinRoomSchema = z.object({
  roomId: z.string().length(6).regex(/^\d+$/, "Room ID must be 6 digits"),
  username: z.string().min(1, "Username is required")
});

export default function Home() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(joinRoomSchema),
    defaultValues: {
      roomId: "",
      username: ""
    }
  });

  const createRoom = async (username: string) => {
    if (!username) {
      toast({
        title: "Username required",
        description: "Please enter a username",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await apiRequest("POST", "/api/rooms", { username });
      const { roomId } = await res.json();
      navigate(`/room/${roomId}?username=${encodeURIComponent(username)}`);
    } catch (err) {
      toast({
        title: "Error creating room",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const onSubmit = (data: z.infer<typeof joinRoomSchema>) => {
    navigate(`/room/${data.roomId}?username=${encodeURIComponent(data.username)}`);
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
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="Enter your name"
              value={form.watch("username")}
              onChange={(e) => form.setValue("username", e.target.value)}
            />
          </div>

          <Button
            onClick={() => createRoom(form.watch("username"))}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!form.watch("username")}
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

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="roomId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter 6-digit Room ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">Join Room</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}