const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Status = require('../models/Status');
const User = require('../models/User');

// إنشاء حالة جديدة
router.post('/', auth, async (req, res) => {
  try {
    const { type, content, backgroundColor } = req.body;
    const status = await Status.create({
      user: req.userId,
      type,
      content,
      backgroundColor: backgroundColor || '#075E54'
    });
    res.status(201).json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب الحالات المتاحة
router.get('/', auth, async (req, res) => {
  try {
    const me = await User.findById(req.userId);
    const statuses = await Status.find()
      .populate('user', 'username avatar privacy')
      .sort({ createdAt: -1 });

    // فلترة الحالات بناءً على الخصوصية
    const filtered = statuses.filter(s => {
      if (s.user._id.toString() === req.userId) return true; // حالاتي
      const privacy = s.user.privacy;
      if (privacy.statusViewers === 'everyone') return true;
      if (privacy.statusViewers === 'contacts') return true; // مبسط: نفترض أنهم جهات اتصال
      if (privacy.statusViewers === 'selected') {
        return privacy.allowedViewers.some(id => id.toString() === req.userId);
      }
      return false;
    });

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;