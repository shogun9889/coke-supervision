const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

/*
  This config works for:
  1) Local MySQL on your PC using .env:
     DB_HOST=localhost
     DB_PORT=3306
     DB_USER=root
     DB_PASSWORD=your_password
     DB_NAME=coke_sampling

  2) Online MySQL using Render/Aiven variables:
     MYSQLHOST=...
     MYSQLPORT=...
     MYSQLUSER=...
     MYSQLPASSWORD=...
     MYSQLDATABASE=...
     DB_SSL=true
*/

const db = mysql.createPool({
    host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
    port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQLUSER || process.env.DB_USER || "root",
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || "coke_sampling",

    // Needed for many online MySQL providers like Aiven
    ssl: process.env.DB_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initializeDatabase() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS visitors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(100),
            visitor_name VARCHAR(100),
            ip_address VARCHAR(100),
            device TEXT,
            entered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS events_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(100),
            event_type VARCHAR(100),
            cycle_step VARCHAR(100),
            details JSON,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS current_state (
            id INT PRIMARY KEY,
            cycle_step VARCHAR(100),
            niveau FLOAT,
            niveau_tremie FLOAT,
            temp_mesure FLOAT,
            vis_speed INT,
            ev1_state BOOLEAN,
            ev2_state BOOLEAN,
            pompe_active BOOLEAN,
            malaxeur_active BOOLEAN,
            ventilo_active BOOLEAN,
            bande_moving BOOLEAN,
            c10_active BOOLEAN,
            c11_active BOOLEAN,
            alarm BOOLEAN,
            alarm_msg VARCHAR(255),
            faults JSON,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS alarms_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(100),
            alarm_type VARCHAR(100),
            alarm_msg VARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        INSERT IGNORE INTO current_state (
            id,
            cycle_step,
            niveau,
            niveau_tremie,
            temp_mesure,
            vis_speed,
            ev1_state,
            ev2_state,
            pompe_active,
            malaxeur_active,
            ventilo_active,
            bande_moving,
            c10_active,
            c11_active,
            alarm,
            alarm_msg,
            faults
        )
        VALUES (
            1,
            'IDLE',
            0,
            100,
            25.0,
            0,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            '',
            '{}'
        )
    `);

    console.log("Database initialized successfully");
}

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Server is working"
    });
});

app.get("/api/db-test", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT NOW() AS db_time");

        res.json({
            status: "OK",
            database_time: rows[0].db_time
        });
    } catch (error) {
        console.error("Database test error:", error);

        res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});

app.post("/api/visitor", async (req, res) => {
    try {
        const { sessionId, visitorName, device } = req.body;

        const ip =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "unknown";

        await db.query(
            `
            INSERT INTO visitors (
                session_id,
                visitor_name,
                ip_address,
                device
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                sessionId || "",
                visitorName || "Unknown",
                ip,
                device || ""
            ]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error("Visitor save error:", error);

        res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});

app.post("/api/event", async (req, res) => {
    try {
        const { sessionId, eventType, cycleStep, details } = req.body;

        await db.query(
            `
            INSERT INTO events_history (
                session_id,
                event_type,
                cycle_step,
                details
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                sessionId || "",
                eventType || "UNKNOWN_EVENT",
                cycleStep || "UNKNOWN_STEP",
                JSON.stringify(details || {})
            ]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error("Event save error:", error);

        res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});

app.post("/api/state", async (req, res) => {
    try {
        const s = req.body;

        await db.query(
            `
            UPDATE current_state
            SET
                cycle_step = ?,
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
            WHERE id = 1
            `,
            [
                s.cycleStep || "IDLE",
                Number(s.niveau || 0),
                Number(s.niveauTremie || 0),
                Number(s.tempMesure || 0),
                Number(s.visSpeed || 0),
                Boolean(s.ev1State),
                Boolean(s.ev2State),
                Boolean(s.pompeActive),
                Boolean(s.malaxeurActive),
                Boolean(s.ventiloActive),
                Boolean(s.bandeMoving),
                Boolean(s.c10Active),
                Boolean(s.c11Active),
                Boolean(s.alarm),
                s.alarmMsg || "",
                JSON.stringify(s.faults || {})
            ]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error("State save error:", error);

        res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});

app.post("/api/alarm", async (req, res) => {
    try {
        const { sessionId, alarmType, alarmMsg } = req.body;

        await db.query(
            `
            INSERT INTO alarms_history (
                session_id,
                alarm_type,
                alarm_msg
            )
            VALUES (?, ?, ?)
            `,
            [
                sessionId || "",
                alarmType || "UNKNOWN_ALARM",
                alarmMsg || ""
            ]
        );

        res.json({ status: "OK" });
    } catch (error) {
        console.error("Alarm save error:", error);

        res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});
app.get("/api/debug/data", async (req, res) => {
    try {
        const [visitors] = await db.query(
            "SELECT * FROM visitors ORDER BY entered_at DESC LIMIT 10"
        );

        const [events] = await db.query(
            "SELECT * FROM events_history ORDER BY created_at DESC LIMIT 20"
        );

        const [state] = await db.query(
            "SELECT * FROM current_state WHERE id = 1"
        );

        const [alarms] = await db.query(
            "SELECT * FROM alarms_history ORDER BY created_at DESC LIMIT 10"
        );

        res.json({
            visitors,
            events,
            current_state: state,
            alarms
        });
    } catch (error) {
        console.error("Debug data error:", error);
        res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});
initializeDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Local URL: http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Database initialization failed:", error);
        process.exit(1);
    });