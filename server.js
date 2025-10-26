// --- CARICA VARIABILI D'AMBIENTE ---
require('dotenv').config(); // ⚠️ aggiunto in cima al file

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- SESSION ---
app.use(session({
  secret: process.env.SESSION_SECRET, // usiamo variabile d'ambiente
  resave: false,
  saveUninitialized: true
}));

// --- PASSPORT ---
app.use(passport.initialize());
app.use(passport.session());

// --- SERIALIZZAZIONE UTENTE ---
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- STRATEGIA GOOGLE ---
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,       // variabile d'ambiente
  clientSecret: process.env.GOOGLE_CLIENT_SECRET, // variabile d'ambiente
  callbackURL: process.env.CALLBACK_URL        // variabile d'ambiente
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

// --- ROTTE GOOGLE ---
app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/"); // Login riuscito
  }
);

app.get("/logout", (req, res, next) => {
  req.logout(function(err) {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/profile", (req, res) => {
  res.json(req.user || { loggedIn: false });
});

// --- STATICI ---
app.use(express.static(path.join(__dirname, "public")));

// --- CHAT/VOICE LOGIC ---
let users = {};

io.on("connection", (socket) => {
  console.log("🟢 Utente connesso:", socket.id);

  socket.on("joinVoice", (username) => {
    users[socket.id] = { name: username, channel: "Generale" };
    socket.join("Generale");

    io.to("Generale").emit("updateUsers", getUsersInChannel("Generale"));
    socket.broadcast.to("Generale").emit("new-user", socket.id);
  });

  socket.on("chatMessage", (msg) => {
    io.emit("chatMessage", { id: socket.id, msg });
  });

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

// --- SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server attivo su http://localhost:${PORT}`);
});
