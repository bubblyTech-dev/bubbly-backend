const Resource = require('@app/Resources/Resource');

// A note on a school. `creator` is loaded with the note (the admin who wrote it).
class SchoolNoteResource extends Resource {
  toArray() {
    const note = this.resource;

    return {
      uuid: note.uuid,
      note: note.note,
      createdBy: note.creator ? { uuid: note.creator.uuid, name: note.creator.name } : null,
      createdAt: note.createdAt,
    };
  }
}

module.exports = SchoolNoteResource;
