# CLAUDE.md - Chinese Law MCP

## Quick Reference

This is the **Chinese Law MCP** — an MCP server providing full-text search and article-level retrieval of Chinese legislation (PRC). Part of the Ansvar Compliance Suite.

## Build & Test

```bash
npm install          # Install dependencies
npm run build        # TypeScript compile
npm run ingest       # Fetch law data from npc.gov.cn / gov.cn
npm run build:db     # Build SQLite database from seed files
npm test             # Run unit tests
npm run test:contract # Run golden contract tests
npm run drift:detect # Check for upstream changes
```

## Key Architecture Decisions

- **MCP-first**: All data via MCP protocol, no RAG
- **Dual transport**: stdio (npm) + Streamable HTTP (Vercel)
- **Runtime download**: Database downloaded from GitHub Releases on cold start (Strategy B)
- **Chinese + English**: Primary language is Chinese (zh), English translations for reference only
- **Chinese numerals**: Full conversion between 第一条 (Chinese) and Article 1 (Arabic)
- **Multi-source**: npc.gov.cn (NPC), gov.cn (State Council), en.npc.gov.cn (English translations)
- **Rate limiting**: 1000ms between requests (Chinese government sites are slower)

## Database Schema

- `legal_documents` — Laws with Chinese + English titles, status, dates
- `legal_provisions` — Individual articles with `language` column (zh/en)
- `provisions_fts` — FTS5 index (unicode61 tokenizer for CJK)
- `eu_documents` — EU/international law cross-references
- `eu_references` — Mapping Chinese law <-> EU law (e.g., PIPL <-> GDPR)
- `definitions` — Legal term definitions
- `db_metadata` — Build info, tier, jurisdiction

## Tools (13 total)

1. `search_legislation` — Full-text search (Chinese + English)
2. `get_provision` — Retrieve specific article
3. `list_sources` — Data source metadata
4. `validate_citation` — Zero-hallucination citation check
5. `build_legal_stance` — Aggregate citations for a topic
6. `format_citation` — Format citation (Chinese/English/full/short/pinpoint)
7. `check_currency` — Check if law is current
8. `get_eu_basis` — EU/international basis for a Chinese law
9. `get_chinese_implementations` — Find Chinese laws for an EU directive
10. `search_eu_implementations` — Search EU docs with Chinese equivalents
11. `get_provision_eu_basis` — Article-level EU cross-reference
12. `validate_eu_compliance` — EU compliance status check
13. `about` — Server metadata and provenance

## Environment Variables

- `CHINESE_LAW_DB_PATH` — Custom database path
- `CHINESE_LAW_DB_URL` — Custom database download URL (for Vercel)

## Deployment Tiers

- **Free**: Key laws (CSL, PIPL, DSL, Company Law, Civil Code, E-Commerce Law, AML) — ~200-400 MB
- **Professional**: + Judicial interpretations, departmental rules — ~2-3 GB
