const Resource = require('@app/Resources/Resource');
const Files = require('@app/Helpers/files');

// The few facts about a school that its own users may see.
class SchoolSummaryResource extends Resource {
  toArray() {
    const client = this.resource;

    return {
      uuid: client.uuid,
      name: client.name,
      logo: Files.url('clientLogo', client.logo),
    };
  }
}

module.exports = SchoolSummaryResource;
