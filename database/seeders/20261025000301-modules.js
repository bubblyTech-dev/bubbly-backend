const { QueryTypes } = require('sequelize');

// Safe to run again: it only adds modules that are missing. Names and descriptions edited in the Admin app are never overwritten.
// Core modules are part of every plan and cannot be switched off.

const modules = [
  { key: 'students', name: 'Students', description: 'Student records and admissions data', core: 1 },
  { key: 'teachers', name: 'Teachers', description: 'Teacher records and accounts', core: 1 },
  { key: 'classes_sections', name: 'Classes and sections', description: 'Classes, sections, subjects and academic years', core: 1 },
  { key: 'attendance', name: 'Attendance', description: 'Daily attendance for students and staff', core: 1 },
  { key: 'announcements', name: 'Announcements', description: 'Notices to teachers and students', core: 0 },
  { key: 'homework', name: 'Homework', description: 'Assign and track homework', core: 0 },
  { key: 'timetable', name: 'Timetable and calendar', description: 'Class timetable and school calendar', core: 0 },
  { key: 'leave', name: 'Leave management', description: 'Leave requests and approval', core: 0 },
  { key: 'fees', name: 'Fees', description: 'Fee structure, offline payments and receipts', core: 0 },
  { key: 'admissions', name: 'Admissions', description: 'Admission enquiries and applications', core: 0 },
  { key: 'reports_exports', name: 'Reports and exports', description: 'Reports and data export', core: 0 },
  { key: 'student_accounts', name: 'Student logins', description: 'Let students sign in to the school app', core: 0 },
  { key: 'chat', name: 'Chat', description: 'Optional messaging between teachers', core: 0 },
];

module.exports = {
  async up(queryInterface) {
    const db = queryInterface.sequelize;
    const existing = await db.query('SELECT module_key FROM modules', { type: QueryTypes.SELECT });
    const have = new Set(existing.map((row) => row.module_key));
    let added = 0;

    for (const [index, module] of modules.entries()) {
      if (have.has(module.key)) continue;

      await db.query(
        'INSERT INTO modules (module_key, name, description, sort_order, status, is_core) VALUES (:key, :name, :description, :sortOrder, 1, :core)',
        { replacements: { key: module.key, name: module.name, description: module.description, sortOrder: (index + 1) * 10, core: module.core } },
      );
      added += 1;
    }

    console.log(`  modules: ${added} added, ${modules.length - added} already there`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DELETE FROM modules WHERE module_key IN (:keys)', {
      replacements: { keys: modules.map((module) => module.key) },
    });
  },
};
