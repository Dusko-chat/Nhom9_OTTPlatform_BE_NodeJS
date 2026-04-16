const Department = require('../models/Department');
const prisma = require('../config/prisma');

exports.getAllDepartments = async (req, res) => {
  try {
    console.log('[DEBUG] Fetching all departments...');
    const departments = await Department.find();
    console.log(`[DEBUG] Found ${departments.length} departments`);
    res.json({
      success: true,
      data: departments.map(d => ({
        id: d._id,
        name: d.name,
        parentId: d.parentId,
        managerId: d.managerId,
        description: d.description
      }))
    });
  } catch (error) {
    console.error('[DEBUG] Error fetching departments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const department = new Department(req.body);
    await department.save();
    res.json({ success: true, data: department });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignUser = async (req, res) => {
  try {
    const { deptId } = req.params;
    const { userId, jobTitle } = req.query;

    const department = await Department.findById(deptId);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // 1. Remove user from any existing departments in MongoDB (Ensure "one person, one department")
    await Department.updateMany(
      { userIds: userId },
      { $pull: { userIds: userId } }
    );

    // 2. Update user's info in PostgreSQL
    await prisma.user.update({
      where: { id: userId },
      data: {
        departmentId: deptId,
        jobTitle: jobTitle || user.jobTitle
      }
    });

    // 3. Add user to the new department's userIds list in MongoDB
    if (!department.userIds.includes(userId)) {
      department.userIds.push(userId);
      await department.save();
    }

    res.json({ success: true, message: 'Assign user successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Clear departmentId for all users in this department in PostgreSQL
    await prisma.user.updateMany({
      where: { departmentId: id },
      data: { departmentId: null }
    });

    // 2. Clear parentId for its sub-departments in MongoDB
    await Department.updateMany({ parentId: id }, { $set: { parentId: null } });

    // 3. Delete the department itself in MongoDB
    const result = await Department.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ success: false, message: 'Department not found' });

    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


