// ==========================================
// Wansa - Chat Routes
// ==========================================

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

// ==========================================
// GET /api/chats/users - البحث (فقط بالهاتف أو البريد)
// ==========================================
router.get('/users', auth, async (req, res) => {
  try {
    const { search } = req.query;

    // إذا لم يكن هناك بحث، أرجع قائمة فارغة
    if (!search || !search.trim()) {
      return res.json([]);
    }

    const searchTerm = search.trim();

    // البحث فقط في الهاتف أو البريد
    const users = await User.find({
      _id: { $ne: req.userId }, // استبعاد نفسي
      $or: [
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } }
      ]
    })
      .select('-password')
      .limit(20);

    res.json(users);
  } catch (err) {
    console.error('خطأ جلب المستخدمين:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/chats - إنشاء أو جلب محادثة فردية
// ==========================================
router.post('/', auth, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId مطلوب' });
    }

    if (userId === req.userId.toString()) {
      return res.status(400).json({ error: 'لا يمكنك محادثة نفسك' });
    }

    let chat = await Chat.findOne({
      isGroup: false,
      members: { $all: [req.userId, userId], $size: 2 }
    }).populate('members', '-password')
      .populate('lastMessage');

    if (!chat) {
      chat = await Chat.create({
        isGroup: false,
        members: [req.userId, userId]
      });
      chat = await chat.populate('members', '-password');
    }

    res.json(chat);
  } catch (err) {
    console.error('خطأ إنشاء محادثة:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/chats/group - إنشاء مجموعة
// ==========================================
router.post('/group', auth, async (req, res) => {
  try {
    const { name, members } = req.body;

    if (!name || !members || members.length < 2) {
      return res.status(400).json({
        error: 'اسم المجموعة ومستخدمين (2 على الأقل) مطلوبان'
      });
    }

    const allMembers = [...new Set([...members, req.userId.toString()])];

    const chat = await Chat.create({
      isGroup: true,
      name,
      members: allMembers,
      admin: req.userId
    });

    const populated = await chat.populate('members', '-password');
    res.status(201).json(populated);
  } catch (err) {
    console.error('خطأ إنشاء مجموعة:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// GET /api/chats - جلب كل محادثات المستخدم
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ members: req.userId })
      .populate('members', '-password')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.json(chats);
  } catch (err) {
    console.error('خطأ جلب المحادثات:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// GET /api/chats/:chatId - جلب محادثة محددة
// ==========================================
router.get('/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      members: req.userId
    })
      .populate('members', '-password')
      .populate('lastMessage');

    if (!chat) {
      return res.status(404).json({ error: 'المحادثة غير موجودة' });
    }

    res.json(chat);
  } catch (err) {
    console.error('خطأ جلب المحادثة:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

module.exports = router;