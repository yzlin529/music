const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'music.db');
const uploadsPath = path.join(__dirname, 'uploads');

const db = new sqlite3.Database(dbPath);

// 支持的音频文件扩展名
const audioExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];

// 根据文件名智能推断音乐信息
function inferMusicInfo(filename) {
    const baseName = path.basename(filename, path.extname(filename));
    
    // 基于文件名推断风格和类型
    let genre = '未分类';
    let category = '歌曲';
    let rhythm = '4/4拍';
    
    // 风格推断规则
    if (baseName.includes('钢琴') || baseName.includes('piano')) {
        genre = '古典';
        category = '器乐';
    } else if (baseName.includes('摇滚') || baseName.includes('rock')) {
        genre = '摇滚';
    } else if (baseName.includes('流行') || baseName.includes('pop')) {
        genre = '流行';
    } else if (baseName.includes('爵士') || baseName.includes('jazz')) {
        genre = '爵士';
    } else if (baseName.includes('民谣') || baseName.includes('folk')) {
        genre = '民谣';
    } else if (baseName.includes('电子') || baseName.includes('electronic')) {
        genre = '电子';
    } else if (baseName.includes('古典') || baseName.includes('classical')) {
        genre = '古典';
        category = '器乐';
    } else if (baseName.includes('背景') || baseName.includes('ambient')) {
        genre = '氛围';
        category = '背景音乐';
    } else if (baseName.includes('工作') || baseName.includes('work')) {
        genre = '氛围';
        category = '背景音乐';
    } else if (baseName.includes('汽车') || baseName.includes('引擎')) {
        genre = '环境音';
        category = '音效';
    } else if (baseName.includes('笑') || baseName.includes('哈哈') || baseName.includes('声音')) {
        genre = '音效';
        category = '音效';
    } else {
        // 根据文件名长度和内容进一步推断
        if (baseName.length > 10) {
            genre = '流行';
        } else {
            genre = '器乐';
        }
    }
    
    // 类型推断
    if (baseName.includes('配乐') || baseName.includes('soundtrack')) {
        category = '配乐';
    } else if (baseName.includes('主题') || baseName.includes('theme')) {
        category = '主题曲';
    } else if (baseName.includes('间奏') || baseName.includes('interlude')) {
        category = '间奏';
    } else if (baseName.includes('前奏') || baseName.includes('intro')) {
        category = '前奏';
    }
    
    return { genre, category, rhythm };
}

function scanUploadsDirectory() {
    console.log('开始扫描 uploads 目录...');
    
    fs.readdir(uploadsPath, (err, files) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return;
        }
        
        // 过滤出音频文件
        const audioFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return audioExtensions.includes(ext);
        });
        
        console.log(`找到 ${audioFiles.length} 个音频文件`);
        
        if (audioFiles.length === 0) {
            console.log('没有找到音频文件，扫描结束。');
            db.close();
            return;
        }
        
        // 检查哪些文件已经在数据库中
        const placeholders = audioFiles.map(() => '?').join(',');
        const query = `SELECT filename FROM tracks WHERE filename IN (${placeholders})`;
        
        db.all(query, audioFiles, (err, existingFiles) => {
            if (err) {
                console.error('查询现有文件失败:', err);
                return;
            }
            
            const existingFilenames = existingFiles.map(row => row.filename);
            const newFiles = audioFiles.filter(file => !existingFilenames.includes(file));
            
            console.log(`其中 ${existingFilenames.length} 个文件已在数据库中`);
            console.log(`需要添加 ${newFiles.length} 个新文件`);
            
            if (newFiles.length === 0) {
                console.log('所有文件都已在数据库中，无需添加。');
                db.close();
                return;
            }
            
            // 准备插入语句
            const stmt = db.prepare(`
                INSERT INTO tracks (id, name, original_filename, filename, genre, rhythm, category, notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            let addedCount = 0;
            
            newFiles.forEach(filename => {
                const trackId = uuidv4();
                const baseName = path.basename(filename, path.extname(filename));
                const { genre, category, rhythm } = inferMusicInfo(filename);
                const notes = `从 uploads 目录扫描添加 - ${new Date().toLocaleString()}`;
                
                stmt.run(trackId, baseName, filename, filename, genre, rhythm, category, notes, (err) => {
                    if (err) {
                        console.error(`添加文件 ${filename} 失败:`, err.message);
                    } else {
                        addedCount++;
                        console.log(`✓ 添加: ${baseName} (${genre} - ${category})`);
                    }
                    
                    // 检查是否全部完成
                    if (addedCount + (newFiles.length - addedCount) >= newFiles.length) {
                        stmt.finalize(() => {
                            console.log(`\n扫描完成！成功添加了 ${addedCount} 个音频文件到数据库。`);
                            
                            // 显示最终统计
                            db.get('SELECT COUNT(*) as total FROM tracks', (err, row) => {
                                if (!err) {
                                    console.log(`数据库中现在总共有 ${row.total} 条音乐记录`);
                                }
                                db.close();
                            });
                        });
                    }
                });
            });
        });
    });
}

// 运行扫描
scanUploadsDirectory(); 