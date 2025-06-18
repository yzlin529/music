const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const dbPath = path.join(__dirname, 'music.db');
const db = new sqlite3.Database(dbPath);

// 音乐相关的数据
const genres = [
    '流行', '摇滚', '古典', '爵士', '电子', '民谣', '说唱', '布鲁斯', '金属', '雷鬼',
    '乡村', '放克', '朋克', '新世纪', '氛围', '迷幻', '独立', '另类', '后摇', '实验'
];

const rhythms = [
    '4/4拍', '3/4拍', '2/4拍', '6/8拍', '慢板', '中板', '快板', '华尔兹', '进行曲', '摇摆'
];

const categories = [
    '歌曲', '器乐', '配乐', '背景音乐', '主题曲', '插曲', '间奏', '前奏', '尾声', '变奏'
];

const instruments = [
    '钢琴', '吉他', '小提琴', '大提琴', '萨克斯', '长笛', '架子鼓', '贝斯', '键盘', '口琴',
    '二胡', '古筝', '琵琶', '笛子', '唢呐', '竹笛', '葫芦丝', '马头琴', '古琴', '箫'
];

const moods = [
    '欢快', '忧伤', '激昂', '温柔', '神秘', '浪漫', '沉思', '活泼', '宁静', '激烈',
    '梦幻', '怀旧', '希望', '孤独', '狂野', '优雅', '紧张', '轻松', '深沉', '明亮'
];

const themes = [
    '爱情', '友情', '家庭', '自然', '城市', '乡村', '青春', '回忆', '梦想', '旅行',
    '季节', '夜晚', '黎明', '雨天', '晴空', '海洋', '山川', '花朵', '星空', '月亮'
];

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function generateTrackName() {
    const patterns = [
        () => `${getRandomElement(moods)}的${getRandomElement(instruments)}曲`,
        () => `${getRandomElement(themes)}${getRandomElement(['之歌', '幻想曲', '小调', '协奏曲', '奏鸣曲'])}`,
        () => `${getRandomElement(instruments)}与${getRandomElement(themes)}`,
        () => `${getRandomElement(['夜晚', '黎明', '午后', '黄昏'])}的${getRandomElement(moods)}`,
        () => `${getRandomElement(themes)}${getRandomElement(['回响', '旋律', '韵律', '和声', '变奏'])}`,
        () => `${getRandomElement(instruments)}${getRandomElement(['独奏', '二重奏', '协奏', '变奏', '即兴'])}`,
        () => `${getRandomElement(['春', '夏', '秋', '冬'])}日${getRandomElement(moods)}曲`,
        () => `${getRandomElement(moods)}的${getRandomElement(['钢琴', '小提琴', '吉他', '萨克斯'])}`,
        () => `${getRandomElement(themes)}中的${getRandomElement(instruments)}`,
        () => `${getRandomElement(['温柔', '激昂', '宁静', '欢快'])}${getRandomElement(['钢琴', '小提琴', '古筝', '二胡'])}曲`
    ];
    
    return getRandomElement(patterns)();
}

function generateNotes() {
    const noteTypes = [
        () => `${getRandomElement(instruments)}演奏，${getRandomElement(moods)}风格`,
        () => `适合${getRandomElement(['冥想', '学习', '工作', '休息', '运动'])}时聆听`,
        () => `${getRandomElement(rhythms)}节拍，${getRandomElement(['大调', '小调', '五声调式'])}`,
        () => `融合了${getRandomElement(themes)}元素的${getRandomElement(genres)}作品`,
        () => `${getRandomElement(['现代', '传统', '融合', '创新'])}${getRandomElement(instruments)}音乐`,
        () => `表达${getRandomElement(themes)}情感的${getRandomElement(['经典', '原创', '改编'])}作品`,
        () => `以${getRandomElement(instruments)}为主，${getRandomElement(moods)}氛围`,
        () => `${getRandomElement(['东方', '西方', '民族', '现代'])}音乐风格融合`,
        () => null // 有些歌曲没有备注
    ];
    
    return getRandomElement(noteTypes)();
}

// 生成1000条数据
console.log('开始生成1000条音乐数据...');

const stmt = db.prepare(`
    INSERT INTO tracks (id, name, original_filename, filename, genre, rhythm, category, notes) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 1; i <= 1000; i++) {
    const trackId = uuidv4();
    const name = generateTrackName();
    const originalFilename = `${name}.mp3`;
    const filename = `${trackId}.mp3`;
    const genre = getRandomElement(genres);
    const rhythm = getRandomElement(rhythms);
    const category = getRandomElement(categories);
    const notes = generateNotes();
    
    stmt.run(trackId, name, originalFilename, filename, genre, rhythm, category, notes, (err) => {
        if (err) {
            console.error(`插入第${i}条数据时出错:`, err.message);
        } else if (i % 100 === 0) {
            console.log(`已生成 ${i} 条数据...`);
        }
    });
}

stmt.finalize((err) => {
    if (err) {
        console.error('完成数据插入时出错:', err.message);
    } else {
        console.log('成功生成1000条音乐数据！');
        
        // 验证数据
        db.get('SELECT COUNT(*) as count FROM tracks', (err, row) => {
            if (err) {
                console.error('验证数据时出错:', err.message);
            } else {
                console.log(`数据库中现在总共有 ${row.count} 条音乐记录`);
            }
            db.close();
        });
    }
}); 