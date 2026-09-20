const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mineflayer = require("mineflayer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

let bot = null;
let botOnline = false;
let reconnectTimer = null;

let config = {
    host: "localhost",
    port: 25565,
    username: "WebBot",
    version: false,
    autoReconnect: true
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function broadcastLog(message, type = "info") {
    const time = new Date().toLocaleTimeString();

    io.emit("log", {
        time,
        message,
        type
    });

    console.log(`[${time}] ${message}`);
}

function broadcastStatus() {
    io.emit("status", {
        online: botOnline,
        username: config.username,
        host: config.host,
        port: config.port
    });
}

function createBot() {
    if (bot) {
        broadcastLog("Bot already exists.", "error");
        return;
    }

    broadcastLog(
        `Connecting ${config.username} to ${config.host}:${config.port}...`,
        "info"
    );

    const options = {
        host: config.host,
        port: Number(config.port),
        username: config.username
    };

    if (config.version) {
        options.version = config.version;
    }

    bot = mineflayer.createBot(options);

    bot.once("spawn", () => {
        botOnline = true;

        broadcastLog(
            `Bot joined the server as ${config.username}.`,
            "success"
        );

        broadcastStatus();
    });

    bot.on("message", message => {
        broadcastLog(message.toString(), "minecraft");
    });

    bot.on("kicked", reason => {
        broadcastLog(
            `Bot was kicked: ${reason}`,
            "error"
        );
    });

    bot.on("error", error => {
        broadcastLog(
            `Bot error: ${error.message}`,
            "error"
        );
    });

    bot.on("end", () => {
        botOnline = false;
        bot = null;

        broadcastLog(
            "Bot disconnected.",
            "error"
        );

        broadcastStatus();

        if (config.autoReconnect) {
            broadcastLog(
                "Reconnecting in 5 seconds...",
                "info"
            );

            clearTimeout(reconnectTimer);

            reconnectTimer = setTimeout(() => {
                if (!bot) {
                    createBot();
                }
            }, 5000);
        }
    });
}

function stopBot() {
    clearTimeout(reconnectTimer);

    if (!bot) {
        botOnline = false;
        broadcastStatus();

        broadcastLog(
            "Bot is already offline.",
            "error"
        );

        return;
    }

    config.autoReconnect = false;

    broadcastLog(
        "Stopping bot...",
        "info"
    );

    try {
        bot.quit("Stopped from control panel");
    } catch {}

    bot = null;
    botOnline = false;

    broadcastStatus();

    broadcastLog(
        "Bot stopped.",
        "success"
    );

    setTimeout(() => {
        config.autoReconnect = true;
    }, 1000);
}

function restartBot() {
    broadcastLog(
        "Restarting bot...",
        "info"
    );

    if (bot) {
        config.autoReconnect = false;

        try {
            bot.quit("Restarting");
        } catch {}

        bot = null;
        botOnline = false;

        broadcastStatus();
    }

    setTimeout(() => {
        config.autoReconnect = true;
        createBot();
    }, 1500);
}


/* SOCKET CONNECTION */

io.on("connection", socket => {

    broadcastStatus();

    socket.emit("config", config);

    socket.on("start", () => {
        config.autoReconnect = true;

        if (!bot) {
            createBot();
        } else {
            broadcastLog(
                "Bot is already running.",
                "error"
            );
        }
    });

    socket.on("stop", () => {
        stopBot();
    });

    socket.on("restart", () => {
        restartBot();
    });

    socket.on("command", command => {

        if (!bot || !botOnline) {
            broadcastLog(
                "Cannot send command: bot is offline.",
                "error"
            );
            return;
        }

        if (!command.trim()) {
            return;
        }

        broadcastLog(
            `> ${command}`,
            "command"
        );

        bot.chat(command);
    });

    socket.on("updateConfig", newConfig => {

        if (typeof newConfig.host === "string") {
            config.host = newConfig.host.trim();
        }

        if (newConfig.port) {
            config.port = Number(newConfig.port);
        }

        if (typeof newConfig.username === "string") {
            config.username = newConfig.username.trim();
        }

        if (typeof newConfig.version === "string") {
            config.version = newConfig.version.trim() || false;
        }

        broadcastLog(
            "Configuration updated.",
            "success"
        );

        broadcastStatus();
    });
});


server.listen(PORT, () => {

    console.log("");
    console.log("================================");
    console.log(" Minecraft Web Bot");
    console.log("================================");
    console.log("");
    console.log(`Control panel: http://localhost:${PORT}`);
    console.log("");
});
