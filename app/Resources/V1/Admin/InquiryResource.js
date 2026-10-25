const Resource = require('@app/Resources/Resource');

// An inquiry for the Admin app. The visitor's ip and browser stay in the database only.
class InquiryResource extends Resource {
  toArray() {
    const inquiry = this.resource;
    const assignee = inquiry.assignee;

    return {
      uuid: inquiry.uuid,
      name: inquiry.name,
      email: inquiry.email,
      phone: inquiry.phone,
      schoolName: inquiry.schoolName,
      message: inquiry.message,
      source: Number(inquiry.source),
      status: Number(inquiry.status),
      assignedTo: this.whenLoaded('assignee', () =>
        assignee ? { uuid: assignee.uuid, name: assignee.name, email: assignee.email } : null,
      ),
      resolvedAt: inquiry.resolvedAt,
      createdAt: inquiry.createdAt,
      updatedAt: inquiry.updatedAt,
    };
  }
}

module.exports = InquiryResource;
