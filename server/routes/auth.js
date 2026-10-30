// ==========================================
// Wansa - Auth Routes
// ==========================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// استدعاء مكتبة Brevo (الطريقة الحديثة)
const { BrevoClient } = require('@getbrevo/brevo');

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
// POST /api/auth/forgot-password (إرسال الكود للبريد)
// ==========================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) return res.status(400).json({ error: 'البريد أو الهاتف مطلوب' });

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    });

    if (!user) {
      return res.status(404).json({ error: 'لا يوجد حساب بهذا البريد أو الهاتف' });
    }

    if (!user.email) {
      return res.status(400).json({ error: 'هذا الحساب مسجل برقم الهاتف فقط. لا يمكن إرسال كود للاستعادة.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 دقائق
    await user.save();

    try {
      // استخدام BrevoClient
      const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

      await brevo.transactionalEmails.sendTransacEmail({
        subject: "🔐 كود استعادة كلمة المرور - Wansa",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #f0f2f5; border-radius: 10px;">
            <h2 style="color: #075E54; text-align: center;">Wansa</h2>
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <p>مرحباً <strong>${user.username}</strong>،</p>
              <p>لقد طلبت استعادة كلمة المرور الخاصة بك. إليك كود التحقق:</p>
              <div style="text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #25D366; background: #e9edef; padding: 10px 20px; border-radius: 8px;">${code}</span>
              </div>
              <p>هذا الكود صالح لمدة 10 دقائق فقط. إذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة.</p>
            </div>
            <p style="text-align: center; color: #667781; font-size: 12px; margin-top: 20px;">Wansa - تطبيق المحادثة الفورية</p>
          </div>
        `,
        sender: { name: "Wansa", email: "bdalhadymhmd712@gmail.com" }, // ⚠️ بريدك الموثق
        to: [{ email: user.email, name: user.username }]
      });

      console.log(`✅ تم إرسال كود التحقق إلى ${user.email}`);
      res.json({ message: '✅ تم إرسال كود التحقق إلى بريدك الإلكتروني' });

    } catch (emailErr) {
      console.error('فشل إرسال البريد:', emailErr);
      res.status(500).json({ 
        error: 'فشل إرسال البريد: ' + (emailErr.body?.message || emailErr.message) 
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/auth/verify-code (التحقق من الكود)
// ==========================================
router.post('/verify-code', async (req, res) => {
  try {
    const { identifier, code } = req.body;

    if (!identifier || !code) return res.status(400).json({ error: 'البيانات مطلوبة' });

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    });

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

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
// POST /api/auth/reset-password (تعيين كلمة مرور جديدة)
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