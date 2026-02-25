# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-02-25
### Fixed
- **FTS5 tokenizer**: Switched from `unicode61` to `trigram` for correct CJK substring matching. Compound term searches like `数据出境` now return results (was 0 with unicode61).
- **build_legal_stance**: Now functional — was broken by unicode61 tokenizer producing 0 results for CJK queries.
- **Short-form IDs**: Added English names mapping (38 major laws). `PIPL`, `CSL`, `DSL` etc. now resolve correctly in `get_provision`, `check_currency`, and other tools.
- **LIKE fallback**: Queries shorter than 3 characters (trigram minimum) now fall back to LIKE-based search instead of returning 0 results.
- **Tool descriptions**: Removed false claims about English query support, updated document_id examples from non-existent short IDs to real Chinese names/abbreviations, added EU scaffold warnings.
- **Empty-string fallback**: Fixed `??` → `||` in build-db.ts so empty `title_en`/`short_name` from seed data correctly falls back to English names mapping.

### Changed
- Database size increased from ~51 MB to ~70 MB due to trigram index overhead (expected tradeoff for correct CJK search).

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
