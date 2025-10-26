const socket = io();
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const messages = document.getElementById("messages");

// Chat testuale
sendBtn.onclick = () => {
  const text = input.value.trim();
  if (text) socket.emit("chatMessage", text);
  input.value = "";
};

socket.on("chatMessage", (data) => {
  const li = document.createElement("li");
  li.textContent = `${data.id}: ${data.msg}`;
  messages.appendChild(li);
});

// ----- CHAT VOCALE (WebRTC) -----
let localStream;
let peers = {};

// Cattura microfono
async function initMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
}

initMedia();

// Notifica server che siamo connessi
socket.emit("join");

// Quando arriva un nuovo utente
socket.on("new-user", async (id) => {
  const peer = createPeer(id);
  peers[id] = peer;
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
});

// Creazione peer WebRTC
function createPeer(remoteId) {
  const peer = new RTCPeerConnection();

  // Invia candidati ICE
  peer.onicecandidate = e => {
    if (e.candidate) socket.emit("ice-candidate", { target: remoteId, candidate: e.candidate });
  };

  // Riceve audio remoto
  peer.ontrack = e => {
    let audio = document.getElementById(`audio-${remoteId}`);
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = `audio-${remoteId}`;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = e.streams[0];
  };

  // Crea offerta
  peer.createOffer()
    .then(offer => peer.setLocalDescription(offer))
    .then(() => {
      socket.emit("offer", { target: remoteId, sdp: peer.localDescription });
    });

  return peer;
}

// Riceve offerta
socket.on("offer", async (data) => {
  const peer = new RTCPeerConnection();
  peers[data.from] = peer;

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.onicecandidate = e => {
    if (e.candidate) socket.emit("ice-candidate", { target: data.from, candidate: e.candidate });
  };

  peer.ontrack = e => {
    let audio = document.getElementById(`audio-${data.from}`);
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = `audio-${data.from}`;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = e.streams[0];
  };

  await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  socket.emit("answer", { target: data.from, sdp: peer.localDescription });
});

// Riceve risposta
socket.on("answer", async (data) => {
  const peer = peers[data.from];
  await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
});

// Riceve candidati ICE
socket.on("ice-candidate", (data) => {
  const peer = peers[data.from];
  peer.addIceCandidate(new RTCIceCandidate(data.candidate));
});

// Quando un utente lascia
socket.on("user-left", (id) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
    const audio = document.getElementById(`audio-${id}`);
    if (audio) audio.remove();
  }
});
