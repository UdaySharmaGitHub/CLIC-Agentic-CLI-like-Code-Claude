# Changelog

All notable changes to CLIC are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [4.3.0] - 2026-09-22

### Added

- OpenAI-compatible streaming and function calling.
- ReAct agent loop with configurable step limits.
- User-controlled parallel tool execution.
- Persistent PTY terminal pool with per-terminal command serialization.
- Named sessions, conversation export, privacy mode, and workspace file watching.
- Context-window guard with automatic compaction.
- Zod runtime validation for tool inputs.
- Token usage tracking and cost estimation.
- Unified diff previews for file writes and modifications.
- Retry handling for transient API failures.
- Contributor documentation, security guidance, issue templates, pull request template, and CI validation.

### Changed

- Migrated the project to a provider-agnostic OpenAI-compatible API client.
- Expanded the CLI from the original Bash implementation into a modular TypeScript application.

## [Unreleased]

### Planned

- Improve provider and model configuration workflows.
- Expand coverage for interactive terminal and tool execution paths.
- Continue improving contributor documentation and development tooling.

[Unreleased]: https://github.com/UdaySharmaGitHub/CLIC-Agentic-CLI-like-Code-Claude/compare/v4.3.0...HEAD
[4.3.0]: https://github.com/UdaySharmaGitHub/CLIC-Agentic-CLI-like-Code-Claude/releases/tag/v4.3.0
