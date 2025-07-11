export interface PeerEvents {
  onTrack: (stream: MediaStream, id: string) => void;
  onPeerLeave?: (id: string) => void;
}

export async function setupMesh(
  roomId: string,
  localStream: MediaStream,
  events: PeerEvents
) {
  const peers = new Map<string, RTCPeerConnection>();
  let clientId: string | null = null;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  const ws = new WebSocket(wsUrl);

  const createPeerConnection = (peerId: string) => {
    if (peers.has(peerId)) return peers.get(peerId)!;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    pc.onicecandidate = (e) => {
      if (e.candidate && clientId) {
        ws.send(
          JSON.stringify({
            type: "ice-candidate",
            roomId,
            data: e.candidate,
            target: peerId,
            senderId: clientId
          })
        );
      }
    };
    pc.ontrack = (ev) => {
      events.onTrack(ev.streams[0], peerId);
    };
    peers.set(peerId, pc);
    return pc;
  };

  const createOffer = async (peerId: string) => {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (clientId) {
      ws.send(
        JSON.stringify({
          type: "offer",
          roomId,
          data: offer,
          target: peerId,
          senderId: clientId
        })
      );
    }
  };

  const handleOffer = async (peerId: string, offer: any) => {
    const pc = createPeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (clientId) {
      ws.send(
        JSON.stringify({
          type: "answer",
          roomId,
          data: answer,
          target: peerId,
          senderId: clientId
        })
      );
    }
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case "init":
        clientId = msg.data;
        ws.send(
          JSON.stringify({ type: "join", roomId, senderId: clientId })
        );
        break;
      case "peers":
        (msg.data as string[]).forEach((id) => {
          createOffer(id);
        });
        break;
      case "new-peer":
        createOffer(msg.data as string);
        break;
      case "offer":
        if (msg.target === clientId) {
          await handleOffer(msg.senderId, msg.data);
        }
        break;
      case "answer":
        if (msg.target === clientId) {
          const pc = peers.get(msg.senderId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          }
        }
        break;
      case "ice-candidate":
        if (msg.target === clientId) {
          const pc = peers.get(msg.senderId);
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.data));
          }
        }
        break;
      case "peer-leave":
        const leaving = msg.data as string;
        if (peers.has(leaving)) {
          peers.get(leaving)!.close();
          peers.delete(leaving);
          events.onPeerLeave?.(leaving);
        }
        break;
    }
  };

  return { ws, peers };
}

export async function startScreenShare(): Promise<MediaStream> {
  return await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "monitor",
      ...( { logicalSurface: true } as any ),
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
