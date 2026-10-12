// ==========================================
// Wansa - التطبيق الرئيسي
// ==========================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8 // 100MB
});

app.set('io', io);

// ==========================================
// Middleware
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'client')));

// ==========================================
// إعداد مجلد الرفع
// ==========================================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 تم إنشاء مجلد uploads');
}

// خدمة الملفات المرفوعة
app.use('/uploads', express.static(uploadsDir));

// إعداد multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueName + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // الأنواع المسموحة
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg',
    'application/pdf', 'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('نوع الملف غير مسموح'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

// ==========================================
// الاتصال بقاعدة البيانات
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB متصل بنجاح'))
  .catch((err) => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    process.exit(1);
  });

// ==========================================
// المسارات
// ==========================================
const authRoutes = require('./server/routes/auth');
const chatRoutes = require('./server/routes/chats');
const messageRoutes = require('./server/routes/messages');

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// ==========================================
// مسار رفع الملفات
// ==========================================
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileMimeType: req.file.mimetype
    });
  } catch (err) {
    console.error('خطأ الرفع:', err.message);
    res.status(500).json({ error: 'فشل الرفع' });
  }
});

// ==========================================
// الصحة
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Wansa',
    message: 'السيرفر يعمل بنجاح 🚀',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// معالج الأخطاء
// ==========================================
app.use((err, req, res, next) => {
  console.error('خطأ:', err.message);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'حجم الملف كبير جداً (الحد 25MB)' });
  }

  res.status(err.status || 500).json({ error: err.message || 'حدث خطأ' });
});

// ==========================================
// Socket.IO
// ==========================================
const socketHandler = require('./server/socket/socketHandler');
socketHandler(io);

// ==========================================
// التشغيل
// ==========================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('   🚀 Wansa Server يعمل الآن');
  console.log('════════════════════════════════════════');
  console.log(`   🌐 السيرفر:    http://localhost:${PORT}`);
  console.log(`   📎 رفع الملفات: http://localhost:${PORT}/api/upload`);
  console.log(`   📁 المجلد:     /uploads`);
  console.log('════════════════════════════════════════');
  console.log('');
});