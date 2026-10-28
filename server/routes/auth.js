// ==========================================
// Wansa - Auth Routes
// ==========================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
};

// ==========================================
// POST /api/auth/register
// ==========================================
router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    if (!username || !password || (!email && !phone)) {
      return res.status(400).json({ error: 'الاسم، كلمة المرور، والبريد أو الهاتف مطلوبان' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    // التحقق من وجود المستخدم
    const query = [{ username }];
    if (email) query.push({ email: email.toLowerCase() });
    if (phone) query.push({ phone });

    const existingUser = await User.findOne({ $or: query });
    if (existingUser) {
      if (existingUser.username === username) return res.status(400).json({ error: 'اسم المستخدم مستخدم بالفعل' });
      if (email && existingUser.email === email.toLowerCase()) return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
      if (phone && existingUser.phone === phone) return res.status(400).json({ error: 'رقم الهاتف مستخدم بالفعل' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email: email ? email.toLowerCase() : undefined,
      phone,
      password: hashedPassword
    });

    const token = generateToken(user._id);
    res.status(201).json({ message: '✅ تم التسجيل بنجاح', token, user });

  } catch (err) {
    console.error('خطأ في التسجيل:', err.message);
    res.status(500).json({ error: err.message || 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/auth/login (يدعم البريد أو الهاتف)
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body; // login: البريد أو الهاتف

    if (!login || !password) {
      return res.status(400).json({ error: 'البريد/الهاتف وكلمة المرور مطلوبان' });
    }

    // البحث بالبريد أو الهاتف
    const user = await User.findOne({
      $or: [
        { email: login.toLowerCase() },
        { phone: login }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'البيانات غير صحيحة' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'البيانات غير صحيحة' });
    }

    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    const token = generateToken(user._id);
    res.json({ message: '✅ تم تسجيل الدخول', token, user });

  } catch (err) {
    console.error('خطأ في الدخول:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// GET /api/auth/me
// ==========================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

module.exports = router;