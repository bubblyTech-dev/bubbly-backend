const Resource = require('@app/Resources/Resource');
const Files = require('@app/Helpers/files');
const labels = require('./labels');

// A student for the school workspace. Load `schoolClass` and `login` to include them.
// The parent app login is shown only as a summary (email, status, whether a password was set): never a hash or token.
class StudentResource extends Resource {
  toArray() {
    const row = this.resource;
    const schoolClass = row.schoolClass;
    const login = row.login;

    return {
      uuid: row.uuid,
      name: row.name,
      admissionNo: row.admissionNo,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender === null || row.gender === undefined ? null : Number(row.gender),
      genderLabel: labels.gender[Number(row.gender)] || null,
      bloodGroup: row.bloodGroup,
      address: row.address,
      medicalNotes: row.medicalNotes,
      guardianName: row.guardianName,
      guardianRelation: row.guardianRelation,
      guardianPhone: row.guardianPhone,
      guardianEmail: row.guardianEmail,
      secondGuardianName: row.secondGuardianName,
      secondGuardianPhone: row.secondGuardianPhone,
      admissionDate: row.admissionDate,
      photo: Files.url('userProfile', row.photo),
      status: Number(row.status),
      statusLabel: labels.studentStatus[Number(row.status)] || null,
      class: this.whenLoaded('schoolClass', () => (schoolClass ? { uuid: schoolClass.uuid, name: schoolClass.name } : null)),
      classTeacher: this.when(this.extra.classTeacher !== undefined, () => this.extra.classTeacher),
      parentLogin: this.whenLoaded('login', () =>
        login
          ? {
              email: login.email,
              status: Number(login.status),
              statusLabel: labels.userStatus[Number(login.status)] || null,
              passwordSet: Boolean(login.passwordHash),
              lastLoginAt: login.lastLoginAt,
            }
          : null,
      ),
      createdAt: row.createdAt,
    };
  }
}

module.exports = StudentResource;
