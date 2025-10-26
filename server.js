const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let users = {}; // utenti connessi e loro canale

io.on("connection", (socket) => {
  console.log("🟢 Utente connesso:", socket.id);

  // Quando un utente sceglie un nome e si unisce al canale vocale
  socket.on("joinVoice", (username) => {
    users[socket.id] = { name: username, channel: "Generale" };
    socket.join("Generale");

    console.log(`🎙️ ${username} è entrato nel canale Generale`);
    io.to("Generale").emit("updateUsers", getUsersInChannel("Generale"));

    // Notifica nuovi utenti per WebRTC
    socket.broadcast.to("Generale").emit("new-user", socket.id);
  });

  // CHAT TESTUALE
  socket.on("chatMessage", (msg) => {
    io.emit("chatMessage", { id: socket.id, msg });
  });

  // --- WebRTC Signaling ---
  socket.on("offer", (data) => {
    io.to(data.target).emit("offer", { sdp: data.sdp, from: socket.id });
  });

  socket.on("answer", (data) => {
    io.to(data.target).emit("answer", { sdp: data.sdp, from: socket.id });
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.target).emit("ice-candidate", { candidate: data.candidate, from: socket.id });
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      console.log(`🔴 ${user.name} ha lasciato il canale`);
      const channel = user.channel;
      delete users[socket.id];
      io.to(channel).emit("updateUsers", getUsersInChannel(channel));
      io.to(channel).emit("user-left", socket.id);
    }
  });
});

function getUsersInChannel(channel) {
  return Object.values(users)
    .filter(u => u.channel === channel)
    .map(u => u.name);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server attivo su http://0.0.0.0:${PORT}`);
});

