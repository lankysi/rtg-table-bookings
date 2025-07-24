const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const prisma = require('./prisma/client');
require('dotenv').config();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await prisma.user.findUnique({ where: { id } });
  done(null, user);
});

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
  const user = await prisma.user.upsert({
    where: { id: profile.id },
    update: { username: profile.username },
    create: {
      id: profile.id,
      username: profile.username
    }
  });
  done(null, user);
}));