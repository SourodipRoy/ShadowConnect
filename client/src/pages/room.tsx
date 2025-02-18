import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, CameraIcon } from "lucide-react";
import { setupPeerConnection, startScreenShare, switchCamera } from "@/lib/webrtc";

export default function Room() {
  const { roomId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const peerConnection = useRef<RTCPeerConnection>();
  const localStream = useRef<MediaStream>();

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
  }, [roomId, toast]);

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
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

        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        videoTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      } else {
        // Switch back to camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        const videoTrack = stream.getVideoTracks()[0];
        const senders = peerConnection.current?.getSenders();
        const videoSender = senders?.find((sender) => 
          sender.track?.kind === "video"
        );

        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setIsScreenSharing(false);
      }
    } catch (err) {
      toast({
        title: "Screen Share Error",
        description: "Could not share screen",
        variant: "destructive"
      });
    }
  };

  const handleCameraSwitch = async () => {
    try {
      if (localStream.current) {
        const newStream = await switchCamera(localStream.current);
        const videoTrack = newStream.getVideoTracks()[0];

        // Replace the video track in the peer connection
        const senders = peerConnection.current?.getSenders();
        const videoSender = senders?.find((sender) => 
          sender.track?.kind === "video"
        );

        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }

        // Update the local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }

        localStream.current = newStream;
      }
    } catch (err) {
      toast({
        title: "Camera Switch Error",
        description: "Could not switch camera",
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
        <Card className="relative aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute bottom-4 left-4 text-sm text-white bg-black/50 px-2 py-1 rounded">
            You {isScreenSharing && "(Screen Sharing)"}
          </div>
        </Card>
        <Card className="relative aspect-video">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute bottom-4 left-4 text-sm text-white bg-black/50 px-2 py-1 rounded">
            Remote
          </div>
        </Card>
      </div>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-4 bg-secondary p-4 rounded-full shadow-lg">
        <Button
          variant={isMuted ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleMute}
        >
          {isMuted ? <MicOff /> : <Mic />}
        </Button>
        <Button
          variant={isVideoOff ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleVideo}
        >
          {isVideoOff ? <VideoOff /> : <Video />}
        </Button>
        <Button
          variant={isScreenSharing ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleScreenShare}
        >
          <Monitor />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleCameraSwitch}
        >
          <CameraIcon />
        </Button>
        <Button variant="destructive" size="icon" onClick={endCall}>
          <PhoneOff />
        </Button>
      </div>
    </div>
  );
}