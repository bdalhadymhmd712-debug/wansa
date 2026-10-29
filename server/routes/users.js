const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// تحديث الملف الشخصي
router.put('/profile', auth, async (req, res) => {
  try {
    const { bio, avatar } = req.body;
    const user = await User.findById(req.userId);
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث إعدادات الخصوصية
router.put('/privacy', auth, async (req, res) => {
  try {
    const { hideActivity, statusViewers, allowedViewers } = req.body;
    const user = await User.findById(req.userId);
    
    if (hideActivity !== undefined) user.privacy.hideActivity = hideActivity;
    if (statusViewers !== undefined) user.privacy.statusViewers = statusViewers;
    if (allowedViewers !== undefined) user.privacy.allowedViewers = allowedViewers;
    
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف الحساب
router.delete('/account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.userId);
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    
    await User.findByIdAndDelete(req.userId);
    res.json({ message: 'تم حذف الحساب بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;