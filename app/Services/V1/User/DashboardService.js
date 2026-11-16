const { today } = require('@app/Helpers/school');
const { User, Student, SchoolClass, StaffAttendance, TeacherProfile } = require('@app/Models');
const { CLASS_STATUS, STAFF_ATTENDANCE, STUDENT_STATUS, USER_ROLE, USER_STATUS } = require('@app/Helpers/constants');
const TeacherService = require('./TeacherService');

// The Principal's home screen. Sections that belong to later modules (admission inquiries, leave requests, student
// attendance, fee collection) are null until those modules exist, so the web app can hide them.

const principal = async (ctx) => {
  const date = today(ctx.client);

  const teachers = await User.findAll({
    where: { role: USER_ROLE.TEACHER, status: USER_STATUS.ACTIVE },
    attributes: ['id', 'uuid', 'name', 'profileImage'],
    include: [{ model: TeacherProfile, as: 'teacherProfile', attributes: ['designation'], required: false }],
  });
  const ids = teachers.map((t) => t.id);

  const [classCount, studentCount, attendanceRows, classes] = await Promise.all([
    SchoolClass.count({ where: { status: CLASS_STATUS.ACTIVE } }),
    Student.count({ where: { status: STUDENT_STATUS.ACTIVE } }),
    ids.length ? StaffAttendance.findAll({ where: { userId: ids, date }, attributes: ['userId', 'status'] }) : [],
    TeacherService.classesOf(ids),
  ]);

  const statusOf = Object.fromEntries(attendanceRows.map((row) => [String(row.userId), Number(row.status)]));
  const countStatus = (status) => attendanceRows.filter((row) => Number(row.status) === status).length;

  const onLeave = teachers
    .filter((t) => statusOf[String(t.id)] === STAFF_ATTENDANCE.ON_LEAVE)
    .map((t) => ({
      uuid: t.uuid,
      name: t.name,
      designation: (t.teacherProfile && t.teacherProfile.designation) || 'Teacher',
      classes: (classes[String(t.id)] || []).map((c) => c.name),
    }));

  return {
    date,
    greetingName: ctx.user.name,
    school: { name: ctx.client.name },
    counts: { classes: classCount, students: studentCount, teachers: teachers.length },
    staffToday: {
      present: countStatus(STAFF_ATTENDANCE.PRESENT) + countStatus(STAFF_ATTENDANCE.LATE) + countStatus(STAFF_ATTENDANCE.HALF_DAY),
      absent: countStatus(STAFF_ATTENDANCE.ABSENT),
      late: countStatus(STAFF_ATTENDANCE.LATE),
      onLeave: countStatus(STAFF_ATTENDANCE.ON_LEAVE),
      notMarked: teachers.length - attendanceRows.length,
    },
    staffOnLeave: onLeave,
    // filled by later modules
    newInquiries: null,
    pendingLeaveRequests: null,
    studentAttendanceToday: null,
    feeCollection: null,
  };
};

module.exports = { principal };
