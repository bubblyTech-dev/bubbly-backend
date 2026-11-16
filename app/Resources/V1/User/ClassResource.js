const Resource = require('@app/Resources/Resource');
const { hhmm } = require('@app/Helpers/school');
const labels = require('./labels');

// A class for the school workspace.
//   ClassResource.make(schoolClass, { studentCount })   (load `classTeacher` to include the teacher)
class ClassResource extends Resource {
  toArray() {
    const row = this.resource;
    const teacher = row.classTeacher;

    return {
      uuid: row.uuid,
      name: row.name,
      code: row.code,
      room: row.room,
      startsAt: hhmm(row.startsAt),
      endsAt: hhmm(row.endsAt),
      capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
      status: Number(row.status),
      statusLabel: labels.classStatus[Number(row.status)] || null,
      sortOrder: Number(row.sortOrder || 0),
      studentCount: this.extra.studentCount === undefined ? undefined : Number(this.extra.studentCount || 0),
      classTeacher: this.whenLoaded('classTeacher', () => (teacher ? { uuid: teacher.uuid, name: teacher.name } : null)),
      createdAt: row.createdAt,
    };
  }
}

module.exports = ClassResource;
