import type { SignalMessage } from "@shared/schema";

export async function setupPeerConnection(
  roomId: string,
  localStream: MediaStream,
  onRemoteStream: (stream: MediaStream) => void
) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  // Add local tracks to the connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Handle remote tracks
  pc.ontrack = (event) => {
    onRemoteStream(event.streams[0]);
  };

  // Setup WebSocket connection
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = async (event) => {
    const { type, data } = JSON.parse(event.data);

    try {
      if (type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(
          JSON.stringify({
            type: "answer",
            roomId,
            data: answer
          })
        );
      } else if (type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === "ice-candidate") {
        await pc.addIceCandidate(new RTCIceCandidate(data));
      }
    } catch (err) {
      console.error("WebRTC Error:", err);
    }
  };

  // Send ICE candidates to peer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const message: SignalMessage = {
        type: "ice-candidate",
        roomId,
        data: event.candidate
      };
      ws.send(JSON.stringify(message));
    }
  };

  // Create and send offer when connected
  ws.onopen = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const message: SignalMessage = {
        type: "offer",
        roomId,
        data: offer
      };
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  };

  return { pc, ws };
}
