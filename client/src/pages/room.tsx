import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Video, VideoOff, Phone, Monitor, CameraIcon } from "lucide-react";
import { setupPeerConnection, startScreenShare, switchCamera } from "@/lib/webrtc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function Room() {
  const { roomId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [remoteUsername, setRemoteUsername] = useState<string>("");
  const [remoteIsMuted, setRemoteIsMuted] = useState(false);
  const [remoteIsVideoOff, setRemoteIsVideoOff] = useState(false);
  const [remoteCircleColor, setRemoteCircleColor] = useState<string>(`hsl(${Math.random() * 360}, 70%, 60%)`);
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
  const [facingMode, setFacingMode] = useState<"user" | "environment" | null>(null);
  type VideoQualityOption = "auto" | "144p" | "240p" | "360p" | "480p" | "720p" | "1080p" | "max";
  const [videoQuality, setVideoQuality] = useState<VideoQualityOption>("auto");

  const getVideoConstraints = (quality: VideoQualityOption): MediaTrackConstraints | boolean => {
    switch (quality) {
      case "144p":
        return { width: { ideal: 256 }, height: { ideal: 144 } };
      case "240p":
        return { width: { ideal: 426 }, height: { ideal: 240 } };
      case "360p":
        return { width: { ideal: 640 }, height: { ideal: 360 } };
      case "480p":
        return { width: { ideal: 854 }, height: { ideal: 480 } };
      case "720p":
        return { width: { ideal: 1280 }, height: { ideal: 720 } };
      case "1080p":
        return { width: { ideal: 1920 }, height: { ideal: 1080 } };
      case "max":
        return { width: { ideal: 4096 }, height: { ideal: 2160 } };
      default:
        return true;
    }
  };

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: getVideoConstraints(videoQuality),
          audio: true
        });
        localStream.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const trackFacingMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
        if (trackFacingMode === "user" || trackFacingMode === "environment") {
          setFacingMode(trackFacingMode);
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
                if (data.localCircleColor) {
                  setRemoteCircleColor(data.localCircleColor);
                }
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

  const changeVideoQuality = async (quality: VideoQualityOption) => {
    setVideoQuality(quality);
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const constraints = getVideoConstraints(quality);
      if (typeof constraints === "boolean") {
        if (constraints) {
          await track.applyConstraints({});
        }
      } else {
        await track.applyConstraints(constraints);
      }
    } catch (err) {
      console.error("Quality change error:", err);
      toast({
        title: "Video Quality Error",
        description: "Could not change video quality",
        variant: "destructive"
      });
    }
  };

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

        setFacingMode(null);

        // Handle when user stops sharing screen
        videoTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      } else {
        // Switch back to camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: getVideoConstraints(videoQuality),
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

        const trackFacingMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
        if (trackFacingMode === "user" || trackFacingMode === "environment") {
          setFacingMode(trackFacingMode);
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
        const trackFacingMode = newStream.getVideoTracks()[0]?.getSettings().facingMode;
        if (trackFacingMode === "user" || trackFacingMode === "environment") {
          setFacingMode(trackFacingMode);
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
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={cn("w-full h-full object-cover", isVideoOff && "hidden")}
              style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
            />
            {isVideoOff && (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white"
                  style={{ backgroundColor: localCircleColor }}
                >
                  {username.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </div>

          <div className="absolute top-4 left-4 text-xs">
            <Select value={videoQuality} onValueChange={changeVideoQuality} disabled={isVideoOff || isScreenSharing}>
              <SelectTrigger className="w-24 h-8 bg-black/50 text-white border-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="144p">144p</SelectItem>
                <SelectItem value="240p">240p</SelectItem>
                <SelectItem value="360p">360p</SelectItem>
                <SelectItem value="480p">480p</SelectItem>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="absolute bottom-4 left-4 text-sm text-white bg-black/50 px-2 py-1 rounded flex items-center gap-2">
            You {isScreenSharing && "(Screen Sharing)"}
            {isMuted && <MicOff className="w-4 h-4" />}
            {isVideoOff && <VideoOff className="w-4 h-4" />}
          </div>
        </Card>
        <Card className="relative aspect-video overflow-hidden p-0 bg-transparent">
          <div className="absolute inset-0 flex items-center justify-center">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={cn("w-full h-full object-cover", remoteIsVideoOff && "hidden")}
            />
            {remoteIsVideoOff && (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white"
                  style={{ backgroundColor: remoteCircleColor }}
                >
                  {(remoteUsername || "Anonymous").charAt(0).toUpperCase()}
                </div>
              </div>
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