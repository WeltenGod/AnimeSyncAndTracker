function comparatorApp() {
    return {
        users: [{ username: '', platform: 'mal' }],
        type: 'anime',
        loading: false,
        error: null,
        commonItems: [],
        searched: false,

        addUser() {
            this.users.push({ username: '', platform: 'mal' });
        },

        removeUser(index) {
            this.users.splice(index, 1);
        },

        normalizeTitle(title) {
            if (!title) return '';
            return title.toLowerCase().replace(/[^a-z0-9]/g, '');
        },

        async fetchUserList(user) {
            const res = await fetch(`/comparator/api/${user.platform}?username=${encodeURIComponent(user.username)}&type=${this.type}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Failed to fetch ${user.platform} list for ${user.username}`);
            }
            const data = await res.json();

            const allowedStatuses = ['completed', 'watching', 'reading'];
            return data.items.filter(item => allowedStatuses.includes(item.status));
        },

        async compare() {
            const validUsers = this.users.filter((u) => u.username.trim() !== '');
            if (validUsers.length < 2) {
                this.error = 'Please enter at least 2 usernames to compare.';
                return;
            }

            this.loading = true;
            this.error = null;
            this.searched = false;
            this.commonItems = [];

            try {
                const lists = await Promise.all(validUsers.map((user) => this.fetchUserList(user)));

                let allItemsFlat = [];
                lists.forEach((list, listIndex) => {
                    list.forEach(item => {
                        allItemsFlat.push({ ...item, sourceListIndex: listIndex });
                    });
                });

                let itemMap = new Map();

                allItemsFlat.forEach(item => {
                    const titleNorm = this.normalizeTitle(item.title);
                    const titleRomajiNorm = item.titleRomaji ? this.normalizeTitle(item.titleRomaji) : '';
                    const titleEnglishNorm = item.titleEnglish ? this.normalizeTitle(item.titleEnglish) : '';

                    let foundKey = null;
                    for (const [key, existingItem] of itemMap.entries()) {
                        const eTitleNorm = this.normalizeTitle(existingItem.title);
                        const eTitleRomajiNorm = existingItem.titleRomaji ? this.normalizeTitle(existingItem.titleRomaji) : '';
                        const eTitleEnglishNorm = existingItem.titleEnglish ? this.normalizeTitle(existingItem.titleEnglish) : '';

                        if (
                            (titleNorm && (titleNorm === eTitleNorm || titleNorm === eTitleRomajiNorm || titleNorm === eTitleEnglishNorm)) ||
                            (titleRomajiNorm && (titleRomajiNorm === eTitleNorm || titleRomajiNorm === eTitleRomajiNorm || titleRomajiNorm === eTitleEnglishNorm)) ||
                            (titleEnglishNorm && (titleEnglishNorm === eTitleNorm || titleEnglishNorm === eTitleRomajiNorm || titleEnglishNorm === eTitleEnglishNorm))
                        ) {
                            foundKey = key;
                            break;
                        }
                    }

                    const userDetail = {
                        username: item.username,
                        avatar: item.avatar,
                        status: item.status,
                        progress: item.progress,
                        sourceListIndex: item.sourceListIndex
                    };

                    if (foundKey) {
                        const existing = itemMap.get(foundKey);
                        if (!existing.users.some(u => u.sourceListIndex === item.sourceListIndex)) {
                            existing.users.push(userDetail);
                        }
                    } else {
                        itemMap.set(titleNorm || titleRomajiNorm || titleEnglishNorm, {
                            ...item,
                            users: [userDetail]
                        });
                    }
                });

                let intersection = Array.from(itemMap.values()).filter(item => item.users.length >= 2);

                intersection.sort((a, b) => a.title.localeCompare(b.title));

                this.commonItems = intersection;
                this.searched = true;
            } catch (err) {
                console.error(err);
                this.error = err.message;
            } finally {
                this.loading = false;
            }
        },

        exportCsv() {
            if (this.commonItems.length === 0) return;

            const validUsers = this.users.filter((u) => u.username.trim() !== '');

            const headers = ['Title', 'URL'];
            validUsers.forEach((u) => {
                headers.push(`${u.username} Status`);
                headers.push(`${u.username} Progress`);
            });

            const csvRows = [];
            csvRows.push(headers.join(';'));

            this.commonItems.forEach((item) => {
                const row = [
                    `"${item.title.replace(/"/g, '""')}"`,
                    `"${item.url}"`
                ];

                validUsers.forEach((u, index) => {
                    const userDetail = item.users.find((iu) => iu.sourceListIndex === index);
                    if (userDetail) {
                        row.push(`"${userDetail.status}"`);
                        row.push(`"${userDetail.progress}"`);
                    } else {
                        row.push('""');
                        row.push('""');
                    }
                });

                csvRows.push(row.join(';'));
            });

            const csvContent = '\uFEFF' + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const date = new Date().toISOString().split('T')[0];
            link.setAttribute('href', url);
            link.setAttribute('download', `common-${this.type}-${date}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };
}
