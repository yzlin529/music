const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const dbPath = path.join(__dirname, 'music.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        return console.error('无法打开数据库', err.message);
    }
    console.log('已连接到SQLite数据库。');
});

// --- Mock Data Definitions ---
const genres = ['流行 Pop', '摇滚 Rock', '民谣 Folk', '电子 Electronic', '古典 Classical', '爵士 Jazz', '嘻哈 Hip-Hop', '蓝调 Blues', 'R&B', '世界音乐 World', '氛围 Ambient'];
const rhythms = ['80bpm', '95bpm', '110bpm', '128bpm', '140bpm', '160bpm', '4/4', '3/4', '快板 Allegro', '慢板 Adagio', '摇摆 Swing'];
const categories = ['人声 Vocal', '吉他 Guitar', '贝斯 Bass', '鼓 Drums', '钢琴 Piano', '合成器 Synth', '弦乐 Strings', '管乐 Brass', '打击乐 Percussion', '氛围 Pad'];
const noteTemplates = [
    '经典的开场riff', '适合在夜晚开车时听', '明亮的主旋律', '深沉的贝斯线', '需要混音处理', '客户非常喜欢这个版本', 
    '备用音轨', '包含精彩的吉他独奏', '节奏部分很强劲', '人声情感饱满', '简单的和弦进行', '可以作为背景音乐', '实验性音效'
];

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// --- Database Seeding Logic ---
db.serialize(() => {
    // Optional: Clear the table first to avoid duplicates if script is run multiple times
    console.log('正在清空旧数据...');
    db.run('DELETE FROM tracks', (err) => {
        if (err) return console.error('清空数据表失败', err.message);

        console.log('开始插入1000条模拟数据...');
        const stmt = db.prepare('INSERT INTO tracks (id, name, filename, genre, rhythm, category, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');

        for (let i = 1; i <= 1000; i++) {
            const id = uuidv4();
            const name = `测试歌曲_${i}.mp3`;
            const filename = `${id}.mp3`;
            const genre = getRandomItem(genres);
            const rhythm = getRandomItem(rhythms);
            const category = getRandomItem(categories);
            const notes = `${getRandomItem(noteTemplates)} - (这是第${i}号样本)`;

            stmt.run(id, name, filename, genre, rhythm, category, notes);
        }

        stmt.finalize((err) => {
            if (err) {
                console.error('数据插入失败', err.message);
            } else {
                console.log('1000条模拟数据已成功插入！');
            }
            // --- Close Database Connection Here ---
            db.close((err) => {
                if (err) {
                    return console.error('关闭数据库时出错', err.message);
                }
                console.log('数据库连接已关闭。');
            });
        });
    });
});

// --- Close Database Connection ---
// db.close((err) => {
//     if (err) {
//         return console.error(err.message);
//     }
//     console.log('数据库连接已关闭。');
// }); 