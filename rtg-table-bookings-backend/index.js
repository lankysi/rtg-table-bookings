const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
require('dotenv').config();
require('./auth');

const app = express();
const bookings = require('./routes/bookings');
const { isAuthenticated } = require('./middleware/auth');

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => res.send('RTG Table Bookings Backend Running'));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('http://localhost:3000')
);

app.get('/api/user/me', (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  res.json(req.user);
});

app.use('/api/bookings', isAuthenticated, bookings);

app.listen(3001, () => console.log('Server running on http://localhost:3001'));