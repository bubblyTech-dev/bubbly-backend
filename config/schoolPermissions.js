const { USER_ROLE } = require('../app/Helpers/constants');

// What each school role may do inside its own school. A fixed map for Phase 1 (the Principal can later get a
// screen to adjust it). Tenant isolation is separate and always applies: no key here ever reaches another school.
// Format: permission key -> label (the labels are only for documentation and a future screen).

const permissionLabels = {
  'subscription.view': 'View the school plan, subscription status and billing history',
  'school.manage': 'Edit school settings',
  'students.view': 'View students',
  'students.manage': 'Add and edit students',
  'teachers.view': 'View teachers',
  'teachers.manage': 'Add and edit teachers',
  'classes.view': 'View classes, sections and subjects',
  'classes.manage': 'Manage classes, sections and subjects',
  'attendance.mark': 'Mark attendance for assigned classes',
  'attendance.view': 'View attendance',
  'attendance.correct': 'Correct attendance records',
  'staff_attendance.mark': 'Mark daily attendance of teachers and staff',
  'homework.manage': 'Create homework and review submissions',
  'homework.view': 'View homework',
  'timetable.view': 'View the timetable',
  'timetable.manage': 'Publish the timetable',
  'calendar.view': 'View the school calendar',
  'calendar.manage': 'Publish calendar events',
  'announcements.view': 'View announcements',
  'announcements.manage': 'Publish announcements',
  'notifications.view': 'View notifications',
  'leave.apply': 'Apply for leave',
  'leave.approve': 'Approve or reject leave',
  'fees.view': 'View fee information',
  'fees.manage': 'Record fee payments and structures',
  'chat.use': 'Use messaging',
  'reports.view': 'View school reports',
  'profile.edit': 'Edit own profile',
};

const rolePermissions = {
  // the Principal can do everything in the school workspace
  [USER_ROLE.PRINCIPAL]: Object.keys(permissionLabels),

  // a Teacher works with the classes they are assigned to
  [USER_ROLE.TEACHER]: [
    'students.view',
    'classes.view',
    'attendance.mark',
    'attendance.view',
    'homework.manage',
    'homework.view',
    'timetable.view',
    'calendar.view',
    'announcements.view',
    'notifications.view',
    'leave.apply',
    'chat.use',
    'profile.edit',
  ],

  // a Student only sees their own information (used only when the school enables student accounts)
  [USER_ROLE.STUDENT]: [
    'attendance.view',
    'homework.view',
    'timetable.view',
    'calendar.view',
    'announcements.view',
    'notifications.view',
    'leave.apply',
    'fees.view',
    'profile.edit',
  ],
};

const roleNames = {
  [USER_ROLE.PRINCIPAL]: 'Principal',
  [USER_ROLE.TEACHER]: 'Teacher',
  [USER_ROLE.STUDENT]: 'Student',
};

const permissionsFor = (role) => [...(rolePermissions[Number(role)] || [])];

module.exports = { permissionLabels, rolePermissions, roleNames, permissionsFor };
