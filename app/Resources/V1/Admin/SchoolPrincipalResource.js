const Resource = require('@app/Resources/Resource');

// The Principal login of a school as the Admin app sees it. Never the password hash or any token.
//   SchoolPrincipalResource.make(user, { welcomeLinkSentAt, welcomeLinkExpiresAt, setPasswordUrl })
// setPasswordUrl is only passed right after resend/reset (shown once), never when just viewing.
class SchoolPrincipalResource extends Resource {
  toArray() {
    const user = this.resource;

    return {
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: Number(user.status),
      hasPassword: Boolean(user.passwordHash),
      lastLoginAt: user.lastLoginAt,
      welcomeLinkSentAt: this.extra.welcomeLinkSentAt ?? null,
      welcomeLinkExpiresAt: this.extra.welcomeLinkExpiresAt ?? null,
      setPasswordUrl: this.when(this.extra.setPasswordUrl !== undefined, () => this.extra.setPasswordUrl),
    };
  }
}

module.exports = SchoolPrincipalResource;
