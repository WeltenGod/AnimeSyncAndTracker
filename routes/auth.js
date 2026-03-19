const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../database');

// 1. Redirect to AniList
router.get('/anilist', (req, res) => {
    const clientId = process.env.ANILIST_CLIENT_ID;
    const redirectUri = process.env.ANILIST_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        return res.status(500).send("AniList OAuth not configured in .env");
    }

    const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code`;
    res.redirect(authUrl);
});

// 2. Handle callback
router.get('/anilist/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).send("No code provided by AniList.");
    }

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://anilist.co/api/v2/oauth/token', {
            client_id: process.env.ANILIST_CLIENT_ID,
            client_secret: process.env.ANILIST_CLIENT_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: process.env.ANILIST_REDIRECT_URI,
            code: code,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });

        const accessToken = tokenResponse.data.access_token;

        // Fetch user's AniList info using the token
        const userQuery = `
            query {
                Viewer {
                    id
                    name
                }
            }
        `;

        const userResponse = await axios.post('https://graphql.anilist.co', {
            query: userQuery
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });

        const anilistUser = userResponse.data.data.Viewer;

        // Store or update in database
        const stmt = db.prepare(`
            INSERT INTO users (name, anilist_token, anilist_id)
            VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
            anilist_token = excluded.anilist_token,
            anilist_id = excluded.anilist_id
        `);

        stmt.run(anilistUser.name, accessToken, anilistUser.id);

        res.redirect('/?success=anilist_connected');

    } catch (error) {
        console.error("AniList OAuth Error:", error.response ? error.response.data : error.message);
        res.status(500).send("Failed to authenticate with AniList.");
    }
});

module.exports = router;
