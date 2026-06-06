const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.get("/api/health", (req, res) => {
    res.json({ status: "OK", message: "Server is working" });
});

app.get("/api/db-test", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT NOW() AS db_time");
		res.json({ status: "OK", database_time: rows[0].db_time });	
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

app.post("/api/visitor", async (req, res) => {
    try {
        const { sessionId, visitorName, device } = req.body;
        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

        await db.query(
            `INSERT INTO visitors (session_id, visitor_name, ip_address, device)
             VALUES (?, ?, ?, ?)`,
            [sessionId, visitorName || "Unknown", ip, device || ""]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

app.post("/api/event", async (req, res) => {
    try {
        const { sessionId, eventType, cycleStep, details } = req.body;

        await db.query(
            `INSERT INTO events_history (session_id, event_type, cycle_step, details)
             VALUES (?, ?, ?, ?)`,
            [
                sessionId,
                eventType,
                cycleStep,
                JSON.stringify(details || {})
            ]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

app.post("/api/state", async (req, res) => {
    try {
        const s = req.body;

        await db.query(
            `UPDATE current_state
             SET cycle_step = ?,
                 niveau = ?,
                 niveau_tremie = ?,
                 temp_mesure = ?,
                 vis_speed = ?,
                 ev1_state = ?,
                 ev2_state = ?,
                 pompe_active = ?,
                 malaxeur_active = ?,
                 ventilo_active = ?,
                 bande_moving = ?,
                 c10_active = ?,
                 c11_active = ?,
                 alarm = ?,
                 alarm_msg = ?,
                 faults = ?
             WHERE id = 1`,
            [
                s.cycleStep,
                s.niveau,
                s.niveauTremie,
                s.tempMesure,
                s.visSpeed,
                s.ev1State,
                s.ev2State,
                s.pompeActive,
                s.malaxeurActive,
                s.ventiloActive,
                s.bandeMoving,
                s.c10Active,
                s.c11Active,
                s.alarm,
                s.alarmMsg || "",
                JSON.stringify(s.faults || {})
            ]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

app.post("/api/alarm", async (req, res) => {
    try {
        const { sessionId, alarmType, alarmMsg } = req.body;

        await db.query(
            `INSERT INTO alarms_history (session_id, alarm_type, alarm_msg)
             VALUES (?, ?, ?)`,
            [sessionId, alarmType, alarmMsg]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});