const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['text', 'image', 'video'], required: true },
  content: { type: String, required: true }, // النص أو رابط الملف
  backgroundColor: { type: String, default: '#075E54' }, // للنص
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now, expires: 86400 } // يختفي بعد 24 ساعة
});

module.exports = mongoose.model('Status', statusSchema);