const socket = io();

let username = null;
let joined = false;

// 🔊 Suoni di sistema
const joinSound = new Audio("/sounds/windows7_startup.mp3");
const leaveSound = new Audio("/sounds/windows7_shutdown.mp3");

// Quando Google autentica l’utente
function handleCredentialResponse(response) {
  const data = parseJwt(response.credential);
  username = data.name || "Utente Sconosciuto";
  console.log("✅ Accesso Google:", username);

  document.getElementById("joinVoiceBtn").disabled = false;
  document.getElementById("username").value = username;
}

// Decodifica token JWT di Google
function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return {};
  }
}

// --- ENTRA NEL CANALE VOCALE ---
document.getElementById("joinVoiceBtn").onclick = async () => {
  if (!username) return alert("Devi prima accedere con Google!");
  if (joined) return;

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    alert("Devi consentire l'accesso al microfono!");
    return;
  }

  socket.emit("joinVoice", username);
  joined = true;
  document.getElementById("joinVoiceBtn").disabled = true;
};

// --- AGGIORNA LISTA UTENTI ---
socket.on("updateUsers", (users) => {
  const userList = document.getElementById("userList");
  userList.innerHTML = "";
  users.forEach((u) => {
    const li = document.createElement("li");
    li.textContent = u;
    userList.appendChild(li);
  });
});
let previousUsers = [];

socket.on("updateUsers", (users) => {
  const userList = document.getElementById("userList");
  userList.innerHTML = "";
  users.forEach((u) => {
    const li = document.createElement("li");
    li.textContent = u;
    userList.appendChild(li);
  });

  // 🔊 Controllo entrate/uscite
  if (previousUsers.length > 0) {
    if (users.length > previousUsers.length) joinSound.play();
    else if (users.length < previousUsers.length) leaveSound.play();
  }
  previousUsers = users;
});



// --- CHAT TESTUALE ---
const sendBtn = document.getElementById("send");
const msgInput = document.getElementById("msg");
const messages = document.getElementById("messages");

sendBtn.onclick = () => {
  const msg = msgInput.value.trim();
  if (msg) {
    socket.emit("chatMessage", msg);
    msgInput.value = "";
  }
};

socket.on("chatMessage", (data) => {
  const li = document.createElement("li");
  li.textContent = `${data.id}: ${data.msg}`;
  messages.appendChild(li);
});

// --- GESTIONE ENTRATE / USCITE ---
socket.on("new-user", () => {
  joinSound.play();
});

socket.on("user-left", () => {
  leaveSound.play();
});

// --- WEBRTC (base per vocale, già pronto) ---
let peers = {};
let localStream;

socket.on("new-user", async (newUserId) => {
  console.log("Nuovo utente nel canale:", newUserId);
  createPeerConnection(newUserId, true);
});

socket.on("offer", async ({ sdp, from }) => {
  const pc = createPeerConnection(from, false);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { target: from, sdp: pc.localDescription });
});

socket.on("answer", async ({ sdp, from }) => {
  const pc = peers[from];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("ice-candidate", async ({ candidate, from }) => {
  const pc = peers[from];
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Errore ICE:", err);
    }
  }
});

function createPeerConnection(targetId, initiator) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peers[targetId] = pc;

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { target: targetId, candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
    const audio = document.createElement("audio");
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  if (initiator) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { target: targetId, sdp: pc.localDescription });
    };
  }

  return pc;
}
