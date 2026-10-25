const Request = require('@app/Requests/Request');

class StoreNoteRequest extends Request {
  rules() {
    return {
      note: 'required|string|max:2000',
    };
  }

  messages() {
    return { 'note.required': 'Please write the note.' };
  }
}

module.exports = StoreNoteRequest;
