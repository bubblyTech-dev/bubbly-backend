const Resource = require('@app/Resources/Resource');
const Files = require('@app/Helpers/files');

// Shapes a school (client) for the API. Only these fields leave the server.
class SchoolResource extends Resource {
  toArray() {
    const school = this.resource;

    return {
      uuid: school.uuid,
      name: school.name,
      slug: school.slug,
      status: Number(school.status),
      contactName: school.contactName,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      addressLine1: school.addressLine1,
      addressLine2: school.addressLine2,
      city: school.city,
      state: school.state,
      postalCode: school.postalCode,
      country: school.country,
      gstNumber: school.gstNumber,
      logo: Files.url('clientLogo', school.logo),
      timezone: school.timezone,
      razorpayCustomerId: school.razorpayCustomerId, // admin API only
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
    };
  }
}

module.exports = SchoolResource;
