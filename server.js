// server.js (Revised - without Hall Management)
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const sqlite3 = require('sqlite3').verbose();
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session middleware setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'a_fallback_secret_if_env_is_missing',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Passport.js initialization
app.use(passport.initialize());
app.use(passport.session());

// --- Passport Discord Strategy (Only Strategy) ---
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'email', 'guilds']
},
function(accessToken, refreshToken, profile, cb) {
    db.get('SELECT * FROM users WHERE discord_id = ?', [profile.id], (err, user) => {
        if (err) { return cb(err); }
        if (user) {
            db.run('UPDATE users SET username = ?, avatar = ? WHERE id = ?', [profile.username, profile.avatar, user.id], (err) => {
                if (err) { return cb(err); }
                return cb(null, user);
            });
        } else {
            db.run('INSERT INTO users (discord_id, username, avatar, is_admin) VALUES (?, ?, ?, ?)',
                [profile.id, profile.username, profile.avatar, false],
                function(err) {
                    if (err) { return cb(err); }
                    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                        if (err) { return cb(err); }
                        return cb(null, newUser);
                    });
                }
            );
        }
    });
}));

// Passport Serialization/Deserialization
passport.serializeUser((user, done) => {
    done(null, { id: user.id, username: user.username, is_admin: user.is_admin });
});

passport.deserializeUser((userObj, done) => {
    done(null, userObj);
});

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/discord');
}

// Middleware to ensure user is an admin
function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.is_admin) {
        return next();
    }
    res.status(403).send('Forbidden: Admin access required.');
}

// --- Routes ---

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/profile');
    } else {
        res.redirect('/auth/discord');
    }
});

app.get('/login', (req, res) => {
    res.redirect('/auth/discord');
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/login' }),
    function(req, res) {
        res.redirect('/profile');
    }
);

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy((err) => {
            if (err) { return next(err); }
            res.clearCookie('connect.sid');
            res.redirect('/login');
        });
    });
});

// Profile Page
app.get('/profile', ensureAuthenticated, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Profile</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container">
                <h1>User Profile</h1>
                <p>Welcome, ${req.user.username}!</p>
                <p><a href="/logout">Logout</a></p>
                <hr>

                <section class="profile-section">
                    <h2>Bookings</h2>
                    <ul class="profile-links-list">
                        <li><a href="/bookings">Make a Booking</a></li>
                    </ul>
                </section>
                <hr>

                ${req.user.is_admin ? `
                    <section class="profile-section admin-section">
                        <h2>Admin</h2>
                        <ul class="profile-links-list">
                            <li><a href="/admin/tables">Manage Tables</a></li>
                            <li><a href="/admin/games">Manage Games</a></li>
                            <li><a href="/admin/all-bookings">View All Bookings</a></li>
                        </ul>
                    </section>
                    <hr>
                ` : ''}

                </div>
        </body>
        </html>
    `);
});

// Admin Dashboard (basic route)
app.get('/admin', ensureAdmin, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Dashboard</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container">
                <h1>Admin Dashboard</h1>
                <p>Welcome, Admin ${req.user.username}!</p>
                <p><a href="/profile">Back to Profile</a></p>
                <hr>
                <section class="admin-links">
                    <h2>Admin Actions</h2>
                    <ul>
                        <li><a href="/admin/tables">Manage Tables</a></li>
                        <li><a href="/admin/games">Manage Games</a></li>
                        <li><a href="/admin/all-bookings">View All Bookings</a></li>
                    </ul>
                </section>
            </div>
        </body>
        </html>
    `);
});

// Admin Manage Tables Page
app.get('/admin/tables', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'manage_tables.html'));
});

// Admin Manage Games Page
app.get('/admin/games', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'manage_games.html'));
});

// Admin View All Bookings Page
app.get('/admin/all-bookings', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'all_bookings.html'));
});

// API endpoint for Admin to fetch ALL bookings
app.get('/api/admin/all-bookings', ensureAdmin, async (req, res) => {
    try {
        const allBookings = await new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    b.id AS booking_id,
                    b.booking_date,
                    t.name AS table_name,
                    t.hall_name,
                    g.name AS game_name,
                    b.player_count,
                    u.username AS booked_by_username
                FROM bookings b
                JOIN tables t ON b.table_id = t.id
                JOIN users u ON b.booked_by_user_id = u.id
                LEFT JOIN games g ON b.game_id = g.id
                ORDER BY b.booking_date DESC, t.name ASC;
            `;
            db.all(sql, [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        res.json({ allBookings });
    } catch (error) {
        console.error('Error fetching all bookings:', error);
        res.status(500).json({ message: 'Failed to fetch all bookings.', error: error.message });
    }
});

// API endpoint for Admin to fetch all games
app.get('/api/admin/games', ensureAdmin, async (req, res) => {
    try {
        const games = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM games ORDER BY name", [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        res.json({ games });
    } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({ message: 'Failed to fetch games.', error: error.message });
    }
});

// API endpoint for Admin to add a new game
app.post('/api/admin/games', ensureAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Game name is required.' });
    }
    try {
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO games (name) VALUES (?)", [name], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return reject(new Error('A game with this name already exists.'));
                    }
                    return reject(err);
                }
                resolve(this.lastID);
            });
        });
        res.status(201).json({ message: 'Game added successfully.' });
    } catch (error) {
        console.error('Error adding game:', error);
        res.status(500).json({ message: error.message });
    }
});

// API endpoint for Admin to edit a game
app.put('/api/admin/games/:id', ensureAdmin, async (req, res) => {
    const gameId = req.params.id;
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Game name is required.' });
    }
    try {
        await new Promise((resolve, reject) => {
            db.run("UPDATE games SET name = ? WHERE id = ?", [name, gameId], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return reject(new Error('A game with this name already exists.'));
                    }
                    return reject(err);
                }
                resolve(this.changes);
            });
        });
        res.json({ message: 'Game updated successfully.' });
    } catch (error) {
        console.error('Error updating game:', error);
        res.status(500).json({ message: 'Failed to update game.', error: error.message });
    }
});

// API endpoint for Admin to delete a game
app.delete('/api/admin/games/:id', ensureAdmin, async (req, res) => {
    const gameId = req.params.id;
    try {
        await new Promise((resolve, reject) => {
            db.run("DELETE FROM games WHERE id = ?", [gameId], function(err) {
                if (err) return reject(err);
                resolve(this.changes);
            });
        });
        res.json({ message: 'Game deleted successfully.' });
    } catch (error) {
        console.error('Error deleting game:', error);
        res.status(500).json({ message: 'Failed to delete game.', error: error.message });
    }
});

// API endpoint for Admin to fetch all halls (for table creation dropdown)
app.get('/api/admin/halls', ensureAdmin, async (req, res) => {
    try {
        const halls = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM halls ORDER BY name", [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        res.json({ halls });
    } catch (error) {
        console.error('Error fetching halls:', error);
        res.status(500).json({ message: 'Failed to fetch halls.', error: error.message });
    }
});

// API endpoint for Admin to fetch all tables (UPDATED)
app.get('/api/admin/tables', ensureAdmin, async (req, res) => {
    try {
        const tables = await new Promise((resolve, reject) => {
            db.all("SELECT id, name, hall_name FROM tables ORDER BY hall_name, name", [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        res.json({ tables });
    } catch (error) {
        console.error('Error fetching tables:', error);
        res.status(500).json({ message: 'Failed to fetch tables.', error: error.message });
    }
});

// API endpoint for Admin to add a new table (UPDATED)
app.post('/api/admin/tables', ensureAdmin, async (req, res) => {
    const { name, hall_name } = req.body; // Capacity removed
    if (!name || !hall_name) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    try {
        await new Promise((resolve, reject) => {
            // capacity removed from the INSERT statement
            db.run("INSERT INTO tables (name, hall_name) VALUES (?, ?)", [name, hall_name], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return reject(new Error('A table with this name already exists.'));
                    }
                    return reject(err);
                }
                resolve(this.lastID);
            });
        });
        res.status(201).json({ message: 'Table added successfully.' });
    } catch (error) {
        console.error('Error adding table:', error);
        res.status(500).json({ message: error.message });
    }
});

// API endpoint for Admin to edit a table
app.put('/api/admin/tables/:id', ensureAdmin, async (req, res) => {
    const tableId = req.params.id;
    const { name, hall_name } = req.body;
    if (!name || !hall_name) {
        return res.status(400).json({ message: 'Table name and hall are required.' });
    }
    try {
        await new Promise((resolve, reject) => {
            db.run("UPDATE tables SET name = ?, hall_name = ? WHERE id = ?", [name, hall_name, tableId], function(err) {
                if (err) return reject(err);
                resolve(this.changes);
            });
        });
        res.json({ message: 'Table updated successfully.' });
    } catch (error) {
        console.error('Error updating table:', error);
        res.status(500).json({ message: 'Failed to update table.', error: error.message });
    }
});

// API endpoint for Admin to delete a table
app.delete('/api/admin/tables/:id', ensureAdmin, async (req, res) => {
    const tableId = req.params.id;
    try {
        await new Promise((resolve, reject) => {
            db.run("DELETE FROM tables WHERE id = ?", [tableId], function(err) {
                if (err) return reject(err);
                resolve(this.changes);
            });
        });
        res.json({ message: 'Table deleted successfully.' });
    } catch (error) {
        console.error('Error deleting table:', error);
        res.status(500).json({ message: 'Failed to delete table.', error: error.message });
    }
});

// API endpoint for Admin to cancel any booking
app.delete('/api/admin/bookings/:id', ensureAdmin, async (req, res) => {
    const booking_id = req.params.id;
    if (!booking_id) {
        return res.status(400).json({ message: 'Booking ID is required.' });
    }
    try {
        const result = await new Promise((resolve, reject) => {
            db.run("DELETE FROM bookings WHERE id = ?", [booking_id], function(err) {
                if (err) return reject(err);
                resolve(this);
            });
        });

        if (result.changes > 0) {
            res.json({ success: true, message: 'Booking cancelled successfully by admin.' });
        } else {
            res.status(404).json({ message: 'Booking not found or already cancelled.' });
        }
    } catch (error) {
        console.error('Error cancelling booking by admin:', error);
        res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
    }
});

// Book a Table Page (main booking interface)
app.get('/bookings', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bookings.html'));
});

// API endpoint to get current user details for client-side JS (for bookings.js)
app.get('/api/current-user', ensureAuthenticated, (req, res) => {
    res.json({
        id: req.user.id,
        username: req.user.username,
        isAdmin: req.user.is_admin
    });
});

// API endpoint to get game options for client-side JS (for bookings.js)
app.get('/api/game-options', async (req, res) => {
    try {
        const games = await new Promise((resolve, reject) => {
            db.all("SELECT id, name FROM games ORDER BY name", [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        res.json({ games });
    } catch (error) {
        console.error('Error fetching game options:', error);
        res.status(500).json({ message: 'Failed to fetch game options.', error: error.message });
    }
});

// API endpoint for fetching table availability
app.get('/api/tables/availability', ensureAuthenticated, async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'Date parameter is required.' });
    }
    try {
        const tables = await new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    t.id AS table_id,
                    t.name AS table_name,
                    t.hall_name,
                    b.id AS booking_id,
                    b.game_id,
                    b.player_count,
                    b.booked_by_user_id
                FROM tables t
                LEFT JOIN bookings b ON t.id = b.table_id AND b.booking_date = ?;
            `;
            db.all(sql, [date], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        res.json({ tables });
    } catch (error) {
        console.error('Error fetching table availability:', error);
        res.status(500).json({ message: 'Failed to fetch table availability.', error: error.message });
    }
});

// API endpoint for making a booking
app.post('/api/book-table', ensureAuthenticated, async (req, res) => {
    const { tableId, bookingDate, gameId, playerCount } = req.body;
    const userId = req.user.id;
    if (!tableId || !bookingDate || !gameId || !playerCount) {
        return res.status(400).json({ message: 'Missing required booking information.' });
    }
    try {
        const existingBooking = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM bookings WHERE table_id = ? AND booking_date = ?", [tableId, bookingDate], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
        if (existingBooking) {
            return res.status(409).json({ message: 'This table is already booked for the selected date.' });
        }
        await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO bookings (table_id, booking_date, game_id, player_count, booked_by_user_id) VALUES (?, ?, ?, ?, ?)",
                [tableId, bookingDate, gameId, playerCount, userId],
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
        res.json({ success: true, message: 'Table booked successfully!' });
    } catch (error) {
        console.error('Error booking table:', error);
        res.status(500).json({ message: 'Failed to book table.', error: error.message });
    }
});

// GET endpoint to fetch all future bookings for the logged-in user
app.get('/api/user/bookings', ensureAuthenticated, async (req, res) => {
    const user_id = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    try {
        const bookings = await new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    b.id AS booking_id,
                    b.booking_date,
                    t.name AS table_name,
                    t.hall_name,
                    g.name AS game_name,
                    b.player_count
                FROM bookings b
                JOIN tables t ON b.table_id = t.id
                LEFT JOIN games g ON b.game_id = g.id
                WHERE b.booked_by_user_id = ? AND b.booking_date >= ?
                ORDER BY b.booking_date, t.name;
            `;
            db.all(sql, [user_id, today], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        res.json({ userBookings: bookings });
    } catch (error) {
            console.error('Error fetching user bookings:', error);
        res.status(500).json({ message: 'Failed to fetch your bookings.', error: error.message });
    }
});

// DELETE endpoint for users to cancel a booking
app.delete('/api/bookings/:id', ensureAuthenticated, async (req, res) => {
    const booking_id = req.params.id;
    const user_id = req.user.id;
    if (!booking_id) {
        return res.status(400).json({ message: 'Booking ID is required.' });
    }
    try {
        const bookingExists = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM bookings WHERE id = ? AND booked_by_user_id = ?", [booking_id, user_id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
        if (!bookingExists) {
            return res.status(404).json({ message: 'Booking not found or you do not have permission to cancel this booking.' });
        }
        const result = await new Promise((resolve, reject) => {
            db.run("DELETE FROM bookings WHERE id = ?", [booking_id], function(err) {
                if (err) return reject(err);
                resolve(this);
            });
        });
        if (result.changes > 0) {
            res.json({ success: true, message: 'Booking cancelled successfully!' });
        } else {
            res.status(404).json({ message: 'Booking not found or already cancelled.' });
        }
    } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});