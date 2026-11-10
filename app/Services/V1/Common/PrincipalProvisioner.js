// TEMPORARY STUB. The real file is built together with the school users and login (agent 10, branch
// phase-1-school-auth) and creates the Principal user plus the welcome email. When that branch is merged, DELETE
// this file so the real one wins. Until then the webhook still activates the subscription and simply skips this step.
const provisionPrincipal = async () => null;

module.exports = { provisionPrincipal };
