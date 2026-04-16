const Attendance = require('../models/Attendance');
const Office = require('../models/Office');
const ExcelJS = require('exceljs');
const prisma = require('../config/prisma');

// Haversine formula to calculate distance between two points in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

exports.checkIn = async (req, res) => {
  try {
    const { latitude, longitude, type, note } = req.body;
    const userId = req.user.id;

    // Fetch offices from DB
    const OFFICES = await Office.find({ isActive: true });

    if (!OFFICES.length) {
      return res.status(400).json({ success: false, message: 'Chưa có văn phòng nào được thiết lập.' });
    }

    // Find the nearest office
    let nearestOffice = null;
    let minDistance = Infinity;

    for (const office of OFFICES) {
      const dist = calculateDistance(latitude, longitude, office.latitude, office.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearestOffice = office;
      }
    }

    const maxAllowed = nearestOffice?.allowedDistance || 300;
    let status = 'SUCCESS';
    if (minDistance > maxAllowed) {
      status = 'OUT_OF_RANGE';
    }

    const attendance = new Attendance({
      userId,
      latitude,
      longitude,
      type,
      distance: minDistance,
      status,
      note: note || `Chấm công tại: ${nearestOffice?.name || 'Vị trị bất kỳ'}`
    });

    await attendance.save();

    res.status(201).json({
      success: true,
      data: attendance,
      message: status === 'SUCCESS' ? 'Chấm công thành công!' : 'Bạn đang nằm ngoài vùng cho phép chấm công.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const history = await Attendance.find({ userId }).sort({ timestamp: -1 }).limit(30);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllHistory = async (req, res) => {
  try {
    const history = await Attendance.find().sort({ timestamp: -1 });
    
    // Manual join for userId (which is now in PostgreSQL)
    const userIds = [...new Set(history.map(item => item.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true }
    });

    const userMap = users.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});

    const historyWithUsers = history.map(item => {
      const itemObj = item.toObject();
      itemObj.userId = userMap[item.userId] || { fullName: 'Unknown', email: 'N/A' };
      return itemObj;
    });

    res.json({ success: true, data: historyWithUsers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportAttendanceToExcel = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    const history = await Attendance.find({ userId }).sort({ timestamp: 1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Chấm công');

    // Headers
    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 5 },
      { header: 'Ngày', key: 'date', width: 15 },
      { header: 'Giờ', key: 'time', width: 10 },
      { header: 'Loại', key: 'type', width: 10 },
      { header: 'Vị trí (Lat, Lng)', key: 'location', width: 30 },
      { header: 'Khoảng cách (m)', key: 'distance', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Ghi chú', key: 'note', width: 30 },
    ];

    // Styling headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data
    history.forEach((item, index) => {
      const ts = item.timestamp ? new Date(item.timestamp) : new Date();
      const lat = typeof item.latitude === 'number' ? item.latitude.toFixed(4) : 'N/A';
      const lng = typeof item.longitude === 'number' ? item.longitude.toFixed(4) : 'N/A';
      const dist = typeof item.distance === 'number' ? Math.round(item.distance) : 0;

      worksheet.addRow({
        stt: index + 1,
        date: ts.toLocaleDateString('vi-VN'),
        time: ts.toLocaleTimeString('vi-VN'),
        type: item.type === 'IN' ? 'Vào ca' : 'Tan ca',
        location: `${lat}, ${lng}`,
        distance: dist,
        status: item.status === 'SUCCESS' ? 'Hợp lệ' : 'Ngoài vùng',
        note: item.note || ''
      });
    });

    // Send the file
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    // Safe filename
    const rawName = (user.fullName || 'User').toString();
    const safeFileName = rawName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
    
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ChamCong_${safeFileName}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("LỖI XUẤT EXCEL:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

exports.exportBulkAttendance = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ success: false, message: 'Danh sách người dùng không hợp lệ' });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }
    });

    const workbook = new ExcelJS.Workbook();

    for (const user of users) {
      const history = await Attendance.find({ userId: user.id }).sort({ timestamp: 1 });
      
      const sheetName = (user.fullName || 'User').substring(0, 31);
      const worksheet = workbook.addWorksheet(sheetName);

      // Headers
      worksheet.columns = [
        { header: 'STT', key: 'stt', width: 5 },
        { header: 'Ngày', key: 'date', width: 15 },
        { header: 'Giờ', key: 'time', width: 10 },
        { header: 'Loại', key: 'type', width: 10 },
        { header: 'Vị trí (Lat, Lng)', key: 'location', width: 30 },
        { header: 'Khoảng cách (m)', key: 'distance', width: 15 },
        { header: 'Trạng thái', key: 'status', width: 15 },
        { header: 'Ghi chú', key: 'note', width: 30 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // Add data
      history.forEach((item, index) => {
        const ts = item.timestamp ? new Date(item.timestamp) : new Date();
        const lat = typeof item.latitude === 'number' ? item.latitude.toFixed(4) : 'N/A';
        const lng = typeof item.longitude === 'number' ? item.longitude.toFixed(4) : 'N/A';
        const dist = typeof item.distance === 'number' ? Math.round(item.distance) : 0;

        worksheet.addRow({
          stt: index + 1,
          date: ts.toLocaleDateString('vi-VN'),
          time: ts.toLocaleTimeString('vi-VN'),
          type: item.type === 'IN' ? 'Vào ca' : 'Tan ca',
          location: `${lat}, ${lng}`,
          distance: dist,
          status: item.status === 'SUCCESS' ? 'Hợp lệ' : 'Ngoài vùng',
          note: item.note || ''
        });
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="BaoCao_ChamCong_TongHop.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("LỖI XUẤT EXCEL HÀNG LOẠT:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};
