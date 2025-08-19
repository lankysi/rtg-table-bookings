const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const ejs = require('ejs');
const { Client } = require('pg');
require('dotenv').config();

const app = express();

// Set the view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'a_default_secret_for_development',
    resave: false,
    saveUninitialized: false
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Discord Strategy
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.RAILWAY_STATIC_URL ? `${process.env.RAILWAY_STATIC_URL}/auth/discord/callback` : 'http://localhost:3000/auth/discord/callback',
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const client = new Client({
            host: process.env.PGHOST,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
            port: process.env.PGPORT
        });
        await client.connect();

        const existingUser = await client.query('SELECT * FROM users WHERE discord_id = $1', [profile.id]);

        if (existingUser.rows.length > 0) {
            await client.query('UPDATE users SET last_login = NOW() WHERE discord_id = $1', [profile.id]);
            return done(null, existingUser.rows[0]);
        } else {
            const newUser = await client.query(
                'INSERT INTO users (username, discord_id, avatar) VALUES ($1, $2, $3) RETURNING *',
                [profile.username, profile.id, profile.avatar]
            );
            return done(null, newUser.rows[0]);
        }
    } catch (err) {
        console.error('Database query error:', err.stack);
        return done(err);
    }
}));

// Passport serialization
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const client = new Client({
            host: process.env.PGHOST,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
            port: process.env.PGPORT
        });
        await client.connect();

        const userResult = await client.query('SELECT * FROM users WHERE id = $1', [id]);
        if (userResult.rows.length > 0) {
            done(null, userResult.rows[0]);
        } else {
            done(new Error('User not found'));
        }
    } catch (err) {
        console.error('Database query error:', err.stack);
        done(err);
    }
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

// Routes
app.get('/', isAuthenticated, (req, res) => {
    res.redirect('/profile');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/login' }), (req, res) => {
    res.redirect('/profile');
});

app.get('/profile', isAuthenticated, (req, res) => {
    res.render('profile.ejs', { user: req.user });
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

app.get('/bookings', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bookings.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});