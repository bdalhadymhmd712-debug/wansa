// ==========================================
// Wansa - Auth Middleware
// ==========================================

const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'غير مصرح - التوكن مطلوب'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'انتهت صلاحية التوكن - يرجى تسجيل الدخول مجدداً'
      });
    }
    return res.status(401).json({
      error: 'توكن غير صالح'
    });
  }
};