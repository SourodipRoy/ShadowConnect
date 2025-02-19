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
  const [isHost, setIsHost] = useState(false);
  const [joinRequest, setJoinRequest] = useState<string | null>(null);
  const [waitingForAccept, setWaitingForAccept] = useState(false);
  const username = new URLSearchParams(window.location.search).get("username") || "Anonymous";
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const peerConnection = useRef<RTCPeerConnection>();
  const localStream = useRef<MediaStream>();
  const dataChannel = useRef<RTCDataChannel>();

  useEffect(() => {
    // Check if room is empty to set as host
    const checkHost = async () => {
      const response = await fetch(`/api/room/${roomId}/check`);
      const { isEmpty } = await response.json();
      setIsHost(isEmpty);
      if (!isEmpty) {
        setWaitingForAccept(true);
        // Send join request
        dataChannel.current?.send(JSON.stringify({ 
          type: 'joinRequest', 
          username 
        }));
      }
    };

    const initializeMedia = async () => {
      await checkHost();
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
          dataChannel.current?.send(JSON.stringify({ type: 'state', username, isMuted, isVideoOff, isHost }));
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
                setWaitingForAccept(false);
              } else if (data.type === 'joinRequest' && isHost) {
                setJoinRequest(data.username);
              } else if (data.type === 'joinResponse') {
                if (data.accepted) {
                  setWaitingForAccept(false);
                } else {
                  navigate('/');
                }
              } else if (data.type === 'hostLeft') {
                setIsHost(true);
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
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = undefined;
      }
      dataChannel.current = undefined;
    };
  }, [roomId, toast]);

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      dataChannel.current?.send(JSON.stringify({ type: 'state', username, isMuted: newMutedState, isVideoOff }));
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      const newVideoState = !isVideoOff;
      setIsVideoOff(newVideoState);
      dataChannel.current?.send(JSON.stringify({ type: 'state', username, isMuted, isVideoOff: newVideoState }));
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

  const handleJoinResponse = (accepted: boolean) => {
    dataChannel.current?.send(JSON.stringify({ 
      type: 'joinResponse', 
      accepted 
    }));
    setJoinRequest(null);
  };

  if (waitingForAccept) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="p-6">
          <h2 className="text-xl mb-4">Waiting for host to accept your request...</h2>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      {isHost && joinRequest && (
        <div className="fixed top-4 right-4 z-50">
          <Card className="p-4">
            <p className="mb-4">{joinRequest} wants to join this call</p>
            <div className="flex gap-2">
              <Button onClick={() => handleJoinResponse(true)}>Accept</Button>
              <Button variant="destructive" onClick={() => handleJoinResponse(false)}>Reject</Button>
            </div>
          </Card>
        </div>
      )}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="relative aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover rounded-lg transform scale-x-[-1]" // Flip horizontally
          />
          <div className="absolute bottom-4 left-4 text-sm text-white bg-black/50 px-2 py-1 rounded flex items-center gap-2">
            You {isScreenSharing && "(Screen Sharing)"}
            {isMuted && <MicOff className="w-4 h-4" />}
            {isVideoOff && <VideoOff className="w-4 h-4" />}
          </div>
        </Card>
        <Card className="relative aspect-video">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover rounded-lg transform scale-x-[-1]" // Flip horizontally
          />
          <div className="absolute bottom-4 left-4 text-sm text-white bg-black/50 px-2 py-1 rounded flex items-center gap-2">
            {remoteUsername ? `${remoteUsername}${!isHost ? " (Host)" : ""}` : "Waiting for peer..."}
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