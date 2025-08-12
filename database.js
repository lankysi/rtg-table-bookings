const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeDatabase() {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL database.');

        // Function to run a query
        async function runQuery(query, params = []) {
            await client.query(query, params);
        }

        // Create tables
        await runQuery(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                discord_id TEXT UNIQUE NOT NULL,
                avatar TEXT,
                is_admin INTEGER DEFAULT 0
            )
        `);

        await runQuery(`
            CREATE TABLE IF NOT EXISTS halls (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            )
        `);
        
        await runQuery(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            )
        `);

        await runQuery(`
            CREATE TABLE IF NOT EXISTS tables (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                hall_name TEXT NOT NULL
            )
        `);

        await runQuery(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                table_id INTEGER NOT NULL,
                booking_date DATE NOT NULL,
                game_id INTEGER,
                player_count INTEGER NOT NULL,
                booked_by_user_id INTEGER NOT NULL
            )
        `);

        // Seed data
        // Check for admin user
        const MY_DISCORD_ID = process.env.MY_DISCORD_ID;
        const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
        if (MY_DISCORD_ID && ADMIN_USERNAME) {
            const adminUser = await client.query("SELECT * FROM users WHERE discord_id = $1", [MY_DISCORD_ID]);
            if (adminUser.rows.length === 0) {
                console.log('Creating default admin user...');
                await client.query("INSERT INTO users (discord_id, username, is_admin) VALUES ($1, $2, $3)", [MY_DISCORD_ID, ADMIN_USERNAME, 1]);
                console.log('Default admin user created.');
            }
        }

        // Check and seed halls
        const hallCount = await client.query("SELECT COUNT(*) FROM halls");
        if (hallCount.rows[0].count == 0) {
            console.log('Seeding default halls...');
            await runQuery("INSERT INTO halls (name) VALUES ('Large Hall'), ('Small Hall')");
            console.log('Default halls seeded.');
        }

        // Check and seed games
        const gameCount = await client.query("SELECT COUNT(*) FROM games");
        if (gameCount.rows[0].count == 0) {
            console.log('Seeding default games...');
            await runQuery("INSERT INTO games (name) VALUES ('Chess'), ('Checkers'), ('Monopoly'), ('Risk'), ('Catan'), ('Poker')");
            console.log('Default games seeded.');
        }

        // Check and seed tables
        const tableCount = await client.query("SELECT COUNT(*) FROM tables");
        if (tableCount.rows[0].count == 0) {
            console.log('Seeding default tables...');
            const tablesToInsert = ['Table A1', 'Table A2', 'Table A3', 'Table A4', 'Table B1', 'Table B2', 'Table B3'];
            const hallsToAssign = ['Large Hall', 'Large Hall', 'Large Hall', 'Large Hall', 'Small Hall', 'Small Hall', 'Small Hall'];
            for (let i = 0; i < tablesToInsert.length; i++) {
                await runQuery("INSERT INTO tables (name, hall_name) VALUES ($1, $2)", [tablesToInsert[i], hallsToAssign[i]]);
            }
            console.log('Default tables seeded.');
        }

    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

initializeDatabase();

module.exports = client;