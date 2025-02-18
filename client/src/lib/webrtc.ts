import type { SignalMessage, UserStatus } from "@shared/schema";

export async function setupPeerConnection(
  roomId: string,
  localStream: MediaStream,
  username: string,
  onRemoteStream: (stream: MediaStream, userStatus: UserStatus) => void
) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    onRemoteStream(event.streams[0], {
      username: "Remote",
      isMuted: false,
      isVideoOff: false
    });
  };

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = async (event) => {
    const { type, data, username: remoteUsername, status } = JSON.parse(event.data);

    try {
      if (type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(
          JSON.stringify({
            type: "answer",
            roomId,
            username,
            data: answer
          })
        );
      } else if (type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === "ice-candidate") {
        await pc.addIceCandidate(new RTCIceCandidate(data));
      } else if (type === "status-update" && status) {
        onRemoteStream(
          pc.getRemoteStreams()[0],
          status as UserStatus
        );
      }
    } catch (err) {
      console.error("WebRTC Error:", err);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const message: SignalMessage = {
        type: "ice-candidate",
        roomId,
        username,
        data: event.candidate
      };
      ws.send(JSON.stringify(message));
    }
  };

  ws.onopen = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const message: SignalMessage = {
        type: "offer",
        roomId,
        username,
        data: offer
      };
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  };

  return { pc, ws };
}

export async function startScreenShare(): Promise<MediaStream> {
  return await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "monitor",
      cursor: "always"
    },
    audio: true
  });
}

export async function switchCamera(currentStream: MediaStream): Promise<MediaStream> {
  const currentVideoTrack = currentStream.getVideoTracks()[0];
  const currentFacingMode = currentVideoTrack.getSettings().facingMode;

  const newFacingMode = currentFacingMode === "user" ? "environment" : "user";

  const newStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: newFacingMode },
    audio: true
  });

  return newStream;
}