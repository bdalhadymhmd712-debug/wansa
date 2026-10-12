// ==========================================
// Wansa - Socket.IO Handler
// ==========================================

const mongoose = require('mongoose');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

const onlineUsers = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 اتصال جديد:', socket.id);

    // ==========================================
    // 1. المستخدم متصل
    // ==========================================
    socket.on('userOnline', async (userId) => {
      try {
        onlineUsers.set(userId, socket.id);
        socket.userId = userId;
        await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
        io.emit('onlineUsers', Array.from(onlineUsers.keys()));
        console.log(`🟢 المستخدم ${userId} متصل`);
      } catch (err) {
        console.error('خطأ userOnline:', err.message);
      }
    });

    // ==========================================
    // 2. الانضمام لغرفة
    // ==========================================
    socket.on('joinChat', (chatId) => {
      socket.join(chatId);
      console.log(`📥 انضم إلى غرفة ${chatId}`);
    });

    // ==========================================
    // 3. إرسال رسالة (نص / صورة / فيديو / ملف)
    // ==========================================
    socket.on('sendMessage', async (data) => {
      try {
        const { chatId, senderId, content, type, replyTo, fileUrl, fileName, fileSize, fileMimeType } = data;

        if (!chatId || !senderId) {
          return socket.emit('error', { message: 'بيانات ناقصة' });
        }

        // إذا كان نوع نص، يجب أن يحتوي على محتوى
        if ((!type || type === 'text') && !content) {
          return socket.emit('error', { message: 'الرسالة فارغة' });
        }

        // إذا كان ملف، يجب أن يحتوي على رابط
        if (type && type !== 'text' && !fileUrl) {
          return socket.emit('error', { message: 'الملف مفقود' });
        }

        const chat = await Chat.findOne({
          _id: new mongoose.Types.ObjectId(chatId),
          members: new mongoose.Types.ObjectId(senderId)
        });

        if (!chat) {
          return socket.emit('error', { message: 'غير مصرح' });
        }

        const messageData = {
          chatId,
          sender: senderId,
          content: content || '',
          type: type || 'text',
          status: 'sent'
        };

        if (replyTo) messageData.replyTo = replyTo;
        if (fileUrl) messageData.fileUrl = fileUrl;
        if (fileName) messageData.fileName = fileName;
        if (fileSize) messageData.fileSize = fileSize;
        if (fileMimeType) messageData.fileMimeType = fileMimeType;

        const message = await Message.create(messageData);
        await Chat.findByIdAndUpdate(chatId, {
          lastMessage: message._id,
          updatedAt: new Date()
        });

        const populated = await message.populate([
          { path: 'sender', select: 'username avatar' },
          { path: 'replyTo', select: 'content sender type fileUrl', populate: { path: 'sender', select: 'username' } }
        ]);

        io.to(chatId).emit('newMessage', populated);
        console.log(`✉️ رسالة جديدة (${type || 'text'}) في ${chatId}`);
      } catch (err) {
        console.error('❌ خطأ sendMessage:', err.message);
        socket.emit('error', { message: 'فشل إرسال الرسالة' });
      }
    });

    // ==========================================
    // 4. حذف رسالة
    // ==========================================
    socket.on('deleteMessage', async ({ messageId, chatId, userId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return socket.emit('error', { message: 'الرسالة غير موجودة' });
        if (message.sender.toString() !== userId) {
          return socket.emit('error', { message: 'لا يمكنك حذف رسالة غيرك' });
        }

        await Message.findByIdAndDelete(messageId);

        const chat = await Chat.findById(chatId);
        if (chat && chat.lastMessage && chat.lastMessage.toString() === messageId) {
          const newLast = await Message.findOne({ chatId }).sort({ createdAt: -1 });
          chat.lastMessage = newLast ? newLast._id : null;
          await chat.save();
        }

        io.to(chatId).emit('messageDeleted', { messageId, chatId });
        console.log(`🗑️ حُذفت الرسالة ${messageId}`);
      } catch (err) {
        console.error('❌ خطأ deleteMessage:', err.message);
        socket.emit('error', { message: 'فشل حذف الرسالة' });
      }
    });

    // ==========================================
    // 5. تعديل رسالة
    // ==========================================
    socket.on('editMessage', async ({ messageId, chatId, userId, newContent }) => {
      try {
        if (!newContent || !newContent.trim()) {
          return socket.emit('error', { message: 'المحتوى فارغ' });
        }
        const message = await Message.findById(messageId);
        if (!message) return socket.emit('error', { message: 'الرسالة غير موجودة' });
        if (message.sender.toString() !== userId) {
          return socket.emit('error', { message: 'لا يمكنك تعديل رسالة غيرك' });
        }

        message.content = newContent.trim();
        message.edited = true;
        message.editedAt = new Date();
        await message.save();

        io.to(chatId).emit('messageEdited', {
          messageId,
          chatId,
          content: message.content,
          editedAt: message.editedAt
        });
        console.log(`✏️ عُدّلت الرسالة ${messageId}`);
      } catch (err) {
        console.error('❌ خطأ editMessage:', err.message);
        socket.emit('error', { message: 'فشل تعديل الرسالة' });
      }
    });

    // ==========================================
    // 6. مؤشر الكتابة
    // ==========================================
    socket.on('typing', ({ chatId, username }) => {
      socket.to(chatId).emit('userTyping', { chatId, username });
    });
    socket.on('stopTyping', ({ chatId }) => {
      socket.to(chatId).emit('userStopTyping', { chatId });
    });

    // ==========================================
    // 7. تحديد كمقروءة
    // ==========================================
    socket.on('markAsRead', async ({ messageId, chatId, userId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, {
          $addToSet: { readBy: userId },
          status: 'read'
        });
        socket.to(chatId).emit('messageRead', { messageId, userId });
      } catch (err) {
        console.error('خطأ markAsRead:', err.message);
      }
    });

    // ==========================================
    // 8. قطع الاتصال
    // ==========================================
    socket.on('disconnect', async () => {
      try {
        if (socket.userId) {
          onlineUsers.delete(socket.userId);
          await User.findByIdAndUpdate(socket.userId, { isOnline: false, lastSeen: new Date() });
          io.emit('onlineUsers', Array.from(onlineUsers.keys()));
          console.log(`🔴 ${socket.userId} قطع الاتصال`);
        }
      } catch (err) {
        console.error('خطأ disconnect:', err.message);
      }
    });
  });
};