const { Inquiry } = require('@app/Models');
const { INQUIRY_STATUS, INQUIRY_SOURCE } = require('@app/Helpers/constants');

// Saves a message from the public website. A filled honeypot field means a bot: nothing is saved,
// but the caller still gets the normal answer so the bot learns nothing.
const submit = async (data, ctx) => {
  if (data.website) return;

  await Inquiry.create({
    name: data.name,
    email: String(data.email).toLowerCase(),
    phone: data.phone || null,
    schoolName: data.schoolName || null,
    message: data.message,
    source: data.source ? Number(data.source) : INQUIRY_SOURCE.CONTACT_FORM,
    status: INQUIRY_STATUS.NEW,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  });
};

module.exports = { submit };
