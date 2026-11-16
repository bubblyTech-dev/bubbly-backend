const Resource = require('@app/Resources/Resource');
const Files = require('@app/Helpers/files');
const { hhmm } = require('@app/Helpers/school');

// The school's own details and settings, for its Principal (Profile page).
class SchoolResource extends Resource {
  static academicYear(startMonth, today) {
    const [year, month] = today.split('-').map(Number);
    const start = month >= startMonth ? year : year - 1;
    return startMonth === 1 ? String(start) : `${start} - ${start + 1}`;
  }

  toArray() {
    const client = this.resource;
    const startMonth = Number(client.academicYearStartMonth || 6);

    return {
      uuid: client.uuid,
      name: client.name,
      logo: Files.url('clientLogo', client.logo),
      contactName: client.contactName,
      contactEmail: client.contactEmail,
      contactPhone: client.contactPhone,
      addressLine1: client.addressLine1,
      addressLine2: client.addressLine2,
      city: client.city,
      state: client.state,
      postalCode: client.postalCode,
      country: client.country,
      timezone: client.timezone || 'Asia/Kolkata',
      workingDays: String(client.workingDays || '1,2,3,4,5')
        .split(',')
        .map(Number)
        .filter((d) => d >= 1 && d <= 7),
      opensAt: hhmm(client.opensAt),
      closesAt: hhmm(client.closesAt),
      academicYearStartMonth: startMonth,
      academicYear: this.extra.today ? SchoolResource.academicYear(startMonth, this.extra.today) : null,
    };
  }
}

module.exports = SchoolResource;
