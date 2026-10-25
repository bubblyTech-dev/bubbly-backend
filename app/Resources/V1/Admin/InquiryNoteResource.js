const Resource = require('@app/Resources/Resource');

class InquiryNoteResource extends Resource {
  toArray() {
    const note = this.resource;
    const author = note.author;

    return {
      uuid: note.uuid,
      note: note.note,
      author: this.whenLoaded('author', () => (author ? { uuid: author.uuid, name: author.name } : null)),
      createdAt: note.createdAt,
    };
  }
}

module.exports = InquiryNoteResource;
