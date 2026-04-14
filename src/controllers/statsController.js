const User = require('../models/User');
const Message = require('../models/Message');

exports.getOverviewStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalMessages = await Message.countDocuments();

    // Lấy số lượng tin nhắn theo ngày trong 7 ngày gần nhất
    const SevenDaysAgo = new Date();
    SevenDaysAgo.setDate(SevenDaysAgo.getDate() - 7);

    const perDay = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: SevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: "$createdAt" },
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalMessages,
        perDay
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
