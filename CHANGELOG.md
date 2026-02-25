# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-02-25
### Changed
- **BREAKING:** Full corpus re-ingestion from NPC National Law Database (flk.npc.gov.cn)
- Census-first approach: 1,272 laws enumerated across 9 legal categories, 1,184 ingestable (88 repealed excluded)
- DOCX download pipeline: FLK download API → mammoth HTML conversion → article parser
- Database grew from 7 AI-generated shells (0 provisions) to 1,184 real documents (62,648 provisions)
- Source changed from npc.gov.cn (unreachable) to flk.npc.gov.cn (NPC National Law Database SPA)
- Database size: ~51 MB (Strategy A — bundled in Vercel function)

### Added
- `scripts/census.ts` — enumerates all national laws from FLK search API by category
- `data/census.json` — full census of 1,272 laws with classifications
- mammoth dependency for DOCX-to-HTML conversion
- Golden standard README (450+ lines, matching Swedish Law MCP template)
- 13 golden contract tests covering article retrieval, search, citation roundtrip, and negative cases

### Fixed
- All provisions now contain real legal text (previously 0 provisions from AI-generated shells)
- Article parser handles Chinese structural elements: 编 (Part), 章 (Chapter), 节 (Section)
- TOC detection prevents duplicate provisions from table of contents

## [1.1.2] - 2026-02-22
### Added
- Golden standard files (DISCLAIMER.md, PRIVACY.md, SECURITY.md, CONTRIBUTING.md)
- 6-layer security CI/CD (CodeQL, Semgrep, Gitleaks, Trivy, Socket.dev, Dependabot)
- Published to Anthropic MCP Registry

## [1.0.0] - 2026-02-20
### Added
- Initial release with 7 AI-generated seed documents
- 13 standard tools (8 core + 5 EU integration)
- Vercel Streamable HTTP deployment
- npm package with stdio transport

[Unreleased]: https://github.com/Ansvar-Systems/chinese-law-mcp/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Ansvar-Systems/chinese-law-mcp/compare/v1.1.2...v2.0.0
[1.1.2]: https://github.com/Ansvar-Systems/chinese-law-mcp/compare/v1.0.0...v1.1.2
[1.0.0]: https://github.com/Ansvar-Systems/chinese-law-mcp/releases/tag/v1.0.0
