// database.js
const sqlite3 = require('sqlite3').verbose();
// bcrypt is no longer strictly needed here if we're not hashing passwords for seeding local users.
// However, it's harmless to keep if you might re-introduce local admin creation or other hashing needs.
// For now, removing it for clarity if the user confirms it's only for Discord.
// const bcrypt = require('bcrypt'); // No longer needed for admin seeding in this model

// Connect to the SQLite database. It will create the the 'database.sqlite' file if it doesn't exist.
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Run SQL to create tables if they don't exist
        db.serialize(() => {
            // Users Table
            // 'password' column is now truly optional, only 'discord_id' matters for login
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE, -- Username might not be unique if Discord allows same names (but ID is unique)
                password TEXT, -- This column will likely be NULL for all users now
                discord_id TEXT UNIQUE NOT NULL, -- Discord ID is now the primary unique identifier for login
                avatar TEXT,
                is_admin INTEGER DEFAULT 0 -- 0 for false, 1 for true
            )`);

            // Halls Table
            db.run(`CREATE TABLE IF NOT EXISTS halls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )`);

            // Games Table
            db.run(`CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )`);

            // Tables Table
            db.run(`CREATE TABLE IF NOT EXISTS tables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                hall_name TEXT NOT NULL,
                FOREIGN KEY(hall_name) REFERENCES halls(name) ON DELETE CASCADE
            )`);

            // Bookings Table
            db.run(`CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_id INTEGER NOT NULL,
                booking_date TEXT NOT NULL, -- YYYY-MM-DD format
                game_id INTEGER, -- Nullable if game is optional
                player_count INTEGER NOT NULL,
                booked_by_user_id INTEGER NOT NULL,
                FOREIGN KEY(table_id) REFERENCES tables(id) ON DELETE CASCADE,
                FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE SET NULL,
                FOREIGN KEY(booked_by_user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // --- Initial Data Seeding ---

            // Seed a default admin user via Discord ID if one doesn't exist with that ID
            const MY_DISCORD_ID = '189818749006774272'; 
            const ADMIN_USERNAME = 'LankySi'; 

            db.get("SELECT COUNT(*) AS count FROM users WHERE discord_id = ?", [MY_DISCORD_ID], (err, row) => {
                if (err) {
                    console.error("Error checking for admin user by Discord ID:", err.message);
                    return;
                }
                if (row.count === 0) {
                    console.log(`No admin user found with Discord ID ${MY_DISCORD_ID}. Creating default admin...`);
                    // Note: No password column insert needed for Discord users
                    db.run("INSERT INTO users (discord_id, username, is_admin) VALUES (?, ?, ?)", [MY_DISCORD_ID, ADMIN_USERNAME, 1], (insertErr) => {
                        if (insertErr) {
                            console.error("Error creating default admin user:", insertErr.message);
                        } else {
                            console.log(`Default admin user created (Discord ID: ${MY_DISCORD_ID}, Username: ${ADMIN_USERNAME}). Login with Discord.`);
                        }
                    });
                } else {
                    console.log(`Admin user with Discord ID ${MY_DISCORD_ID} already exists.`);
                    // Optional: Update admin username if Discord username might change
                    db.run("UPDATE users SET username = ? WHERE discord_id = ?", [ADMIN_USERNAME, MY_DISCORD_ID], (updateErr) => {
                        if (updateErr) console.error("Error updating admin username:", updateErr.message);
                    });
                }
            });

            // Seed some default Halls if they don't exist
            db.get("SELECT COUNT(*) AS count FROM halls", (err, row) => {
                if (err) { console.error("Error checking for halls:", err.message); return; }
                if (row.count === 0) {
                    console.log('No halls found. Seeding default halls...');
                    db.run("INSERT INTO halls (name) VALUES ('Large Hall'), ('Small Hall')", (insertErr) => {
                        if (insertErr) { console.error("Error seeding default halls:", insertErr.message); }
                        else { console.log('Default halls seeded.'); }
                    });
                }
            });

            // Seed some default Games if they don't exist
            db.get("SELECT COUNT(*) AS count FROM games", (err, row) => {
                if (err) { console.error("Error checking for games:", err.message); return; }
                if (row.count === 0) {
                    console.log('No games found. Seeding default games...');
                    db.run("INSERT INTO games (name) VALUES ('Chess'), ('Checkers'), ('Monopoly'), ('Risk'), ('Catan'), ('Poker')", (insertErr) => {
                        if (insertErr) { console.error("Error seeding default games:", insertErr.message); }
                        else { console.log('Default games seeded.'); }
                    });
                }
            });

            // Seed some default Tables if they don't exist
            db.get("SELECT COUNT(*) AS count FROM tables", (err, row) => {
                if (err) { console.error("Error checking for tables:", err.message); return; }
                if (row.count === 0) {
                    console.log('No tables found. Seeding default tables...');
                    const stmt = db.prepare("INSERT INTO tables (name, hall_name) VALUES (?, ?)"); // CORRECTED: capacity removed
                    stmt.run('Table A1', 'Large Hall');
                    stmt.run('Table A2', 'Large Hall');
                    stmt.run('Table A3', 'Large Hall');
                    stmt.run('Table A4', 'Large Hall');
                    stmt.run('Table B1', 'Small Hall');
                    stmt.run('Table B2', 'Small Hall');
                    stmt.run('Table B3', 'Small Hall');
                    stmt.finalize((finalizeErr) => {
                        if (finalizeErr) { console.error("Error seeding default tables:", finalizeErr.message); }
                        else { console.log('Default tables seeded.'); }
                    });
                }
            });
        });
    }
});

// Export the database connection for use in other modules (like server.js)
module.exports = db;