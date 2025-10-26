const socket = io();

// Chat
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const messages = document.getElementById("messages");

// Voice channel
const joinVoiceBtn = document.getElementById("joinVoiceBtn");
const usernameInput = document.getElementById("username");
const userList = document.getElementById("userList");

let localStream;
let peers = {};
let joined = false;
let username = null; // sarà riempito dal login Google

// ---------------- GOOGLE LOGIN ----------------
function handleCredentialResponse(response) {
  const data = parseJwt(response.credential);
  username = data.name; // nome completo account Google
  console.log("✅ Accesso Google:", username);

  // Mostra il nome nell'input (solo per feedback visivo)
  usernameInput.value = username;
  usernameInput.disabled = true;

  // Abilita pulsante "Unisciti"
  document.getElementById("joinVoiceBtn").disabled = false;
}

// Decodifica token JWT Google
function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return {};
  }
}

// ---------------- MICROFONO ----------------
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("🎤 Microfono attivo");
  } catch (err) {
    console.error("❌ Errore microfono:", err);
    alert("Devi consentire l'accesso al microfono per usare il canale vocale.");
  }
}
initMedia();

// ---------------- CHAT TESTUALE ----------------
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

// ---------------- CANALE VOCALE ----------------
joinVoiceBtn.onclick = () => {
  if (!username) return alert("Effettua prima l'accesso con Google!");
  if (!joined) {
    socket.emit("joinVoice", username);
    joined = true;
    joinVoiceBtn.disabled = true;
  }
};

// Aggiorna lista utenti
socket.on("updateUsers", (usernames) => {
  userList.innerHTML = "";
  usernames.forEach(name => {
    const li = document.createElement("li");
    li.textContent = name;
    userList.appendChild(li);
  });
});

// ---------------- WEBRTC ----------------
socket.on("new-user", async (id) => {
  const peer = createPeer(id);
  peers[id] = peer;
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
});

function createPeer(remoteId) {
  const peer = new RTCPeerConnection();

  peer.onicecandidate = e => {
    if (e.candidate)
      socket.emit("ice-candidate", { target: remoteId, candidate: e.candidate });
  };

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

  peer.createOffer()
    .then(offer => peer.setLocalDescription(offer))
    .then(() => socket.emit("offer", { target: remoteId, sdp: peer.localDescription }));

  return peer;
}

socket.on("offer", async (data) => {
  const peer = new RTCPeerConnection();
  peers[data.from] = peer;
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.onicecandidate = e => {
    if (e.candidate)
      socket.emit("ice-candidate", { target: data.from, candidate: e.candidate });
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

socket.on("answer", async (data) => {
  const peer = peers[data.from];
  await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
});

socket.on("ice-candidate", (data) => {
  const peer = peers[data.from];
  if (peer) peer.addIceCandidate(new RTCIceCandidate(data.candidate));
});

socket.on("user-left", (id) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
    const audio = document.getElementById(`audio-${id}`);
    if (audio) audio.remove();
  }
});
