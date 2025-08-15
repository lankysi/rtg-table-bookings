const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const ejs = require('ejs');
const client = require('./database.js'); // The new PostgreSQL client
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport setup
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.RAILWAY_STATIC_URL ? `${process.env.RAILWAY_STATIC_URL}/auth/discord/callback` : 'http://localhost:3000/auth/discord/callback',
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let result = await client.query("SELECT * FROM users WHERE discord_id = $1", [profile.id]);
        let user = result.rows[0];

        if (!user) {
            result = await client.query("INSERT INTO users (discord_id, username, avatar, is_admin) VALUES ($1, $2, $3, $4) RETURNING *", [profile.id, profile.username, profile.avatar, 0]);
            user = result.rows[0];
        } else {
            // Update username and avatar in case they've changed
            await client.query("UPDATE users SET username = $1, avatar = $2 WHERE discord_id = $3", [profile.username, profile.avatar, profile.id]);
        }
        done(null, user);
    } catch (err) {
        done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await client.query("SELECT * FROM users WHERE id = $1", [id]);
        const user = result.rows[0];
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// EJS for dynamic views (like profile)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Authentication routes
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    res.redirect('/bookings');
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
};

// Middleware to check if user is an admin
const ensureAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.is_admin) {
        return next();
    }
    res.status(403).send('Forbidden: You are not an admin.');
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/bookings', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/bookings.html'));
});

app.get('/profile', isAuthenticated, (req, res) => {
    res.render('profile.ejs', { user: req.user });
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Admin routes
app.get('/admin', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/index.html'));
});

app.get('/admin/tables', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/manage_tables.html'));
});

app.get('/admin/games', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/manage_games.html'));
});

app.get('/admin/all-bookings', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/all_bookings.html'));
});


// API ENDPOINTS

// API endpoint to get the current user's details
app.get('/api/current-user', isAuthenticated, (req, res) => {
    if (req.user) {
        // Only return the necessary data, not the whole user object
        res.json({
            id: req.user.id,
            username: req.user.username,
            is_admin: req.user.is_admin
        });
    } else {
        res.json(null);
    }
});

// API endpoint to get a list of all games
app.get('/api/games', isAuthenticated, async (req, res) => {
    try {
        const result = await client.query("SELECT id, name FROM games ORDER BY name");
        res.json({ games: result.rows });
    } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({ message: 'Failed to fetch games.', error: error.message });
    }
});

// API endpoint to fetch table availability for a given date
app.get('/api/tables/availability', isAuthenticated, async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'Date is required.' });
    }
    try {
        const result = await client.query(`
            SELECT
                t.id AS table_id,
                t.name AS table_name,
                t.hall_name,
                b.id AS booking_id,
                b.booking_date,
                b.game_id,
                b.player_count,
                b.booked_by_user_id
            FROM tables t
            LEFT JOIN bookings b ON t.id = b.table_id AND b.booking_date = $1
            ORDER BY t.hall_name, t.name
        `, [date]);
        res.json({ tables: result.rows });
    } catch (error) {
        console.error('Error fetching table availability:', error);
        res.status(500).json({ message: 'Failed to fetch table availability.', error: error.message });
    }
});

// API endpoint for users to book a table
app.post('/api/bookings', isAuthenticated, async (req, res) => {
    const { table_id, date, game_id, player_count } = req.body;
    const booked_by_user_id = req.user.id;
    if (!table_id || !date || !player_count) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    try {
        // Check for existing booking
        const existingBooking = await client.query("SELECT * FROM bookings WHERE table_id = $1 AND booking_date = $2", [table_id, date]);
        if (existingBooking.rows.length > 0) {
            return res.status(409).json({ message: 'This table is already booked on the selected date.' });
        }

        await client.query("INSERT INTO bookings (table_id, booking_date, game_id, player_count, booked_by_user_id) VALUES ($1, $2, $3, $4, $5)", [table_id, date, game_id, player_count, booked_by_user_id]);
        res.status(201).json({ message: 'Table booked successfully.' });
    } catch (error) {
        console.error('Error booking table:', error);
        res.status(500).json({ message: 'Failed to book table.', error: error.message });
    }
});

// API endpoint to fetch a user's bookings
app.get('/api/user/bookings', isAuthenticated, async (req, res) => {
    const user_id = req.user.id;
    try {
        const result = await client.query(`
            SELECT
                b.id,
                b.booking_date,
                g.name AS game_name,
                t.name AS table_name,
                t.hall_name,
                b.player_count
            FROM bookings b
            JOIN tables t ON b.table_id = t.id
            LEFT JOIN games g ON b.game_id = g.id
            WHERE b.booked_by_user_id = $1 AND b.booking_date >= CURRENT_DATE
            ORDER BY b.booking_date DESC
        `, [user_id]);
        res.json({ bookings: result.rows });
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        res.status(500).json({ message: 'Failed to fetch user bookings.', error: error.message });
    }
});

// API endpoint for users to cancel their booking
app.delete('/api/bookings/:id', isAuthenticated, async (req, res) => {
    const booking_id = req.params.id;
    const user_id = req.user.id;
    if (!booking_id) {
        return res.status(400).json({ message: 'Booking ID is required.' });
    }
    try {
        const result = await client.query("DELETE FROM bookings WHERE id = $1 AND booked_by_user_id = $2", [booking_id, user_id]);
        if (result.rowCount > 0) {
            res.json({ success: true, message: 'Booking cancelled successfully.' });
        } else {
            res.status(404).json({ message: 'Booking not found or not owned by user.' });
        }
    } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
    }
});

// API endpoint to get a list of all games
app.get('/api/games', isAuthenticated, async (req, res) => {
    try {
        const result = await client.query("SELECT id, name FROM games ORDER BY name");
        res.json({ games: result.rows });
    } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({ message: 'Failed to fetch games.', error: error.message });
    }
});


// Admin API Endpoints

// API endpoint for Admin to fetch all halls
app.get('/api/admin/halls', ensureAdmin, async (req, res) => {
    try {
        const result = await client.query("SELECT id, name FROM halls ORDER BY name");
        res.json({ halls: result.rows });
    } catch (error) {
        console.error('Error fetching halls:', error);
        res.status(500).json({ message: 'Failed to fetch halls.', error: error.message });
    }
});

// API endpoint for Admin to add a new game
app.post('/api/admin/games', ensureAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Game name is required.' });
    }
    try {
        await client.query("INSERT INTO games (name) VALUES ($1)", [name]);
        res.status(201).json({ message: 'Game added successfully.' });
    } catch (error) {
        if (error.code === '23505') { // PostgreSQL unique violation error code
            return res.status(409).json({ message: 'A game with this name already exists.' });
        }
        console.error('Error adding game:', error);
        res.status(500).json({ message: 'Failed to add game.', error: error.message });
    }
});

// API endpoint for Admin to delete a game
app.delete('/api/admin/games/:id', ensureAdmin, async (req, res) => {
    const gameId = req.params.id;
    try {
        const result = await client.query("DELETE FROM games WHERE id = $1", [gameId]);
        if (result.rowCount > 0) {
            res.json({ message: 'Game deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Game not found.' });
        }
    } catch (error) {
        console.error('Error deleting game:', error);
        res.status(500).json({ message: 'Failed to delete game.', error: error.message });
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
        const result = await client.query("UPDATE games SET name = $1 WHERE id = $2", [name, gameId]);
        if (result.rowCount > 0) {
            res.json({ message: 'Game updated successfully.' });
        } else {
            res.status(404).json({ message: 'Game not found.' });
        }
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'A game with this name already exists.' });
        }
        console.error('Error updating game:', error);
        res.status(500).json({ message: 'Failed to update game.', error: error.message });
    }
});

// API endpoint for Admin to fetch all tables
app.get('/api/admin/tables', ensureAdmin, async (req, res) => {
    try {
        const result = await client.query("SELECT id, name, hall_name FROM tables ORDER BY hall_name, name");
        res.json({ tables: result.rows });
    } catch (error) {
        console.error('Error fetching tables:', error);
        res.status(500).json({ message: 'Failed to fetch tables.', error: error.message });
    }
});

// API endpoint for Admin to add a new table
app.post('/api/admin/tables', ensureAdmin, async (req, res) => {
    const { name, hall_name } = req.body;
    if (!name || !hall_name) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    try {
        await client.query("INSERT INTO tables (name, hall_name) VALUES ($1, $2)", [name, hall_name]);
        res.status(201).json({ message: 'Table added successfully.' });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'A table with this name already exists.' });
        }
        console.error('Error adding table:', error);
        res.status(500).json({ message: 'Failed to add table.', error: error.message });
    }
});

// API endpoint for Admin to delete a table
app.delete('/api/admin/tables/:id', ensureAdmin, async (req, res) => {
    const tableId = req.params.id;
    try {
        const result = await client.query("DELETE FROM tables WHERE id = $1", [tableId]);
        if (result.rowCount > 0) {
            res.json({ message: 'Table deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Table not found.' });
        }
    } catch (error) {
        console.error('Error deleting table:', error);
        res.status(500).json({ message: 'Failed to delete table.', error: error.message });
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
        const result = await client.query("UPDATE tables SET name = $1, hall_name = $2 WHERE id = $3", [name, hall_name, tableId]);
        if (result.rowCount > 0) {
            res.json({ message: 'Table updated successfully.' });
        } else {
            res.status(404).json({ message: 'Table not found.' });
        }
    } catch (error) {
        console.error('Error updating table:', error);
        res.status(500).json({ message: 'Failed to update table.', error: error.message });
    }
});

// API endpoint for Admin to fetch all upcoming bookings
app.get('/api/admin/all-bookings', ensureAdmin, async (req, res) => {
    try {
        const result = await client.query(`
            SELECT
                b.id AS booking_id,
                b.booking_date,
                g.name AS game_name,
                t.name AS table_name,
                t.hall_name,
                b.player_count,
                u.username AS booked_by_username
            FROM bookings b
            JOIN tables t ON b.table_id = t.id
            LEFT JOIN games g ON b.game_id = g.id
            JOIN users u ON b.booked_by_user_id = u.id
            WHERE b.booking_date >= CURRENT_DATE
            ORDER BY b.booking_date, t.name
        `);
        res.json({ allBookings: result.rows });
    } catch (error) {
        console.error('Error fetching all bookings:', error);
        res.status(500).json({ message: 'Failed to fetch all bookings.', error: error.message });
    }
});

// API endpoint for Admin to cancel any booking
app.delete('/api/admin/bookings/:id', ensureAdmin, async (req, res) => {
    const booking_id = req.params.id;
    if (!booking_id) {
        return res.status(400).json({ message: 'Booking ID is required.' });
    }
    try {
        const result = await client.query("DELETE FROM bookings WHERE id = $1", [booking_id]);
        if (result.rowCount > 0) {
            res.json({ success: true, message: 'Booking cancelled successfully by admin.' });
        } else {
            res.status(404).json({ message: 'Booking not found or already cancelled.' });
        }
    } catch (error) {
        console.error('Error cancelling booking by admin:', error);
        res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});