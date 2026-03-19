require('dotenv').config();
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const comparatorRoutes = require('./routes/comparator');
const db = require('./database');

const app = express();
const port = process.env.PORT || 3000;

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false
}));

// Make session available to templates
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

const axios = require('axios');

const requireLogin = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Please login first.' });
    }
};

const requireLoginRedirect = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Routes
app.use('/auth', authRoutes);
app.use('/comparator', comparatorRoutes);

// Auth Routes
app.get('/login', (req, res) => {
    const successMsg = req.query.success;
    const errorMsg = req.query.error;
    res.render('login', { successMsg, errorMsg });
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
    if (password === adminPassword) {
        req.session.user = { loggedIn: true };
        res.redirect('/?success=Logged in successfully');
    } else {
        res.redirect('/login?error=Invalid password');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/?success=Logged out successfully');
});


// API Routes
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    try {
        const graphqlQuery = `
            query ($search: String) {
                Page(page: 1, perPage: 10) {
                    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                        id
                        title {
                            romaji
                            english
                        }
                        coverImage {
                            large
                        }
                        episodes
                    }
                }
            }
        `;

        const response = await axios.post('https://graphql.anilist.co', {
            query: graphqlQuery,
            variables: { search: query }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });

        res.json(response.data.data.Page.media);

    } catch (error) {
        console.error("Search Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to search AniList' });
    }
});

app.get('/api/progress', async (req, res) => {
    const { animeId, userIds } = req.query;

    if (!animeId || !userIds) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const userIdArray = userIds.split(',').map(id => parseInt(id, 10));
    const results = [];

    const graphqlQuery = `
        query ($mediaId: Int) {
            Media (id: $mediaId) {
                mediaListEntry {
                    id
                    status
                    progress
                }
            }
        }
    `;

    for (const userId of userIdArray) {
        // Fetch user from DB
        const stmt = db.prepare('SELECT name, anilist_token FROM users WHERE id = ?');
        const user = stmt.get(userId);

        if (!user || !user.anilist_token) {
            results.push({ userId, name: user?.name || 'Unknown', error: 'No AniList token found.' });
            continue;
        }

        try {
            const response = await axios.post('https://graphql.anilist.co', {
                query: graphqlQuery,
                variables: {
                    mediaId: parseInt(animeId)
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${user.anilist_token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            const media = response.data.data.Media;
            if (media && media.mediaListEntry) {
                results.push({ userId, name: user.name, progress: media.mediaListEntry.progress || 0 });
            } else {
                // Not on their list
                results.push({ userId, name: user.name, progress: 0 });
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                // Not found is expected if they haven't added it to their list
                results.push({ userId, name: user.name, progress: 0 });
            } else {
                console.error(`Progress Error for user ${user.name}:`, error.response ? error.response.data : error.message);
                results.push({ userId, name: user.name, error: 'API Error' });
            }
        }
    }

    res.json({ results });
});

app.post('/api/sync', requireLogin, async (req, res) => {
    const { animeId, episode, userIds } = req.body;

    if (!animeId || !episode || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or user selection.' });
    }

    const results = [];

    const graphqlMutation = `
        mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
            SaveMediaListEntry (mediaId: $mediaId, progress: $progress, status: $status) {
                id
                status
                progress
            }
        }
    `;

    for (const userId of userIds) {
        // Fetch user from DB
        const stmt = db.prepare('SELECT name, anilist_token FROM users WHERE id = ?');
        const user = stmt.get(userId);

        if (!user || !user.anilist_token) {
            results.push({ id: userId, name: user?.name || 'Unknown', success: false, error: 'No AniList token found.' });
            continue;
        }

        try {
            await axios.post('https://graphql.anilist.co', {
                query: graphqlMutation,
                variables: {
                    mediaId: parseInt(animeId),
                    progress: parseInt(episode),
                    status: 'CURRENT' // Set to currently watching
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${user.anilist_token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            results.push({ id: userId, name: user.name, success: true });
        } catch (error) {
            console.error(`Sync Error for user ${user.name}:`, error.response ? error.response.data : error.message);
            results.push({ id: userId, name: user.name, success: false, error: 'API Error' });
        }
    }

    res.json({ results });
});

app.get('/', (req, res) => {
    const successMsg = req.query.success;
    const errorMsg = req.query.error;

    // Fetch all connected users
    const stmt = db.prepare('SELECT id, name FROM users');
    const users = stmt.all();

    res.render('home', { successMsg, errorMsg, users });
});

app.get('/users', (req, res) => {
    const successMsg = req.query.success;
    const errorMsg = req.query.error;

    // Fetch all connected users
    const stmt = db.prepare('SELECT id, name FROM users');
    const users = stmt.all();

    res.render('users', { successMsg, errorMsg, users });
});

app.get('/settings', (req, res) => {
    const successMsg = req.query.success;
    const errorMsg = req.query.error;

    // Read current .env file or use process.env as fallback
    let envData = {};
    try {
        const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        envFile.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                envData[match[1].trim()] = match[2].trim();
            }
        });
    } catch (err) {
        console.warn('Could not read .env file, using process.env fallbacks');
    }

    // Default env structure based on what should be editable
    const env = {
        PORT: envData.PORT || process.env.PORT || '3000',
        SESSION_SECRET: envData.SESSION_SECRET || process.env.SESSION_SECRET || '',
        ANILIST_CLIENT_ID: envData.ANILIST_CLIENT_ID || process.env.ANILIST_CLIENT_ID || '',
        ANILIST_CLIENT_SECRET: envData.ANILIST_CLIENT_SECRET || process.env.ANILIST_CLIENT_SECRET || '',
        ANILIST_REDIRECT_URI: envData.ANILIST_REDIRECT_URI || process.env.ANILIST_REDIRECT_URI || '',
        ADMIN_PASSWORD: envData.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin'
    };

    res.render('settings', { successMsg, errorMsg, env });
});

app.post('/api/settings', requireLogin, (req, res) => {
    const { PORT, SESSION_SECRET, ANILIST_CLIENT_ID, ANILIST_CLIENT_SECRET, ANILIST_REDIRECT_URI, ADMIN_PASSWORD } = req.body;

    if (!PORT || !SESSION_SECRET || !ANILIST_CLIENT_ID || !ANILIST_CLIENT_SECRET || !ANILIST_REDIRECT_URI) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const envContent = `PORT=${PORT}
SESSION_SECRET=${SESSION_SECRET}
ANILIST_CLIENT_ID=${ANILIST_CLIENT_ID}
ANILIST_CLIENT_SECRET=${ANILIST_CLIENT_SECRET}
ANILIST_REDIRECT_URI=${ANILIST_REDIRECT_URI}
ADMIN_PASSWORD=${ADMIN_PASSWORD || 'admin'}
`;
        fs.writeFileSync(path.join(__dirname, '.env'), envContent);

        // Respond to the client before restarting
        res.json({ success: true, message: 'Settings saved. Restarting...' });

        // Gracefully exit so PM2/systemd restarts the application
        setTimeout(() => {
            console.log('Restarting application due to settings change...');
            process.exit(0);
        }, 1000);
    } catch (err) {
        console.error('Error saving .env file:', err);
        res.status(500).json({ error: 'Failed to save settings to .env file' });
    }
});

app.listen(port, () => {
    console.log(`Anime Sync app listening at http://localhost:${port}`);
});
