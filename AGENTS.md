# AI Contribution Guidelines

Welcome, 🤖 AI assistant! Please follow these guidelines when contributing to this repository:

## Code Guidelines

- Use modern JavaScript ES6+ syntax and features
- Use four-space indent; semicolons required
- Follow naming conventions: camelCase for variables/functions
- Follow secure coding practices to prevent common web vulnerabilities (XSS, CSRF, injections, auth bypass, open redirects, etc.)
- Add code comments only for complex or unintuitive code
- Do not remove already existing code comments except if they are outdated, incorrect, or if you're deleting the code it refers to
- Error messages must be concise but very precise
- Wrap strings with single straight quotes
- Respect the existing code style unless instructed otherwise.
- Use English in code, comments, commit messages and branch names

## Commits Guidelines

- If a test script is available, run `npm test` before submitting a contribution.
- Format modified JavaScript files with `npx prettier -w` (four-space indent; semicolons required).
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
