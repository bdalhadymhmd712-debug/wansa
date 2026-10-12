// ==========================================
// Wansa - Message Routes
// ==========================================

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const Chat = require('../models/Chat');

// ==========================================
// GET /api/messages/:chatId - جلب رسائل محادثة
// ==========================================
router.get('/:chatId', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // التحقق أن المستخدم عضو في المحادثة
    const chat = await Chat.findOne({
      _id: chatId,
      members: req.userId
    });

    if (!chat) {
      return res.status(403).json({ error: 'غير مصرح بالوصول لهذه المحادثة' });
    }

    const messages = await Message.find({
      chatId,
      deletedFor: { $ne: req.userId }
    })
      .populate('sender', 'username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      messages: messages.reverse(),
      page,
      hasMore: messages.length === limit
    });
  } catch (err) {
    console.error('خطأ جلب الرسائل:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// POST /api/messages - إرسال رسالة جديدة
// ==========================================
router.post('/', auth, async (req, res) => {
  try {
    const { chatId, content, type } = req.body;

    if (!chatId || !content) {
      return res.status(400).json({ error: 'chatId و content مطلوبان' });
    }

    // التحقق أن المستخدم عضو في المحادثة
    const chat = await Chat.findOne({
      _id: chatId,
      members: req.userId
    });

    if (!chat) {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    // إنشاء الرسالة
    const message = await Message.create({
      chatId,
      sender: req.userId,
      content,
      type: type || 'text'
    });

    // تحديث آخر رسالة في المحادثة
    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

    const populated = await message.populate('sender', 'username avatar');

    res.status(201).json(populated);
  } catch (err) {
    console.error('خطأ إرسال الرسالة:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// ==========================================
// PUT /api/messages/:messageId/read - تحديد مقروءة
// ==========================================
router.put('/:messageId/read', auth, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.messageId,
      {
        $addToSet: { readBy: req.userId },
        status: 'read'
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'الرسالة غير موجودة' });
    }

    res.json(message);
  } catch (err) {
    console.error('خطأ تحديد مقروءة:', err.message);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

module.exports = router;