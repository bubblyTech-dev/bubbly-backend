const Resource = require('@app/Resources/Resource');
const Files = require('@app/Helpers/files');
const { hhmm } = require('@app/Helpers/school');
const labels = require('./labels');

// A teacher = a User with role Teacher plus their TeacherProfile (load it as `teacherProfile`).
//   TeacherResource.make(user, { classes, todayAttendance, monthSummary })
// The uuid is the user's uuid.
class TeacherResource extends Resource {
  toArray() {
    const user = this.resource;
    const profile = user.teacherProfile || {};
    const attendance = this.extra.todayAttendance;

    return {
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      profileImage: Files.url('userProfile', user.profileImage),
      status: Number(user.status),
      statusLabel: labels.userStatus[Number(user.status)] || null,
      passwordSet: Boolean(user.passwordHash),
      lastLoginAt: user.lastLoginAt,
      designation: profile.designation || 'Teacher',
      employeeCode: profile.employeeCode || null,
      qualification: profile.qualification || null,
      experienceYears: profile.experienceYears === null || profile.experienceYears === undefined ? null : Number(profile.experienceYears),
      joiningDate: profile.joiningDate || null,
      dateOfBirth: profile.dateOfBirth || null,
      gender: profile.gender ? Number(profile.gender) : null,
      genderLabel: labels.gender[Number(profile.gender)] || null,
      emergencyContact: profile.emergencyContact || null,
      address: profile.address || null,
      shiftStartsAt: hhmm(profile.shiftStartsAt),
      shiftEndsAt: hhmm(profile.shiftEndsAt),
      annualLeaveQuota: profile.annualLeaveQuota === null || profile.annualLeaveQuota === undefined ? null : Number(profile.annualLeaveQuota),
      classes: this.when(this.extra.classes !== undefined, () => this.extra.classes.map((c) => ({ uuid: c.uuid, name: c.name, room: c.room || null }))),
      todayAttendance: this.when(this.extra.todayAttendance !== undefined, () =>
        attendance ? { status: Number(attendance.status), label: labels.staffAttendance[Number(attendance.status)], note: attendance.note || null } : null,
      ),
      monthSummary: this.when(this.extra.monthSummary !== undefined, () => this.extra.monthSummary),
      createdAt: user.createdAt,
    };
  }
}

module.exports = TeacherResource;
