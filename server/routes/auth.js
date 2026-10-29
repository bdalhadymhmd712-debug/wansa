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
    res.status(500).json({ error: err.message || 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/auth/login
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'البيانات مطلوبة' });
    }

    const user = await User.findOne({
      $or: [{ email: login.toLowerCase() }, { phone: login }]
    });

    if (!user) return res.status(401).json({ error: 'البيانات غير صحيحة' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'البيانات غير صحيحة' });

    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    const token = generateToken(user._id);
    res.json({ message: '✅ تم تسجيل الدخول', token, user });

  } catch (err) {
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

// ==========================================
// POST /api/auth/forgot-password
// إرسال كود التحقق
// ==========================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body; // البريد أو الهاتف

    if (!identifier) return res.status(400).json({ error: 'البريد أو الهاتف مطلوب' });

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    });

    if (!user) {
      return res.status(404).json({ error: 'لا يوجد حساب بهذا البريد أو الهاتف' });
    }

    // توليد كود 6 أرقام
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // حفظ الكود في قاعدة البيانات مع وقت انتهاء (10 دقائق)
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // ==========================================
    // ⚠️ ملاحظة: لا يوجد سيرفر بريد حقيقي متصل حالياً
    // لذلك سنطبع الكود في Terminal الخاص بالسيرفر
    // ==========================================
    console.log('\n════════════════════════════════════════');
    console.log('🔐 كود استعادة كلمة المرور');
    console.log(`👤 الحساب: ${user.username}`);
    console.log(`📧 البريد: ${user.email || 'لا يوجد'}`);
    console.log(`📱 الهاتف: ${user.phone || 'لا يوجد'}`);
    console.log(`🔢 الكود: ${code}`);
    console.log('════════════════════════════════════════\n');

    // للاختبار: نرجع الكود في الـ Response (يجب إزالته في الإنتاج)
    res.json({ 
      message: '✅ تم إرسال كود التحقق. (ملاحظة: الكود يظهر في Logs السيرفر)', 
      codeForTesting: code 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/auth/verify-code
// التحقق من الكود
// ==========================================
router.post('/verify-code', async (req, res) => {
  try {
    const { identifier, code } = req.body;

    if (!identifier || !code) return res.status(400).json({ error: 'البيانات مطلوبة' });

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    });

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // التحقق من انتهاء صلاحية الكود
    if (!user.resetCode || user.resetCode !== code) {
      return res.status(400).json({ error: 'الكود غير صحيح' });
    }
    if (new Date() > user.resetCodeExpires) {
      return res.status(400).json({ error: 'انتهت صلاحية الكود. اطلب كوداً جديداً' });
    }

    res.json({ message: '✅ الكود صحيح', valid: true });

  } catch (err) {
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/auth/reset-password
// إعادة تعيين كلمة المرور
// ==========================================
router.post('/reset-password', async (req, res) => {
  try {
    const { identifier, code, newPassword } = req.body;

    if (!identifier || !code || !newPassword) return res.status(400).json({ error: 'البيانات مطلوبة' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    });

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (!user.resetCode || user.resetCode !== code) {
      return res.status(400).json({ error: 'الكود غير صحيح' });
    }
    if (new Date() > user.resetCodeExpires) {
      return res.status(400).json({ error: 'انتهت صلاحية الكود' });
    }

    // تحديث كلمة المرور وإزالة الكود
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    res.json({ message: '✅ تم تغيير كلمة المرور بنجاح. يمكنك الدخول الآن' });

  } catch (err) {
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

module.exports = router;