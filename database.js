// database.js
const sqlite3 = require('sqlite3').verbose();
const DB_SOURCE = "rtg_bookings.db"; // This is your database file

let db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        // Cannot open database
        console.error(err.message);
        throw err;
    } else {
        console.log('Connected to the SQLite database.');
        // Enable foreign key constraints
        db.run(`PRAGMA foreign_keys = ON;`);

        // Use serialize to ensure table creation runs sequentially
        db.serialize(() => {
            createTables(db); // Call the function to create all tables
        });
    }
});

function createTables(db) {
    // 1. Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            discriminator TEXT,
            avatar TEXT,
            is_admin INTEGER DEFAULT 0
        )
    `, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        } else {
            console.log('Users table created or already exists.');
            // Optionally, insert a default admin user for testing if the table is new
            // This is just an example; you might have a different way to set admins
            db.get("SELECT count(*) AS count FROM users", (err, row) => {
                if (err) {
                    console.error('Error checking users count:', err.message);
                    return;
                }
                if (row.count === 0) {
                    console.log("No users found. You may need to log in to create an initial user.");
                    // Example: To create a specific admin user by Discord ID
                    // const adminDiscordId = process.env.ADMIN_DISCORD_ID; // From your .env file
                    // if (adminDiscordId) {
                    //     db.run("INSERT INTO users (discord_id, username, is_admin) VALUES (?, ?, ?)",
                    //         [adminDiscordId, "AdminUser", 1],
                    //         function(insertErr) {
                    //             if (insertErr) {
                    //                 console.error("Error inserting initial admin user:", insertErr.message);
                    //             } else {
                    //                 console.log(`Initial admin user inserted with ID: ${this.lastID}`);
                    //             }
                    //         }
                    //     );
                    // }
                }
            });
        }
    });

    // 2. Tables Table
    db.run(`
        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error('Error creating tables table:', err.message);
        } else {
            console.log('Tables table created or already exists.');
            // Insert default tables if the table is newly created and empty
            db.get("SELECT count(*) AS count FROM tables", (err, row) => {
                if (err) {
                    console.error('Error checking tables count:', err.message);
                    return;
                }
                if (row.count === 0) {
                    console.log("Inserting default tables...");
                    const defaultTables = ["Table A", "Table B", "Table C", "Table D", "Table E"];
                    defaultTables.forEach(tableName => {
                        db.run("INSERT INTO tables (name) VALUES (?)", [tableName], (insertErr) => {
                            if (insertErr) {
                                console.error(`Error inserting default table ${tableName}:`, insertErr.message);
                            }
                        });
                    });
                }
            });
        }
    });

    // 3. Games Table
    db.run(`
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error('Error creating games table:', err.message);
        } else {
            console.log('Games table created or already exists.');
            // Insert default games if the table is newly created and empty
            db.get("SELECT count(*) AS count FROM games", (err, row) => {
                if (err) {
                    console.error('Error checking games count:', err.message);
                    return;
                }
                if (row.count === 0) {
                    console.log("Inserting default games...");
                    const defaultGames = ["Dungeons & Dragons", "Magic: The Gathering", "Warhammer 40k", "Catan", "Monopoly"];
                    defaultGames.forEach(gameName => {
                        db.run("INSERT INTO games (name) VALUES (?)", [gameName], (insertErr) => {
                            if (insertErr) {
                                console.error(`Error inserting default game ${gameName}:`, insertErr.message);
                            }
                        });
                    });
                }
            });
        }
    });

    // 4. Bookings Table (Crucial for Phase 3)
    db.run(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL,
            game_id INTEGER NOT NULL,
            booking_date TEXT NOT NULL, -- YYYY-MM-DD format
            booked_by_user_id INTEGER NOT NULL,
            player_count INTEGER NOT NULL,
            UNIQUE (table_id, booking_date), -- A table can only be booked once per day
            UNIQUE (booked_by_user_id, booking_date), -- A user can only book once per day
            FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
            FOREIGN KEY (booked_by_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating bookings table:', err.message);
        } else {
            console.log('Bookings table created or already exists.');
        }
    });
}

// Export the database object for use in server.js
module.exports = db;