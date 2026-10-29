const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'],
    maxlength: [30, 'اسم المستخدم طويل جداً'],
    validate: {
      validator: function(v) {
        return /^[\u0600-\u06FFa-zA-Z0-9_\s]+$/.test(v);
      },
      message: 'اسم المستخدم يحتوي على رموز غير مسموحة'
    }
  },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  phone: { type: String, trim: true, sparse: true, unique: true },
  password: { type: String, required: [true, 'كلمة المرور مطلوبة'], minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'] },
  avatar: { type: String, default: '' },
  bio: { type: String, default: 'مرحباً! أنا أستخدم Wansa' },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  
  // إعدادات الخصوصية
  privacy: {
    hideActivity: { type: Boolean, default: false },
    statusViewers: { type: String, enum: ['everyone', 'contacts', 'selected'], default: 'everyone' },
    allowedViewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },

  // إعدادات استعادة كلمة المرور
  resetCode: { type: String, default: null },
  resetCodeExpires: { type: Date, default: null }
}, { timestamps: true });

userSchema.pre('validate', function(next) {
  if (!this.email && !this.phone) next(new Error('يجب إدخال البريد الإلكتروني أو رقم الهاتف'));
  else next();
});

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.resetCode;
  delete user.resetCodeExpires;
  return user;
};

module.exports = mongoose.model('User', userSchema);