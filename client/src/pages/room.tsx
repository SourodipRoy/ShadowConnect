import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Video, VideoOff, Phone, Monitor, CameraIcon } from "lucide-react";
import { setupPeerConnection, startScreenShare, switchCamera } from "@/lib/webrtc";

export default function Room() {
  const { roomId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [remoteUsername, setRemoteUsername] = useState<string>("");
  const [remoteIsMuted, setRemoteIsMuted] = useState(false);
  const [remoteIsVideoOff, setRemoteIsVideoOff] = useState(false);
  const username = new URLSearchParams(window.location.search).get("username") || "Anonymous";
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const peerConnection = useRef<RTCPeerConnection>();
  const localStream = useRef<MediaStream>();
  const dataChannel = useRef<RTCDataChannel>();
  const [localCircleColor, setLocalCircleColor] = useState<string>(`hsl(${Math.random() * 360}, 70%, 60%)`); // Added state for local user's circle color

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        localStream.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const { pc } = await setupPeerConnection(
          roomId!,
          stream,
          (remoteStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
          }
        );
        peerConnection.current = pc;

        // Create data channel for username exchange
        dataChannel.current = pc.createDataChannel("username");
        dataChannel.current.onopen = () => {
          dataChannel.current?.send(JSON.stringify({ type: 'state', username, isMuted, isVideoOff, localCircleColor })); // Send localCircleColor
        };

        // Handle receiving data channel
        pc.ondatachannel = (event) => {
          const channel = event.channel;
          channel.onmessage = (e) => {
            try {
              const data = JSON.parse(e.data);
              if (data.type === 'state') {
                setRemoteUsername(data.username);
                setRemoteIsMuted(data.isMuted);
                setRemoteIsVideoOff(data.isVideoOff);
                //Handle remote color if needed in future
              }
            } catch (error) {
              console.error("Error parsing peer data:", error);
            }
          };
        };
      } catch (err) {
        toast({
          title: "Media Error",
          description: "Could not access camera or microphone",
          variant: "destructive"
        });
      }
    };

    initializeMedia();

    return () => {
      localStream.current?.getTracks().forEach((track) => track.stop());
      peerConnection.current?.close();
    };
  }, [roomId, toast, localCircleColor]); // Added localCircleColor to the dependency array

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      dataChannel.current?.send(JSON.stringify({ type: 'state', username, isMuted: newMutedState, isVideoOff, localCircleColor })); //Send localCircleColor
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      const newVideoState = !isVideoOff;
      setIsVideoOff(newVideoState);
      dataChannel.current?.send(JSON.stringify({ type: 'state', username, isMuted, isVideoOff: newVideoState, localCircleColor })); //Send localCircleColor
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await startScreenShare();

        // Replace the video track
        const videoTrack = screenStream.getVideoTracks()[0];
        const senders = peerConnection.current?.getSenders();
        const videoSender = senders?.find((sender) =>
          sender.track?.kind === "video"
        );

        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Handle when user stops sharing screen
        videoTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      } else {
        // Switch back to camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: localStream.current?.getAudioTracks()[0].enabled ?? true
        });

        const videoTrack = stream.getVideoTracks()[0];
        const senders = peerConnection.current?.getSenders();
        const videoSender = senders?.find((sender) =>
          sender.track?.kind === "video"
        );

        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Screen share error:", err);
      toast({
        title: "Screen Share Error",
        description: "Could not share screen. Please make sure to select a screen to share.",
        variant: "destructive"
      });
    }
  };

  const handleCameraSwitch = async () => {
    if (isVideoOff) return; // Disable camera switch when video is off

    try {
      if (localStream.current) {
        const newStream = await switchCamera(localStream.current);
        const videoTrack = newStream.getVideoTracks()[0];

        // Replace the video track in the peer connection
        const senders = peerConnection.current?.getSenders();
        const videoSender = senders?.find((sender) =>
          sender.track?.kind === "video"
        );

        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
        }

        // Update the local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }

        localStream.current = newStream;
      }
    } catch (err) {
      console.error("Camera switch error:", err);
      toast({
        title: "Camera Switch Error",
        description: "Could not switch camera. Make sure you have multiple cameras available.",
        variant: "destructive"
      });
    }
  };

  const endCall = () => {
    localStream.current?.getTracks().forEach((track) => track.stop());
    peerConnection.current?.close();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="relative aspect-video overflow-hidden p-0 bg-transparent">
          <div className="absolute inset-0 flex items-center justify-center">
            {isVideoOff ? (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white"
                  style={{ backgroundColor: localCircleColor }}
                >
                  {username.charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            )}
          </div>

          <div className="absolute bottom-4 left-4 text-sm text-white bg-black/50 px-2 py-1 rounded flex items-center gap-2">
            You {isScreenSharing && "(Screen Sharing)"}
            {isMuted && <MicOff className="w-4 h-4" />}
            {isVideoOff && <VideoOff className="w-4 h-4" />}
          </div>
        </Card>
        <Card className="relative aspect-video overflow-hidden p-0 bg-transparent">
          <div className="absolute inset-0 flex items-center justify-center">
            {remoteIsVideoOff ? (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white"
                  style={{ backgroundColor: localCircleColor }}
                >
                  {(remoteUsername || "Anonymous").charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            )}
          </div>

          <div className="absolute bottom-4 left-4 text-sm text-white bg-black/50 px-2 py-1 rounded flex items-center gap-2">
            {remoteUsername || "Waiting for peer..."}
            {remoteIsMuted && <MicOff className="w-4 h-4" />}
            {remoteIsVideoOff && <VideoOff className="w-4 h-4" />}
          </div>
        </Card>
      </div>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-4 bg-secondary p-4 rounded-full shadow-lg">
        <Button
          variant={isMuted ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleMute}
          className="hover:bg-secondary-foreground/10 active:bg-secondary-foreground/20"
        >
          {isMuted ? <MicOff /> : <Mic />}
        </Button>
        <Button
          variant={isVideoOff ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleVideo}
          className="hover:bg-secondary-foreground/10 active:bg-secondary-foreground/20"
        >
          {isVideoOff ? <VideoOff /> : <Video />}
        </Button>
        <Button
          variant={isScreenSharing ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleScreenShare}
          disabled={isVideoOff}
          className="hover:bg-secondary-foreground/10 active:bg-secondary-foreground/20"
        >
          <Monitor />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleCameraSwitch}
          disabled={isVideoOff}
          className="hover:bg-secondary-foreground/10 active:bg-secondary-foreground/20"
        >
          <CameraIcon />
        </Button>
        <Button 
          variant="destructive" 
          size="icon" 
          onClick={endCall}
          className="hover:bg-destructive/90 active:bg-destructive/80"
        >
          <Phone />
        </Button>
      </div>
    </div>
  );
}