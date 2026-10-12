// ==========================================
// Wansa - Auth Routes
// ==========================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// ==========================================
// دالة مساعدة: إنشاء JWT
// ==========================================
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// ==========================================
// POST /api/auth/register - تسجيل مستخدم جديد
// ==========================================
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // التحقق من المدخلات
    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'جميع الحقول مطلوبة (username, email, password)'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
      });
    }

    // التحقق من وجود المستخدم
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? 'البريد' : 'اسم المستخدم';
      return res.status(400).json({
        error: `${field} مستخدم بالفعل`
      });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // إنشاء المستخدم
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password: hashedPassword
    });

    // إنشاء التوكن
    const token = generateToken(user._id);

    res.status(201).json({
      message: '✅ تم التسجيل بنجاح',
      token,
      user
    });
  } catch (err) {
    console.error('خطأ في التسجيل:', err.message);
    res.status(500).json({
      error: 'حدث خطأ في السيرفر أثناء التسجيل'
    });
  }
});

// ==========================================
// POST /api/auth/login - تسجيل الدخول
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'البريد وكلمة المرور مطلوبان'
      });
    }

    // البحث عن المستخدم
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      });
    }

    // مقارنة كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      });
    }

    // تحديث حالة الاتصال
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // إنشاء التوكن
    const token = generateToken(user._id);

    res.json({
      message: '✅ تم تسجيل الدخول بنجاح',
      token,
      user
    });
  } catch (err) {
    console.error('خطأ في الدخول:', err.message);
    res.status(500).json({
      error: 'حدث خطأ في السيرفر أثناء الدخول'
    });
  }
});

// ==========================================
// GET /api/auth/me - بيانات المستخدم الحالي
// ==========================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        error: 'المستخدم غير موجود'
      });
    }

    res.json({ user });
  } catch (err) {
    res.status(500).json({
      error: 'حدث خطأ في السيرفر'
    });
  }
});

module.exports = router;