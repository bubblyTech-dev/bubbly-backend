# Backend Docs (read this first)

Project notes for everyone working on the **Bubbly backend**: a multi-tenant School Management SaaS API for preschools.

| File | What is in it |
|---|---|
| [01-project-overview.md](01-project-overview.md) | What we are building, roles, who logs in where, buy flow, scope |
| [02-architecture.md](02-architecture.md) | Tech stack, multi-tenancy (`client_id`), request flow, security rules, versioning |
| [03-folder-structure.md](03-folder-structure.md) | Every folder and what goes in it |
| [04-conventions.md](04-conventions.md) | How we write code here: routes, middleware groups, aliases, validation, naming |
| [05-setup.md](05-setup.md) | Run the project locally, npm scripts |
| [06-progress.md](06-progress.md) | Done / next / open decisions / change log |
| [07-analytics-and-reports.md](07-analytics-and-reports.md) | The Analytics and Reports framework: how to add a dataset, a report and their Admin pages |

## Rules for these docs
1. **Keep them current.** Whenever a plan, decision, folder, convention or command changes, update the matching file in the same change (and add a line to the change log in `06-progress.md`).
2. **No secrets, ever.** No passwords, tokens, API keys, `.env` values, private keys, personal emails or customer data. Use placeholders like `<your-password>`.
3. **Only project-relevant, important things.** Not a diary. Short and accurate beats long and stale.
4. Mark anything not built yet as **(planned)** so nobody assumes it exists.
