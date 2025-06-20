const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json()); // To parse JSON bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

// Serve static files from 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));

// --- Database Setup ---
const dbPath = path.join(__dirname, 'music.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.serialize(() => {
        // Create Tracks Table
        db.run(`CREATE TABLE IF NOT EXISTS tracks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          filename TEXT NOT NULL UNIQUE,
          genre TEXT,
          rhythm TEXT,
          category TEXT,
          notes TEXT
        )`);

        // Create Playlists Table
        db.run(`CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE
        )`);

        // Create Playlist Items Join Table
        db.run(`CREATE TABLE IF NOT EXISTS playlist_items (
          playlist_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          FOREIGN KEY (playlist_id) REFERENCES playlists(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
          PRIMARY KEY (playlist_id, track_id)
        )`);
    });
    
    // All API endpoints and server listening should be started only after the DB is ready.
    initializeAPIAndStartServer();
  }
});

// Function to scan uploads directory and add new files to database
function scanUploadsDirectory() {
    const uploadsPath = path.join(__dirname, 'uploads');
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];
    
    fs.readdir(uploadsPath, (err, files) => {
        if (err) {
            console.log('扫描uploads目录时出错 (这是正常的，如果目录不存在):', err.message);
            return;
        }
        
        const audioFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return audioExtensions.includes(ext);
        });
        
        if (audioFiles.length === 0) {
            console.log('uploads目录中没有音频文件需要添加');
            return;
        }
        
        // Check which files are already in database
        const placeholders = audioFiles.map(() => '?').join(',');
        const query = `SELECT filename FROM tracks WHERE filename IN (${placeholders})`;
        
        db.all(query, audioFiles, (err, existingFiles) => {
            if (err) {
                console.error('检查现有文件时出错:', err.message);
                return;
            }
            
            const existingFilenames = existingFiles.map(row => row.filename);
            const newFiles = audioFiles.filter(file => !existingFilenames.includes(file));
            
            if (newFiles.length === 0) {
                console.log(`扫描完成：uploads目录中的 ${audioFiles.length} 个音频文件都已在数据库中`);
                return;
            }
            
            console.log(`发现 ${newFiles.length} 个新音频文件，正在添加到数据库...`);
            
            const stmt = db.prepare(`
                INSERT INTO tracks (id, name, filename, genre, rhythm, category, notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            let addedCount = 0;
            newFiles.forEach(filename => {
                const trackId = uuidv4();
                const baseName = path.basename(filename, path.extname(filename));
                const notes = `服务器启动时自动扫描添加 - ${new Date().toLocaleString()}`;
                
                stmt.run(trackId, baseName, filename, '未分类', '4/4拍', '歌曲', notes, (err) => {
                    if (err) {
                        console.error(`添加文件 ${filename} 失败:`, err.message);
                    } else {
                        addedCount++;
                        console.log(`✓ 自动添加: ${baseName}`);
                    }
                });
            });
            
            stmt.finalize(() => {
                if (addedCount > 0) {
                    console.log(`自动扫描完成！成功添加了 ${addedCount} 个音频文件到数据库`);
                }
            });
        });
    });
}

function initializeAPIAndStartServer() {
    // Scan uploads directory for new files when server starts
    console.log('正在扫描uploads目录...');
    scanUploadsDirectory();
    
    // --- File Storage Setup ---
    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'uploads/');
      },
      filename: function (req, file, cb) {
        // Save file with a unique name (uuid + original extension)
        const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
        req.uniqueFilename = uniqueFilename; // Pass the unique name to the request object
        cb(null, uniqueFilename);
      }
    });

    const upload = multer({ storage: storage });
    const excelUpload = multer({ storage: multer.memoryStorage() }); // Store excel in memory

    // --- API Endpoints ---
    
    // File upload endpoint
    app.post('/upload', upload.single('audio'), (req, res) => {
      const { name, genre, rhythm, category, notes } = req.body;
      const trackId = uuidv4();
      const uniqueFilename = req.uniqueFilename;
      
      // 使用用户输入的名称，如果没有输入则使用文件名（去掉扩展名）
      const displayName = name && name.trim() 
        ? name.trim() 
        : path.basename(req.file.originalname, path.extname(req.file.originalname));
    
      const stmt = db.prepare('INSERT INTO tracks (id, name, filename, genre, rhythm, category, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
      stmt.run(trackId, displayName, uniqueFilename, genre, rhythm, category, notes, (err) => {
        if (err) {
          console.error('Error inserting data into database', err.message);
          return res.status(500).send({ message: '数据库错误' });
        }
        // Fetch the just-inserted track to return it to the client
        db.get('SELECT * FROM tracks WHERE id = ?', trackId, (err, row) => {
          if (err) {
            return res.status(500).send({ message: '文件上传成功但无法获取记录' });
          }
          res.status(201).send({ message: '文件上传并记录成功', track: row });
        });
      });
      stmt.finalize();
    });
    
    // Import from Excel endpoint
    app.post('/import', excelUpload.single('excel-file'), (req, res) => {
      if (!req.file) {
        return res.status(400).send({ message: '请上传一个Excel文件' });
      }
    
      try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
    
        if (data.length === 0) {
          return res.status(400).send({ message: 'Excel文件为空或格式不正确' });
        }
    
        // Prepare a statement for updating
        const stmt = db.prepare(`
          UPDATE tracks 
          SET name = ?, genre = ?, rhythm = ?, category = ?, notes = ?
          WHERE id = ?
        `);
    
        let updatedCount = 0;
        data.forEach(row => {
          // Ensure the row has an ID to perform the update
          if (row.id) {
            stmt.run(
              row.name,
              row.genre,
              row.rhythm,
              row.category,
              row.notes,
              row.id,
              function(err) {
                if (err) {
                  console.error(`更新ID ${row.id} 失败:`, err.message);
                } else if (this.changes > 0) {
                  updatedCount++;
                }
              }
            );
          }
        });
    
        stmt.finalize((err) => {
          if (err) {
            return res.status(500).send({ message: '数据库更新时发生错误' });
          }
          res.send({ message: `处理完成，成功更新了 ${updatedCount} 条记录。` });
        });
    
      } catch (error) {
        console.error('处理Excel文件时出错:', error);
        res.status(500).send({ message: '解析Excel文件时发生严重错误' });
      }
    });
    
    // Update a single track endpoint
    app.post('/track/:id', (req, res) => {
      const { name, genre, rhythm, category, notes } = req.body;
      const { id } = req.params;
    
      if (!name) {
        return res.status(400).send({ message: '名称不能为空' });
      }
    
      const stmt = db.prepare(`
        UPDATE tracks 
        SET name = ?, genre = ?, rhythm = ?, category = ?, notes = ?
        WHERE id = ?
      `);
    
      stmt.run(name, genre, rhythm, category, notes, id, function(err) {
        if (err) {
          console.error(`更新ID ${id} 时出错:`, err.message);
          return res.status(500).send({ message: '数据库更新失败' });
        }
        if (this.changes === 0) {
          return res.status(404).send({ message: '未找到匹配的ID' });
        }
        res.send({ message: `音轨 ${name} 更新成功` });
      });
    
      stmt.finalize();
    });
    
        // Audio stream endpoint
    app.get('/audio/:filename', (req, res) => {
        // Filename is now a UUID, so no need for complex decoding.
        const audioPath = path.join(__dirname, 'uploads', req.params.filename);

        // Check if file exists
        if (!fs.existsSync(audioPath)) {
            return res.status(404).send('File not found.');
        }

        // Determine content type based on file extension
        const ext = path.extname(req.params.filename).toLowerCase();
        let contentType = 'audio/mpeg'; // default
        switch (ext) {
            case '.mp3':
                contentType = 'audio/mpeg';
                break;
            case '.wav':
                contentType = 'audio/wav';
                break;
            case '.m4a':
                contentType = 'audio/mp4';
                break;
            case '.flac':
                contentType = 'audio/flac';
                break;
            case '.ogg':
                contentType = 'audio/ogg';
                break;
            case '.aac':
                contentType = 'audio/aac';
                break;
        }

        const stat = fs.statSync(audioPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(audioPath, { start, end });
            const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            };
            res.writeHead(200, head);
            fs.createReadStream(audioPath).pipe(res);
        }
    });
    
    // Get file list endpoint
    app.get('/list', (req, res) => {
      const { search } = req.query;
      let query = 'SELECT * FROM tracks ORDER BY name';
      const params = [];
    
      if (search && search.trim() !== '') {
        const keywords = search.split(' ').filter(k => k.trim() !== '');
        
        if (keywords.length > 0) {
          const conditions = keywords.map(() => 
            '(name LIKE ? OR genre LIKE ? OR rhythm LIKE ? OR category LIKE ? OR notes LIKE ?)'
          );
          
          query = `SELECT * FROM tracks WHERE ${conditions.join(' AND ')} ORDER BY name`;
          
          keywords.forEach(keyword => {
            const searchTerm = `%${keyword}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
          });
        }
      }
    
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error querying database', err.message);
          return res.status(500).send({ message: '无法获取列表' });
        }
        res.send(rows);
      });
    });
    
    // Export to Excel endpoint
    app.get('/export', (req, res) => {
      db.all('SELECT id, name, genre, rhythm, category, notes, filename FROM tracks', [], (err, rows) => {
        if (err) {
          console.error('Error fetching data for export', err.message);
          return res.status(500).send({ message: '导出时无法获取数据' });
        }
    
        // Convert JSON data to a worksheet
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Tracks');
    
        // Set headers to trigger download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="music_library.xlsx"');
    
        // Write workbook to response
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        res.send(buffer);
      });
    });
    
    // --- Playlist API Endpoints ---
    
    // Create a new playlist
    app.post('/playlists', (req, res) => {
      const { name } = req.body;
      if (!name || name.trim() === '') {
        return res.status(400).send({ message: '歌单名称不能为空' });
      }
      const id = uuidv4();
      db.run('INSERT INTO playlists (id, name) VALUES (?, ?)', [id, name], function(err) {
        if (err) {
          console.error('创建歌单失败:', err.message);
          // SQLite UNIQUE constraint failure error code
          if (err.errno === 19) {
              return res.status(409).send({ message: '创建歌单失败，该名称已存在。' });
          }
          return res.status(500).send({ message: '创建歌单失败，发生数据库错误。' });
        }
        res.status(201).send({ message: '歌单创建成功', id: id, name: name });
      });
    });
    
    // Get all playlists
    app.get('/playlists', (req, res) => {
      db.all('SELECT * FROM playlists ORDER BY name', [], (err, rows) => {
        if (err) {
          console.error('获取歌单列表失败:', err.message);
          return res.status(500).send({ message: '无法获取歌单列表' });
        }
        res.send(rows);
      });
    });
    
    // Add a track to a playlist
    app.post('/playlists/:id/tracks', (req, res) => {
      const { track_id } = req.body;
      const playlist_id = req.params.id;
      if (!track_id) {
        return res.status(400).send({ message: '未提供歌曲ID' });
      }
      db.run('INSERT INTO playlist_items (playlist_id, track_id) VALUES (?, ?)', [playlist_id, track_id], function(err) {
        if (err) {
          console.error('添加歌曲到歌单失败:', err.message);
          if (err.errno === 19) { // PRIMARY KEY constraint failed
              return res.status(409).send({ message: '添加失败，该歌曲已在此歌单中。' });
          }
          return res.status(500).send({ message: '添加歌曲失败，发生数据库错误。' });
        }
        res.status(201).send({ message: '歌曲已成功添加到歌单' });
      });
    });

    // Remove a track from a playlist
    app.delete('/playlists/:playlist_id/tracks/:track_id', (req, res) => {
      const { playlist_id, track_id } = req.params;
      
      if (!playlist_id || !track_id) {
        return res.status(400).send({ message: '歌单ID和歌曲ID都是必需的' });
      }

      db.run('DELETE FROM playlist_items WHERE playlist_id = ? AND track_id = ?', [playlist_id, track_id], function(err) {
        if (err) {
          console.error('从歌单删除歌曲失败:', err.message);
          return res.status(500).send({ message: '删除歌曲失败，发生数据库错误。' });
        }
        
        if (this.changes === 0) {
          return res.status(404).send({ message: '未找到要删除的歌曲，可能该歌曲不在此歌单中。' });
        }
        
        res.status(200).send({ message: '歌曲已成功从歌单中删除' });
      });
    });
    
    // Get a single playlist with all its tracks
    app.get('/playlists/:id', (req, res) => {
      const playlist_id = req.params.id;
      const query = `
        SELECT p.name as playlistName, t.* 
        FROM tracks t
        JOIN playlist_items pi ON t.id = pi.track_id
        JOIN playlists p ON p.id = pi.playlist_id
        WHERE pi.playlist_id = ?
      `;
      db.all(query, [playlist_id], (err, rows) => {
        if (err) {
          console.error('获取歌单内容失败:', err.message);
          return res.status(500).send({ message: '无法获取歌单内容' });
        }
        // If playlist is empty, we still want to know its name.
        if (rows.length === 0) {
            db.get('SELECT name FROM playlists WHERE id = ?', [playlist_id], (err, playlist) => {
                if (err) {
                    return res.status(500).send({ message: '无法获取歌单内容' });
                }
                if (playlist) {
                     res.send({playlistName: playlist.name, tracks: []});
                } else {
                     res.status(404).send({message: '未找到该歌单'});
                }
            });
        } else {
            // The playlistName is repeated in every row, so we extract it once
            const playlistName = rows[0].playlistName;
            // We can remove the redundant playlistName from each track object if we want
            const tracks = rows.map(t => {
                const { playlistName, ...track } = t;
                return track;
            });
            res.send({ playlistName: playlistName, tracks: tracks });
        }
      });
    });
    
    // Share endpoint for public playlist viewing
    app.get('/share/:id', (req, res) => {
      const playlist_id = req.params.id;
      const query = `
        SELECT p.name as playlistName, t.* 
        FROM tracks t
        JOIN playlist_items pi ON t.id = pi.track_id
        JOIN playlists p ON p.id = pi.playlist_id
        WHERE pi.playlist_id = ?
      `;
       db.all(query, [playlist_id], (err, rows) => {
        if (err) {
          console.error('获取分享歌单失败:', err.message);
          return res.status(500).send({ message: '无法获取分享歌单' });
        }
        
        // If playlist is empty, we still want to return the playlist name
        if (rows.length === 0) {
            db.get('SELECT name FROM playlists WHERE id = ?', [playlist_id], (err, playlist) => {
                if (err) {
                    return res.status(500).send({ message: '无法获取分享歌单' });
                }
                if (playlist) {
                     res.send([{playlistName: playlist.name}]); // Return array format for consistency
                } else {
                     res.status(404).send({message: '未找到该歌单'});
                }
            });
        } else {
            res.send(rows);
        }
      });
    });

    app.listen(port, '0.0.0.0', () => {
      console.log(`服务器运行在 http://0.0.0.0:${port}`);
      console.log(`外网访问地址: http://你的服务器IP:${port}`);
    });
} 