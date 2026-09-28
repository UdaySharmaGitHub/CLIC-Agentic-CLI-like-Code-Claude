# Security Policy

## Supported Versions

Security fixes are currently provided for the latest version on the `main` branch.

| Version | Supported |
|---|---|
| Latest `main` | Yes |
| Older releases | No |

## Reporting a Vulnerability

Please do not report security vulnerabilities in a public issue. Do not include API keys, access tokens, private files, or other secrets in a report.

Use GitHub's private vulnerability reporting feature for this repository when available. If it is unavailable, contact the maintainer privately through the email address listed on the project owner's GitHub profile.

Please include:

- A clear description of the vulnerability and its potential impact.
- The affected version, commit, or file.
- Reproduction steps or a minimal proof of concept.
- Any relevant logs with secrets removed.
- A suggested mitigation, if you have one.

You should receive an acknowledgement within 7 days. We will investigate the report, keep you informed of progress where possible, and coordinate disclosure after a fix or mitigation is available.

## Security Guidance for Contributors

- Never commit `.env` files, API keys, access tokens, or customer data.
- Redact secrets from screenshots, logs, test fixtures, and pull requests.
- Treat shell execution, file operations, external API responses, and prompt content as security-sensitive boundaries.
- Run the project's tests and review changes to safety controls before submitting a pull request.
