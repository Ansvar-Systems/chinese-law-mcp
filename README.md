# Chinese Law MCP

[![npm version](https://img.shields.io/npm/v/@ansvar/chinese-law-mcp)](https://www.npmjs.com/package/@ansvar/chinese-law-mcp)
[![CI](https://github.com/Ansvar-Systems/chinese-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/chinese-law-mcp/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/Ansvar-Systems/chinese-law-mcp/badge)](https://securityscorecards.dev/viewer/?uri=github.com/Ansvar-Systems/chinese-law-mcp)

An MCP (Model Context Protocol) server providing full-text search and article-level retrieval of Chinese legislation. Covers the core cybersecurity and data protection trilogy (CSL, PIPL, DSL), commercial law (Company Law, Civil Code contract provisions, E-Commerce Law), competition law (Anti-Monopoly Law), and critical infrastructure protection regulations. All data is sourced from the official National People's Congress (npc.gov.cn) and State Council (gov.cn) portals. The database includes both Chinese original text and English reference translations where available.

## Data Sources

| Source | Authority | Method | Update Frequency | License | Coverage |
|--------|-----------|--------|-----------------|---------|----------|
| [NPC Law Database](https://www.npc.gov.cn) | National People's Congress | HTML Scrape | On change | Government Public Data | All national laws adopted by NPC and NPCSC |
| [NPC English Translations](http://en.npc.gov.cn.cdurl.cn/laws.html) | National People's Congress | HTML Scrape | On change | Government Public Data (Reference Only) | Selected major laws in English |
| [State Council / gov.cn](https://www.gov.cn) | State Council | HTML Scrape | On change | Government Public Data | Administrative regulations, implementing rules |
| [PKU Law (pkulaw.com)](https://www.pkulaw.com) | Peking University Legal Information Center | HTML Scrape | Daily | Commercial Subscription | Comprehensive law + English translations (supplementary) |
| [China Justice Observer](https://www.chinajusticeobserver.com) | CJO | HTML Scrape | On change | CC / Editorial | English translations, cross-references (secondary) |

> Full provenance metadata: [`sources.yml`](./sources.yml)

## Laws Covered

| Law | Chinese Name | Adopted | Effective | Key Topic |
|-----|-------------|---------|-----------|-----------|
| **Cybersecurity Law (CSL)** | 网络安全法 | 2016-11-07 (amended 2025-10-28) | 2017-06-01 (rev. 2026-01-01) | Network security, CII protection |
| **Personal Information Protection Law (PIPL)** | 个人信息保护法 | 2021-08-20 | 2021-11-01 | Personal data protection |
| **Data Security Law (DSL)** | 数据安全法 | 2021-06-10 | 2021-09-01 | Data classification, national core data |
| **Company Law** | 公司法 | 2023-12-29 (revised) | 2024-07-01 | Corporate governance, shareholder rights |
| **Civil Code (Book Three: Contracts)** | 民法典 第三编 合同 | 2020-05-28 | 2021-01-01 | Contract formation, performance, liability |
| **E-Commerce Law** | 电子商务法 | 2018-08-31 | 2019-01-01 | Platform obligations, consumer protection |
| **Anti-Monopoly Law** | 反垄断法 | 2022-06-24 (amended) | 2022-08-01 | Market competition, digital economy |
| **Constitution (selected provisions)** | 宪法 | 2018-03-11 (amended) | 2018-03-11 | Fundamental rights, state structure |

Additionally includes key State Council administrative regulations:

- Critical Information Infrastructure Security Protection Regulations (关键信息基础设施安全保护条例)
- Network Data Security Management Regulations (网络数据安全管理条例)
- MLPS / Classified Protection requirements referenced in GB/T 22239

## Quick Start

### npx (no install)

```bash
npx @ansvar/chinese-law-mcp
```

### npm install

```bash
npm install -g @ansvar/chinese-law-mcp
chinese-law-mcp
```

### Claude Desktop Configuration

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chinese-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/chinese-law-mcp"]
    }
  }
}
```

### Cursor Configuration

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "chinese-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/chinese-law-mcp"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_legislation` | Full-text search across all Chinese laws and regulations. Supports Chinese and English queries. Returns matching provisions with law name, article number, and relevance score. |
| `get_provision` | Retrieve a specific article/provision by law identifier and article number. Returns full text, citation URL, and metadata. |
| `get_provision_eu_basis` | Cross-reference lookup showing the relationship between Chinese laws and their EU/international equivalents (e.g., PIPL vs GDPR, CSL vs NIS2). |
| `validate_citation` | Validate a legal citation against the database. Checks law name, article number, and returns canonical citation format. |
| `check_statute_currency` | Check whether a law or provision is the current version. Returns adoption date, effective date, and amendment history. |
| `list_laws` | List all laws in the database with metadata: official name (Chinese + English), adoption date, effective date, status, and article count. |

## Deployment Tiers

| Tier | Content | Database Size | Platform |
|------|---------|---------------|----------|
| **Free** | All national statutes + administrative regulations + EU cross-references | ~200-400 MB | Vercel (runtime download) or local |
| **Professional** | + Judicial interpretations by SPC + departmental rules + regulatory guidance + full Civil Code | ~2-3 GB | Azure Container Apps / Docker / local |

### Deployment Strategy: LARGE - Dual Tier, Runtime Download

The Chinese legal corpus is massive due to the breadth of national laws, State Council regulations, judicial interpretations, and departmental rules. The free-tier database (statutes + administrative regulations only) is estimated at 200-400 MB, which exceeds the Vercel 250 MB bundle limit. This requires the **Strategy B (runtime download)** approach:

- Free-tier database is compressed and hosted on GitHub Releases
- Downloaded and decompressed to `/tmp` on first cold start (~10-20s)
- Health cron keeps the Vercel function warm to avoid repeated downloads
- Professional tier requires local Docker or Azure Container Apps deployment

### Capability Detection

Both tiers use the same codebase. At startup, the server detects available SQLite tables and gates tools accordingly:

```
Free tier:     core_legislation, eu_references
Professional:  core_legislation, eu_references, judicial_interpretations, departmental_rules, regulatory_guidance
```

Tools that require professional capabilities return an upgrade message on the free tier.

## Database Size Estimates

| Component | Estimated Size | Notes |
|-----------|---------------|-------|
| National laws (NPC + NPCSC) | ~50-80 MB | ~300 laws, full text in Chinese |
| State Council regulations | ~80-120 MB | ~800 administrative regulations |
| English translations | ~30-50 MB | Selected laws with NPC official translations |
| EU cross-references | ~5-10 MB | Mapping tables (PIPL-GDPR, CSL-NIS2, etc.) |
| FTS5 indexes | ~40-80 MB | Full-text search indexes for Chinese text |
| **Free tier total** | **~200-400 MB** | |
| Judicial interpretations (SPC) | ~500 MB-1 GB | Supreme People's Court interpretations |
| Departmental rules | ~500 MB-1 GB | Ministry-level regulations |
| **Professional tier total** | **~2-3 GB** | |

## Data Freshness

- **SLO:** 30 days maximum data age
- **Automated checks:** Weekly upstream change detection
- **Drift detection:** Nightly hash verification of 7 stable provisions (Constitution Art. 1, CSL Art. 1, PIPL Art. 1, DSL Art. 1, Company Law Art. 1, Civil Code Art. 463, AML Art. 1)
- **Health endpoint:** Returns `status: stale` when data exceeds 30-day SLO

## Language Support

The primary language is **Mandarin Chinese (zh)**. All official law text is in Chinese, which is the sole legally binding version.

English translations are included where available from the NPC English portal (en.npc.gov.cn). These translations are explicitly marked as "Translation for Reference Only" and are not legally authoritative. The search tool supports queries in both Chinese and English.

## Contributing

Contributions are welcome. Please read [SECURITY.md](./SECURITY.md) before submitting issues or pull requests.

For data accuracy issues (wrong text, missing articles, stale provisions), use the [data error report template](https://github.com/Ansvar-Systems/chinese-law-mcp/issues/new?template=data-error.md).

## License

Apache-2.0

The law text itself is public domain under Chinese law. This project's code and database structure are licensed under Apache-2.0.
