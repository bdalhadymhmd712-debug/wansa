const mongoose = require('mongoose');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

const onlineUsers = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.on('userOnline', async (userId) => {
      try {
        onlineUsers.set(userId, socket.id);
        socket.userId = userId;
        await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
        io.emit('onlineUsers', Array.from(onlineUsers.keys()));
      } catch (err) { console.error(err); }
    });

    socket.on('joinChat', (chatId) => socket.join(chatId));

    socket.on('sendMessage', async (data) => {
      try {
        const { chatId, senderId, content, type, replyTo, fileUrl, fileName, fileSize, fileMimeType, forwarded } = data;

        if (!chatId || !senderId) return;
        if ((!type || type === 'text') && !content) return;
        if (type && type !== 'text' && !fileUrl) return;

        const messageData = {
          chatId, sender: senderId, content: content || '', type: type || 'text',
          status: 'sent'
        };
        if (replyTo) messageData.replyTo = replyTo;
        if (fileUrl) messageData.fileUrl = fileUrl;
        if (fileName) messageData.fileName = fileName;
        if (fileSize) messageData.fileSize = fileSize;
        if (fileMimeType) messageData.fileMimeType = fileMimeType;
        if (forwarded) messageData.forwarded = true; // ✅ دعم إعادة التوجيه

        const message = await Message.create(messageData);
        await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id, updatedAt: new Date() });

        const populated = await message.populate([
          { path: 'sender', select: 'username avatar' },
          { path: 'replyTo', select: 'content sender type fileUrl', populate: { path: 'sender', select: 'username' } }
        ]);

        io.to(chatId).emit('newMessage', populated);
      } catch (err) { console.error(err); }
    });

    socket.on('deleteMessage', async ({ messageId, chatId, userId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== userId) return;
        await Message.findByIdAndDelete(messageId);
        
        const chat = await Chat.findById(chatId);
        if (chat && chat.lastMessage && chat.lastMessage.toString() === messageId) {
          const newLast = await Message.findOne({ chatId }).sort({ createdAt: -1 });
          chat.lastMessage = newLast ? newLast._id : null;
          await chat.save();
        }
        io.to(chatId).emit('messageDeleted', { messageId, chatId });
      } catch (err) { console.error(err); }
    });

    socket.on('editMessage', async ({ messageId, chatId, userId, newContent }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== userId) return;
        message.content = newContent.trim(); message.edited = true; message.editedAt = new Date();
        await message.save();
        io.to(chatId).emit('messageEdited', { messageId, chatId, content: message.content, editedAt: message.editedAt });
      } catch (err) { console.error(err); }
    });

    socket.on('typing', ({ chatId, username }) => socket.to(chatId).emit('userTyping', { chatId, username }));
    socket.on('stopTyping', ({ chatId }) => socket.to(chatId).emit('userStopTyping', { chatId }));
    socket.on('markAsRead', async ({ messageId, chatId, userId }) => {
      await Message.findByIdAndUpdate(messageId, { $addToSet: { readBy: userId }, status: 'read' });
      socket.to(chatId).emit('messageRead', { messageId, userId });
    });

    socket.on('disconnect', async () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        await User.findByIdAndUpdate(socket.userId, { isOnline: false, lastSeen: new Date() });
        io.emit('onlineUsers', Array.from(onlineUsers.keys()));
      }
    });
  });
};