// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const sqlite3 = require('sqlite3').verbose(); // Import sqlite3
const db = require('./database'); // Import your database connection

const app = express();

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (e.g., styles.css)
app.use(express.static('public'));

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 60 * 60 * 1000 * 24 // 24 hours
    }
}));

// Passport.js setup
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Discord Strategy
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds'] // Added guilds scope for future potential features
},
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE discord_id = ?`, [profile.id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (user) {
            // Update user details in case they changed
            await new Promise((resolve, reject) => {
                db.run(`UPDATE users SET username = ?, discriminator = ?, avatar = ? WHERE id = ?`,
                    [profile.username, profile.discriminator, profile.avatar, user.id],
                    function(err) {
                        if (err) return reject(err);
                        resolve();
                    }
                );
            });
            // Re-fetch updated user to ensure correct data is returned
            user = await new Promise((resolve, reject) => {
                db.get(`SELECT * FROM users WHERE discord_id = ?`, [profile.id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
        } else {
            // New user, insert into database
            user = await new Promise((resolve, reject) => {
                db.run(`INSERT INTO users (discord_id, username, discriminator, avatar, is_admin) VALUES (?, ?, ?, ?, ?)`,
                    [profile.id, profile.username, profile.discriminator, profile.avatar, 0], // Default is_admin to 0
                    function(err) {
                        if (err) return reject(err);
                        db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (err, row) => {
                            if (err) return reject(err);
                            resolve(row);
                        });
                    }
                );
            });
        }

        // Check if the user is an admin based on ADMIN_DISCORD_ID from .env
        if (profile.id === process.env.ADMIN_DISCORD_ID) {
            // Ensure the user is marked as admin in DB if they match the admin ID
            if (user.is_admin === 0) {
                 await new Promise((resolve, reject) => {
                    db.run(`UPDATE users SET is_admin = 1 WHERE discord_id = ?`, [profile.id], function(err) {
                        if (err) return reject(err);
                        console.log(`User ${profile.username} (${profile.id}) set to admin status.`);
                        user.is_admin = 1; // Update user object in memory
                        resolve();
                    });
                });
            }
        }
        done(null, user);
    } catch (err) {
        done(err);
    }
}));

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}

// Middleware to check if user is admin
function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.is_admin) {
        return next();
    }
    res.status(403).send('Access Denied: Admins only.');
}

// Routes
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/profile');
    } else {
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>RTG Bookings</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div class="container">
                    <h1>Welcome to RTG Bookings</h1>
                    <p>Please log in with Discord to manage your table bookings.</p>
                    <a href="/auth/discord" class="btn">Login with Discord</a>
                </div>
            </body>
            </html>
        `);
    }
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => {
        // Successful authentication, redirect to profile.
        res.redirect('/profile');
    }
);

app.get('/profile', ensureAuthenticated, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>User Profile</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container">
                <h1>Welcome, ${req.user.username}!</h1>
                <p>Discord ID: ${req.user.discord_id}</p>
                ${req.user.avatar ? `<img src="https://cdn.discordapp.com/avatars/${req.user.discord_id}/${req.user.avatar}.png?size=128" alt="User Avatar" class="avatar">` : ''}
                <p>Admin Status: ${req.user.is_admin ? 'Yes' : 'No'}</p>

                <div class="profile-links">
                    <a href="/bookings" class="btn">Make a Booking</a>
                    ${req.user.is_admin ? `
                        <a href="/admin/tables" class="btn admin-btn">Manage Tables (Admin Only)</a>
                        <a href="/admin/games" class="btn admin-btn">Manage Games (Admin Only)</a>
                        <a href="/admin/bookings" class="btn admin-btn">View All Bookings (Admin Only)</a>
                        <a href="/admin/halls">Manage Hall Bookings (Admin Only)</a>
                    ` : ''}
                    <a href="/logout" class="btn logout-btn">Logout</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
                return next(err);
            }
            res.redirect('/');
        });
    });
});

// Admin Panel Dashboard Route
app.get('/admin', ensureAuthenticated, (req, res) => {
    // Ensure only admins can access this page
    if (!req.user.is_admin) {
        return res.status(403).send('Forbidden'); // Or redirect to profile
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Panel</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container">
                <h1>Admin Panel</h1>
                <p><a href="/profile">Back to Profile</a></p>
                <h2>Admin Tools</h2>
                <ul>
                    <li><a href="/admin/users">Manage Users</a></li>
                    <li><a href="/admin/games">Manage Games</a></li>
                    <li><a href="/admin/halls">Manage Hall Bookings</a></li>
                    </ul>
            </div>
        </body>
        </html>
    `);
});

// Admin Tables Route
app.get('/admin/tables', ensureAdmin, async (req, res) => {
    try {
        const tables = await new Promise((resolve, reject) => {
            // Order by name, casting it to an INTEGER for numerical sort
            db.all("SELECT id, name FROM tables ORDER BY CAST(name AS INTEGER)", [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Manage Tables</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div class="container">
                    <h1>Manage Tables (Admin)</h1>
                    <p><a href="/profile">Back to Profile</a></p>

                    <h2>Add New Table</h2>
                    <form id="addTableForm">
                        <input type="text" id="tableName" placeholder="New Table Name" required>
                        <button type="submit">Add Table</button>
                    </form>

                    <h2>Existing Tables</h2>
                    <ul id="tableList">
                        ${tables.map(table => `
                            <li>
                                ${table.name}
                                <button onclick="deleteTable(${table.id})">Delete</button>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <script>
                    const addTableForm = document.getElementById('addTableForm');
                    const tableNameInput = document.getElementById('tableName');
                    const tableList = document.getElementById('tableList');

                    addTableForm.addEventListener('submit', async (event) => {
                        event.preventDefault();
                        const tableName = tableNameInput.value;

                        try {
                            const response = await fetch('/api/add-table', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: tableName })
                            });
                            const data = await response.json();
                            if (!response.ok) {
                                throw new Error(data.message || 'Failed to add table');
                            }
                            alert(data.message);
                            tableNameInput.value = '';
                            location.reload(); // Simple reload to refresh list
                        } catch (error) {
                            console.error('Error adding table:', error);
                            alert('Error adding table: ' + error.message);
                        }
                    });

                    async function deleteTable(tableId) {
                        if (!confirm('Are you sure you want to delete this table?')) {
                            return;
                        }
                        try {
                            const response = await fetch('/api/delete-table', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: tableId })
                            });
                            const data = await response.json();
                            if (!response.ok) {
                                throw new Error(data.message || 'Failed to delete table');
                            }
                            alert(data.message);
                            location.reload(); // Simple reload to refresh list
                        } catch (error) {
                            console.error('Error deleting table:', error);
                            alert('Error deleting table: ' + error.message);
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error in /admin/tables route:', error);
        res.status(500).send('Server error loading admin tables page.');
    }
});

app.get('/admin/halls', ensureAuthenticated, (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).send('Forbidden');
    }
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Hall Management</title>
            <link rel="stylesheet" href="/styles.css">
            <style>
                /* Styles for the new admin page */
                .hall-status {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Admin Hall Management</h1>
                <p><a href="/admin">Back to Admin Panel</a></p>

                <div class="hall-status">
                    <h3>Disable Small Hall for a Tuesday:</h3>
                    <select id="tuesdaySelect"></select>
                    <button id="toggleBtn" data-status="enable">Enable Small Hall</button>
                </div>
                <p id="feedback-message"></p>
                <hr style="margin-top: 20px;">
                <h3>Currently Disabled Dates:</h3>
                <ul id="disabledDatesList"></ul>
            </div>
            <script>
                const tuesdaySelect = document.getElementById('tuesdaySelect');
                const toggleBtn = document.getElementById('toggleBtn');
                const feedbackMsg = document.getElementById('feedback-message');
                const disabledDatesList = document.getElementById('disabledDatesList');

                function getNextNTuesdays(n) {
                    const dates = [];
                    let d = new Date();
                    d.setHours(0, 0, 0, 0);
                    let dayOfWeek = d.getDay();
                    const tuesday = 2;
                    let daysToAdd = (tuesday - dayOfWeek + 7) % 7;
                    if (daysToAdd === 0 && dayOfWeek !== tuesday) { daysToAdd = 7; }
                    let currentTuesday = new Date(d.getTime());
                    currentTuesday.setDate(d.getDate() + daysToAdd);
                    for (let i = 0; i < n; i++) {
                        const nextTuesday = new Date(currentTuesday.getTime());
                        nextTuesday.setDate(currentTuesday.getDate() + (i * 7));
                        dates.push(nextTuesday);
                    }
                    return dates;
                }

                function formatDate(date) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return year + '-' + month + '-' + day;
                }

                async function fetchDisabledDates() {
                    try {
                        const response = await fetch('/api/admin/disabled-halls');
                        const data = await response.json();
                        if (!response.ok) {
                            throw new Error(data.message || 'Failed to fetch disabled dates.');
                        }
                        return data.dates;
                    } catch (error) {
                        console.error('Error fetching disabled dates:', error);
                        return [];
                    }
                }

                function updateUI(disabledDates) {
                    tuesdaySelect.innerHTML = '';
                    const nextFourTuesdays = getNextNTuesdays(4);

                    nextFourTuesdays.forEach(date => {
                        const formattedDate = formatDate(date);
                        const option = document.createElement('option');
                        option.value = formattedDate;
                        option.innerText = date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
                        tuesdaySelect.appendChild(option);
                    });

                    const selectedDate = tuesdaySelect.value;
                    const isDisabled = disabledDates.includes(selectedDate);
                    toggleBtn.innerText = isDisabled ? 'Enable Small Hall' : 'Disable Small Hall';
                    toggleBtn.dataset.status = isDisabled ? 'enable' : 'disable';

                    disabledDatesList.innerHTML = '';
                    if (disabledDates.length > 0) {
                        disabledDates.forEach(date => {
                            const li = document.createElement('li');
                            li.innerText = date;
                            disabledDatesList.appendChild(li);
                        });
                    } else {
                        disabledDatesList.innerHTML = '<li>No dates are currently disabled.</li>';
                    }
                }

                async function toggleHallStatus() {
                    const selectedDate = tuesdaySelect.value;
                    const status = toggleBtn.dataset.status === 'disable';
                    try {
                        const response = await fetch('/api/admin/toggle-small-hall', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ booking_date: selectedDate, disable: status })
                        });
                        const data = await response.json();
                        if (!response.ok) {
                            throw new Error(data.message || 'Failed to update status.');
                        }
                        feedbackMsg.innerText = data.message;
                        feedbackMsg.style.color = 'green';
                        const disabledDates = await fetchDisabledDates();
                        updateUI(disabledDates);
                    } catch (error) {
                        feedbackMsg.innerText = error.message;
                        feedbackMsg.style.color = 'red';
                    }
                }

                document.addEventListener('DOMContentLoaded', async () => {
                    const disabledDates = await fetchDisabledDates();
                    updateUI(disabledDates);
                    tuesdaySelect.addEventListener('change', async () => {
                        const selectedDate = tuesdaySelect.value;
                        const disabledDates = await fetchDisabledDates();
                        const isDisabled = disabledDates.includes(selectedDate);
                        toggleBtn.innerText = isDisabled ? 'Enable Small Hall' : 'Disable Small Hall';
                        toggleBtn.dataset.status = isDisabled ? 'enable' : 'disable';
                    });
                    toggleBtn.addEventListener('click', toggleHallStatus);
                });
            </script>
        </body>
        </html>
    `);
});

app.get('/api/admin/disabled-halls', ensureAuthenticated, (req, res) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    db.all("SELECT booking_date FROM disabled_halls", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: "Failed to fetch disabled dates." });
        }
        const dates = rows.map(row => row.booking_date);
        res.json({ dates });
    });
});

// Admin Games Route
app.get('/admin/games', ensureAdmin, async (req, res) => {
    try {
        const games = await new Promise((resolve, reject) => {
            db.all("SELECT id, name FROM games", [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Manage Games</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div class="container">
                    <h1>Manage Games (Admin)</h1>
                    <p><a href="/profile">Back to Profile</a></p>

                    <h2>Add New Game</h2>
                    <form id="addGameForm">
                        <input type="text" id="gameName" placeholder="New Game Name" required>
                        <button type="submit">Add Game</button>
                    </form>

                    <h2>Existing Games</h2>
                    <ul id="gameList">
                        ${games.map(game => `
                            <li>
                                ${game.name}
                                <button onclick="deleteGame(${game.id})">Delete</button>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <script>
                    const addGameForm = document.getElementById('addGameForm');
                    const gameNameInput = document.getElementById('gameName');
                    const gameList = document.getElementById('gameList');

                    addGameForm.addEventListener('submit', async (event) => {
                        event.preventDefault();
                        const gameName = gameNameInput.value;

                        try {
                            const response = await fetch('/api/add-game', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: gameName })
                            });
                            const data = await response.json();
                            if (!response.ok) {
                                throw new Error(data.message || 'Failed to add game');
                            }
                            alert(data.message);
                            gameNameInput.value = '';
                            location.reload(); // Simple reload to refresh list
                        } catch (error) {
                            console.error('Error adding game:', error);
                            alert('Error adding game: ' + error.message);
                        }
                    });

                    async function deleteGame(gameId) {
                        if (!confirm('Are you sure you want to delete this game?')) {
                            return;
                        }
                        try {
                            const response = await fetch('/api/delete-game', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: gameId })
                            });
                            const data = await response.json();
                            if (!response.ok) {
                                throw new Error(data.message || 'Failed to delete game');
                            }
                            alert(data.message);
                            location.reload(); // Simple reload to refresh list
                        } catch (error) {
                            console.error('Error deleting game:', error);
                            alert('Error deleting game: ' + error.message);
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error in /admin/games route:', error);
        res.status(500).send('Server error loading admin games page.');
    }
});

// Admin Bookings Route (New for Phase 4)
app.get('/admin/bookings', ensureAdmin, async (req, res) => {
    try {
        // No specific data needs to be fetched server-side for initial page load,
        // as client-side will fetch all bookings via API
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Manage All Bookings</title>
                <link rel="stylesheet" href="/styles.css">
                <style>
                    /* Basic table styling for admin bookings */
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #f2f2f2;
                    }
                    .cancel-btn {
                        background-color: #dc3545;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .cancel-btn:hover {
                        background-color: #c82333;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Manage All Bookings (Admin)</h1>
                    <p><a href="/profile">Back to Profile</a></p>

                    <div id="allBookingsList">
                        Loading all bookings...
                    </div>
                </div>

                <script>
                    const allBookingsList = document.getElementById('allBookingsList');

                    async function fetchAllBookings() {
                        allBookingsList.innerHTML = 'Loading all bookings...';
                        try {
                            const response = await fetch('/api/all-bookings');
                            const data = await response.json();

                            if (!response.ok) {
                                throw new Error(data.message || 'Failed to fetch all bookings.');
                            }

                            if (data.bookings.length === 0) {
                                allBookingsList.innerHTML = '<p>No bookings found.</p>';
                            } else {
                                let tableHtml = '<table><thead><tr><th>ID</th><th>User</th><th>Table</th><th>Game</th><th>Date</th><th>Players</th><th>Action</th></tr></thead><tbody>';
                                data.bookings.forEach(booking => {
                                    tableHtml += '<tr>';
                                    tableHtml += '<td>' + booking.id + '</td>';
                                    tableHtml += '<td>' + booking.username + '</td>';
                                    tableHtml += '<td>' + booking.table_name + '</td>';
                                    tableHtml += '<td>' + booking.game_name + '</td>';
                                    tableHtml += '<td>' + booking.booking_date + '</td>';
                                    tableHtml += '<td>' + booking.player_count + '</td>';
                                    tableHtml += '<td><button class="cancel-btn" onclick="adminCancelBooking(' + booking.id + ')">Cancel</button></td>';
                                    tableHtml += '</tr>';
                                });
                                tableHtml += '</tbody></table>';
                                allBookingsList.innerHTML = tableHtml;
                            }

                        } catch (error) {
                            console.error('Error fetching all bookings:', error);
                            allBookingsList.innerHTML = '<p style="color: red;">Error loading all bookings: ' + error.message + '</p>';
                        }
                    }

                    async function adminCancelBooking(bookingId) {
                        if (!confirm('Are you sure you want to cancel this booking as an admin?')) {
                            return;
                        }

                        try {
                            const response = await fetch('/api/admin/cancel-booking', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ booking_id: bookingId })
                            });

                            const data = await response.json();

                            if (!response.ok) {
                                throw new Error(data.message || 'Failed to cancel booking.');
                            }

                            alert(data.message || 'Booking cancelled successfully!');
                            fetchAllBookings(); // Refresh the list
                        } catch (error) {
                            console.error('Error cancelling booking (admin):', error);
                            alert('Error cancelling booking: ' + error.message);
                        }
                    }

                    // Initial fetch when page loads
                    document.addEventListener('DOMContentLoaded', fetchAllBookings);
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error in /admin/bookings route:', error);
        res.status(500).send('Server error loading admin bookings page.');
    }
});

// User Bookings & Table Availability Route
app.get('/bookings', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch games for the dropdown (server-side)
        const games = await new Promise((resolve, reject) => {
            db.all("SELECT id, name FROM games", [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Book a Table</title>
                <link rel="stylesheet" href="/styles.css">
                <script>
                    // IMPORTANT: Pass currentUser and gameOptions from server to client
                    // Using + concatenation for server-side injected variables
                    const currentUser = {
                        id: ` + req.user.id + `,
                        username: '` + req.user.username + `',
                        isAdmin: ` + (req.user.is_admin ? 'true' : 'false') + `
                    };
                    const gameOptions = ` + JSON.stringify(games) + `;
                </script>
                <style>
                    /* Basic styles for the new elements */
                    .date-navigation {
                        margin: 20px 0;
                        display: flex; /* Keep flex for the select and current date display */
                        align-items: center;
                        gap: 10px;
                    }
                    .date-navigation select {
                        padding: 8px 15px;
                        border-radius: 5px;
                        border: 1px solid #ccc;
                        background-color: #f0f0f0;
                        cursor: pointer;
                    }
                    #currentDateDisplay {
                        font-weight: bold;
                        font-size: 1.2em;
                    }

                    .table-grid { /* A common class for both halls */
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 20px;
                        justify-content: center;
                        margin-top: 20px;
                        max-width: fit-content;
                        margin-left: auto;
                        margin-right: auto;
                    }
                    .table-card {
                        border: 1px solid #ccc;
                        padding: 15px;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s ease-in-out;
                        background-color: #fff;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        box-sizing: border-box; /* Include padding and border in width */
                        text-align: center; /* Center content within each card */
                    }
                    .table-card.available:hover {
                        background-color: #e6ffe6; /* Light green on hover */
                        border-color: #4CAF50;
                    }
                    .table-card.booked {
                        background-color: #fdd; /* Light red */
                        cursor: not-allowed;
                        opacity: 0.7;
                    }
                    .table-card.booked-by-you {
                        background-color: #ccf; /* Light blue for user's own booking */
                        border-color: #007bff;
                    }
                    .table-card.not-selectable { /* For booked tables not by current user */
                        cursor: not-allowed;
                        opacity: 0.7;
                    }
                    .status.available { color: green; font-weight: bold; }
                    .status.booked { color: red; font-weight: bold; }
                    .status.booked-by-you { color: #007bff; font-weight: bold; }

                    /* Styles for feedback messages */
                    #feedback-message {
                        padding: 10px;
                        margin-top: 15px;
                        border-radius: 5px;
                        font-weight: bold;
                        display: none; /* Hidden by default */
                    }
                    #feedback-message.success {
                        background-color: #d4edda;
                        color: #155724;
                        border: 1px solid #c3e6cb;
                    }
                    #feedback-message.error {
                        background-color: #f8d7da;
                        color: #721c24;
                        border: 1px solid #f5c6cb;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Book a Table</h1>
                    <p><a href="/profile">Back to Profile</a></p>

                    <h2 style="margin-top: 30px;">Available Tables for <span id="currentDateDisplay">Loading...</span></h2>
                    <div class="date-navigation">
                        <select id="tuesdaySelect" style="margin-left: 10px; padding: 8px 15px; border-radius: 5px; border: 1px solid #ccc; background-color: #f0f0f0;">
                            </select>
                    </div>

                    <h2 style="margin-top: 30px;">Large Hall</h2>
                    <div id="largeHallGrid" class="table-grid">
                        </div>

                    <h2 style="margin-top: 30px;">Small Hall</h2>
                    <div id="smallHallGrid" class="table-grid">
                        </div>

                    <div id="bookingForm" style="display: none; margin-top: 30px; border: 1px solid #eee; padding: 20px; border-radius: 8px; background-color: #f9f9f9;">
                        <h3>Confirm Your Booking</h3>
                        <p>Booking Table: <strong id="selectedTableName"></strong> on <strong id="selectedBookingDateDisplay"></strong></p>
                        <form id="confirmBookingForm">
                            <input type="hidden" id="selectedTableId">
                            <input type="hidden" id="actualSelectedBookingDate"> <div style="margin-bottom: 15px;">
                                <label for="gameSelect">Game:</label>
                                <select id="gameSelect" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                    </select>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <label for="playerCount">Number of Players:</label>
                                <input type="number" id="playerCount" min="1" value="1" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            </div>
                            <button type="submit" style="padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Confirm Booking</button>
                            <button type="button" id="cancelFormBtn" style="padding: 10px 20px; background-color: #ccc; color: black; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">Cancel</button>
                        </form>
                    </div>

                    <div id="feedback-message"></div>


                    <h2 style="margin-top: 30px;">Your Current Bookings</h2>
                    <div id="myBookingsList">
                        </div>

                    <p style="margin-top: 20px;"><a href="/profile">Back to Profile</a></p>
                </div>

                <script src="/js/bookings.js"></script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error in /bookings route:', error);
        res.status(500).send('Server error loading booking page.');
    }
});


// API Endpoints
// Admin API for Tables
app.get('/api/tables', ensureAdmin, async (req, res) => {
    db.all("SELECT id, name FROM tables", [], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/add-table', ensureAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Table name is required.' });
    }
    db.run(`INSERT INTO tables (name) VALUES (?)`, [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ message: 'Table with this name already exists.' });
            }
            return res.status(500).json({ message: 'Failed to add table.', error: err.message });
        }
        res.json({ message: 'Table added successfully!', id: this.lastID });
    });
});

app.post('/api/delete-table', ensureAdmin, async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ message: 'Table ID is required.' });
    }
    db.run(`DELETE FROM tables WHERE id = ?`, id, function(err) {
        if (err) {
            return res.status(500).json({ message: 'Failed to delete table.', error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Table not found.' });
        }
        res.json({ message: 'Table deleted successfully!' });
    });
});

// Admin API for Games
app.get('/api/games', ensureAdmin, async (req, res) => {
    db.all("SELECT id, name FROM games", [], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/add-game', ensureAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Game name is required.' });
    }
    db.run(`INSERT INTO games (name) VALUES (?)`, [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ message: 'Game with this name already exists.' });
            }
            return res.status(500).json({ message: 'Failed to add game.', error: err.message });
        }
        res.json({ message: 'Game added successfully!', id: this.lastID });
    });
});

app.post('/api/delete-game', ensureAdmin, async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ message: 'Game ID is required.' });
    }
    db.run(`DELETE FROM games WHERE id = ?`, id, function(err) {
        if (err) {
            return res.status(500).json({ message: 'Failed to delete game.', error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Game not found.' });
        }
        res.json({ message: 'Game deleted successfully!' });
    });
});

// Booking API - Fetch tables with booking status for a specific date
app.get('/api/tables-with-bookings', ensureAuthenticated, async (req, res) => {
    const { date } = req.query; // Expecting YYYY-MM-DD
    if (!date) {
        return res.status(400).json({ message: 'Date parameter is required.' });
    }

    try {
        const tables = await new Promise((resolve, reject) => {
            // SQL to get all tables and LEFT JOIN with bookings for the specified date
            // Also join with games and users to get names for display
            const sql = `
                SELECT
                    t.id AS table_id,
                    t.name AS table_name,
                    t.hall_name,
                    b.id AS booking_id,
                    b.game_id,
                    g.name AS game_name,
                    b.player_count,
                    b.booked_by_user_id,
                    u.username AS booked_by_username
                FROM tables AS t
                LEFT JOIN bookings AS b ON t.id = b.table_id AND b.booking_date = ?
                LEFT JOIN games AS g ON b.game_id = g.id
                LEFT JOIN users AS u ON b.booked_by_user_id = u.id
                ORDER BY CAST(t.name as INTEGER);
            `;
            db.all(sql, [date, date], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        // Remap to a more intuitive structure if needed, or send as is
        const mappedTables = tables.map(row => ({
            id: row.table_id,
            name: row.table_name,
            booking_id: row.booking_id, // Null if not booked on this date
            game_id: row.game_id,
            game_name: row.game_name,
            player_count: row.player_count,
            booked_by_user_id: row.booked_by_user_id,
            booked_by_username: row.booked_by_username
        }));

        res.json({ tables: mappedTables });

    } catch (error) {
        console.error('Error fetching tables with bookings:', error);
        res.status(500).json({ message: 'Failed to fetch table availability.', error: error.message });
    }
});

// API endpoint for admins to toggle small hall availability
app.post('/api/admin/toggle-small-hall', ensureAuthenticated, (req, res) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const { booking_date, disable } = req.body;

    if (disable) {
        db.run("INSERT OR IGNORE INTO disabled_halls (booking_date) VALUES (?)", [booking_date], function(err) {
            if (err) {
                return res.status(500).json({ message: "Failed to disable hall: " + err.message });
            }
            res.json({ message: "Small Hall disabled successfully for " + booking_date });
        });
    } else {
        db.run("DELETE FROM disabled_halls WHERE booking_date = ?", [booking_date], function(err) {
            if (err) {
                return res.status(500).json({ message: "Failed to enable hall: " + err.message });
            }
            res.json({ message: "Small Hall enabled successfully for " + booking_date });
        });
    }
});


// Booking API - Make a booking
app.post('/api/book-table', ensureAuthenticated, async (req, res) => {
    const { table_id, game_id, player_count, booking_date } = req.body;
    const booked_by_user_id = req.user.id; // Get user ID from authenticated session

    if (!table_id || !game_id || !player_count || !booking_date || !booked_by_user_id) {
        return res.status(400).json({ message: 'Missing required booking details.' });
    }

    // Server-side validation:
    try {
        // 1. Check if the table is already booked for this date
        const existingTableBooking = await new Promise((resolve, reject) => {
            db.get(`SELECT id FROM bookings WHERE table_id = ? AND booking_date = ?`,
                [table_id, booking_date],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                }
            );
        });

        if (existingTableBooking) {
            return res.status(409).json({ message: 'This table is already booked for the selected date.' });
        }

        // 2. Check if the user already has a booking for this date
        const existingUserBooking = await new Promise((resolve, reject) => {
            db.get(`SELECT id FROM bookings WHERE booked_by_user_id = ? AND booking_date = ?`,
                [booked_by_user_id, booking_date],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                }
            );
        });

        if (existingUserBooking) {
            return res.status(409).json({ message: 'You already have a booking for this date. One booking per user per day allowed.' });
        }

        // If all checks pass, proceed with booking
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO bookings (table_id, game_id, booking_date, booked_by_user_id, player_count) VALUES (?, ?, ?, ?, ?)`,
                [table_id, game_id, booking_date, booked_by_user_id, player_count],
                function(err) {
                    if (err) reject(err);
                    resolve({ id: this.lastID });
                }
            );
        });

        res.json({ message: 'Booking confirmed successfully!' });

    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ message: 'Failed to confirm booking.', error: error.message });
    }
});

// Booking API - Fetch user's own bookings
app.get('/api/my-bookings', ensureAuthenticated, async (req, res) => {
    const userId = req.user.id;
    try {
        const bookings = await new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    b.id,
                    b.booking_date,
                    b.player_count,
                    t.name AS table_name,
                    g.name AS game_name
                FROM bookings AS b
                JOIN tables AS t ON b.table_id = t.id
                JOIN games AS g ON b.game_id = g.id
                WHERE b.booked_by_user_id = ?
                AND b.booking_date >= date('now') -- Add this line to filter out past bookings
                ORDER BY b.booking_date ASC; -- Change DESC to ASC here
            `;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        res.json({ bookings: bookings });
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        res.status(500).json({ message: 'Failed to fetch your bookings.', error: error.message });
    }
});

// Booking API - Cancel a booking
app.post('/api/cancel-booking', ensureAuthenticated, async (req, res) => {
    const { booking_id } = req.body;
    const userId = req.user.id;

    if (!booking_id) {
        return res.status(400).json({ message: 'Booking ID is required.' });
    }

    try {
        const result = await new Promise((resolve, reject) => {
            // Ensure only the user who owns the booking can cancel it
            db.run(`DELETE FROM bookings WHERE id = ? AND booked_by_user_id = ?`,
                [booking_id, userId],
                function(err) {
                    if (err) reject(err);
                    resolve({ changes: this.changes });
                }
            );
        });

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Booking not found or you do not have permission to cancel it.' });
        }
        res.json({ message: 'Booking cancelled successfully!' });

    } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
    }
});

// Admin API - Fetch all bookings
app.get('/api/all-bookings', ensureAdmin, async (req, res) => {
    try {
        const bookings = await new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    b.id,
                    b.booking_date,
                    b.player_count,
                    t.name AS table_name,
                    g.name AS game_name,
                    u.username
                FROM bookings AS b
                JOIN tables AS t ON b.table_id = t.id
                JOIN games AS g ON b.game_id = g.id
                JOIN users AS u ON b.booked_by_user_id = u.id
                ORDER BY b.booking_date DESC, t.name ASC;
            `;
            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        res.json({ bookings: bookings });
    } catch (error) {
        console.error('Error fetching all bookings for admin:', error);
        res.status(500).json({ message: 'Failed to fetch all bookings.', error: error.message });
    }
});

// Admin API - Cancel any booking (by admin)
app.post('/api/admin/cancel-booking', ensureAdmin, async (req, res) => {
    const { booking_id } = req.body;

    if (!booking_id) {
        return res.status(400).json({ message: 'Booking ID is required.' });
    }

    try {
        const result = await new Promise((resolve, reject) => {
            db.run(`DELETE FROM bookings WHERE id = ?`,
                [booking_id],
                function(err) {
                    if (err) reject(err);
                    resolve({ changes: this.changes });
                }
            );
        });

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Booking not found.' });
        }
        res.json({ message: 'Booking cancelled by admin successfully!' });

    } catch (error) {
        console.error('Error cancelling booking by admin:', error);
        res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
    }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});