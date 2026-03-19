const express = require('express');
const router = express.Router();
const axios = require('axios');

// Serve the comparator page
router.get('/', (req, res) => {
    res.render('comparator');
});

// MAL API Route
router.get('/api/mal', async (req, res) => {
    const { username, type = 'anime' } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const endpoint = type === 'manga' ? 'mangalist' : 'animelist';
    let allItems = [];
    let url = `https://api.myanimelist.net/v2/users/${encodeURIComponent(username)}/${endpoint}?limit=1000&fields=list_status,title,main_picture`;

    const CLIENT_ID = '6114d00ca681b7701d1e15fe11a4987e'; // Publicly available client ID for retrieving lists

    try {
        // Fetch user profile from Jikan API to get the avatar
        let avatarUrl = null;
        let actualUsername = username;
        try {
            const jikanUrl = `https://api.jikan.moe/v4/users/${encodeURIComponent(username)}`;
            const jikanRes = await axios.get(jikanUrl);
            if (jikanRes.status === 200 && jikanRes.data.data) {
                actualUsername = jikanRes.data.data.username || username;
                if (jikanRes.data.data.images && jikanRes.data.data.images.jpg) {
                    avatarUrl = jikanRes.data.data.images.jpg.image_url;
                }
            }
        } catch (e) {
            console.warn('Failed to fetch user profile from Jikan API', e.message);
        }

        while (url) {
            try {
                const response = await axios.get(url, {
                    headers: {
                        'X-MAL-CLIENT-ID': CLIENT_ID,
                    },
                });

                const data = response.data;
                if (data.data) {
                    allItems = allItems.concat(data.data);
                }

                url = data.paging && data.paging.next ? data.paging.next : null;
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    return res.status(404).json({ error: `User ${username} not found on MAL` });
                }
                throw error;
            }
        }

        // Transform data to a common format
        const transformed = allItems.map((item) => {
            const status = item.list_status.status; // e.g., 'completed', 'watching', 'reading'
            const progress = type === 'manga' ? item.list_status.num_chapters_read : item.list_status.num_episodes_watched;

            return {
                id: item.node.id,
                title: item.node.title,
                image: item.node.main_picture ? item.node.main_picture.large || item.node.main_picture.medium : null,
                url: `https://myanimelist.net/${type}/${item.node.id}`,
                status: status,
                progress: progress || 0,
                username: actualUsername,
                avatar: avatarUrl,
            };
        });

        res.status(200).json({
            items: transformed,
            user: {
                username: actualUsername,
                avatar: avatarUrl
            }
        });
    } catch (error) {
        console.error('Error fetching MAL data:', error.message);
        res.status(500).json({ error: 'Failed to fetch MAL data' });
    }
});

// AniList API Route
router.get('/api/anilist', async (req, res) => {
    const { username, type = 'anime' } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const mediaType = type.toUpperCase(); // ANIME or MANGA

    const query = `
    query ($username: String, $type: MediaType) {
      MediaListCollection(userName: $username, type: $type) {
        user {
          name
          avatar {
            large
          }
        }
        lists {
          entries {
            status
            progress
            media {
              id
              title {
                romaji
                english
              }
              coverImage {
                large
              }
              siteUrl
            }
          }
        }
      }
    }
    `;

    const variables = {
        username,
        type: mediaType,
    };

    try {
        const response = await axios.post('https://graphql.anilist.co', {
            query,
            variables,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });

        const data = response.data;

        if (data.errors) {
            return res.status(400).json({ error: data.errors[0].message });
        }

        const lists = data.data.MediaListCollection.lists;
        const user = data.data.MediaListCollection.user;
        let allItems = [];

        lists.forEach((list) => {
            list.entries.forEach((entry) => {
                let mappedStatus = entry.status.toLowerCase();
                if (mappedStatus === 'current') {
                    mappedStatus = type === 'manga' ? 'reading' : 'watching';
                } else if (mappedStatus === 'repeating') {
                    mappedStatus = type === 'manga' ? 'reading' : 'watching';
                }

                allItems.push({
                    id: entry.media.id,
                    title: entry.media.title.english || entry.media.title.romaji,
                    titleRomaji: entry.media.title.romaji,
                    titleEnglish: entry.media.title.english,
                    image: entry.media.coverImage.large,
                    url: entry.media.siteUrl,
                    status: mappedStatus,
                    progress: entry.progress || 0,
                    username: user.name,
                    avatar: user.avatar ? user.avatar.large : null,
                });
            });
        });

        res.status(200).json({
            items: allItems,
            user: {
                username: user.name,
                avatar: user.avatar ? user.avatar.large : null,
            }
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ error: `User ${username} not found on AniList` });
        }
        console.error('Error fetching AniList data:', error.message);
        res.status(500).json({ error: 'Failed to fetch AniList data' });
    }
});

module.exports = router;
