const Cookie = require('../models/Cookie');

class CookieManagerService {
  static async getNextAvailableCookie() {
    const now = new Date();

    // إعادة تفعيل الحسابات التي انتهت مدة استراحتها
    await Cookie.updateMany(
      { status: 'COOLDOWN', cooldownUntil: { $lte: now } },
      { $set: { status: 'ACTIVE', cooldownUntil: null } }
    );

    const cookieDoc = await Cookie.findOne({ status: 'ACTIVE' }).sort({ lastUsedAt: 1 });

    if (!cookieDoc) {
      throw new Error('جميع الكوكيز معطلة أو في فترة استراحة.');
    }

    return cookieDoc;
  }

  static async markAsExpired(cookieId, reason) {
    await Cookie.findByIdAndUpdate(cookieId, {
      status: 'EXPIRED',
      failureReason: reason
    });
  }

  static async setCooldown(cookieId, minutes = 10) {
    const cooldownUntil = new Date(Date.now() + minutes * 60 * 1000);
    await Cookie.findByIdAndUpdate(cookieId, {
      status: 'COOLDOWN',
      cooldownUntil,
      $inc: { successCount: 1 },
      lastUsedAt: new Date()
    });
  }
}

module.exports = CookieManagerService;
