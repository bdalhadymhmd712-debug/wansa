// ==========================================
// Wansa - User Model
// ==========================================

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
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true, // يسمح بأن يكون فارغاً إذا استخدم الهاتف
    unique: true
  },
  phone: {
    type: String,
    trim: true,
    sparse: true, // يسمح بأن يكون فارغاً إذا استخدم البريد
    unique: true
  },
  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل']
  },
  avatar: { type: String, default: '' },
  bio: { type: String, default: 'مرحباً! أنا أستخدم Wansa' },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

// التحقق: يجب أن يكون هناك بريد أو هاتف
userSchema.pre('validate', function(next) {
  if (!this.email && !this.phone) {
    next(new Error('يجب إدخال البريد الإلكتروني أو رقم الهاتف'));
  } else {
    next();
  }
});

// إخفاء كلمة المرور عند الإرجاع
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);