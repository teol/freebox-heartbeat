# AI Contribution Guidelines

Welcome, 🤖 AI assistant! Please follow these guidelines when contributing to this repository:

## Code Guidelines

- This project now uses **TypeScript**; prefer type-safe patterns (avoid `any`), leverage discriminated unions where helpful, and keep runtime null/undefined checks in sync with types.
- Use modern JavaScript/TypeScript syntax (ES2020+), with four-space indent and required semicolons.
- Follow naming conventions: camelCase for variables/functions; PascalCase for types, interfaces, and classes.
- Keep modules cohesive: group related utilities together and extract shared logic to helpers to reduce duplication.
- Favour small, pure functions; keep functions under ~50 lines when practical for readability.
- Add inline comments only for complex or non-obvious logic; avoid restating what the code already expresses.
- Do not remove existing comments unless they are obsolete, incorrect, or the referenced code is deleted.
- Error messages must be concise but precise and should include contextual data that aids debugging.
- Wrap strings with single straight quotes.
- Respect the existing code style unless instructed otherwise.
- Use English in code, comments, commit messages, and branch names.

### Testing & Tooling

- Use Yarn 4 (Corepack-enabled) for installs and scripts.
- Run `yarn lint` for syntax/type checks and `yarn test` for automated tests before submitting changes when possible.
- Prefer Prettier for formatting (`yarn format`), but only for touched files.

## Commits Guidelines

- If a test script is available, run `yarn test` before submitting a contribution.
- Format modified JavaScript/TypeScript files with `yarn format` (four-space indent; semicolons required).
- Commit messages and PR titles **must** follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/)
- Pull requests must include a **Summary** describing the changes and a **Testing** section listing the commands run.
- Provide line citations when referencing code or command output.

### Conventional Commits Format

Commit messages must follow this structure:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Common types:**
- `feat`: introduces a new feature (e.g., `feat: add heartbeat retry logic`)
- `fix`: patches a bug (e.g., `fix: database connection timeout`)
- `docs`: documentation changes (e.g., `docs: update installation instructions`)
- `refactor`: code refactoring without changing functionality
- `test`: adding or updating tests
- `chore`: maintenance tasks (e.g., `chore: update dependencies`)
- `ci`: CI/CD changes
- `perf`: performance improvements
- `style`: code style/formatting changes

**Breaking changes:**
- Add `!` after type: `feat!: rename API endpoints`
- Or add footer: `BREAKING CHANGE: API endpoints have been renamed`

**Examples:**
- `feat: add 4G failover detection`
- `fix: handle connection timeout errors`
- `docs: add systemd service configuration`
- `refactor: extract API client to separate module`
- `test: add unit tests for heartbeat logic`

---

Thanks for contributing! 🙇‍♂️
