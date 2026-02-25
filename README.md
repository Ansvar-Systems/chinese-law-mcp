# Chinese Law MCP Server

**The NPC National Law Database alternative for the AI age.**

[![npm version](https://badge.fury.io/js/%40ansvar/chinese-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/chinese-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/chinese-law-mcp?style=social)](https://github.com/Ansvar-Systems/chinese-law-mcp)
[![CI](https://github.com/Ansvar-Systems/chinese-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/chinese-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/chinese-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/chinese-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](#whats-included)
[![Provisions](https://img.shields.io/badge/provisions-62%2C648-blue)](#whats-included)

Query **1,184 Chinese laws and administrative regulations** -- from 个人信息保护法 and 网络安全法 to 民法典, 公司法, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Chinese legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Chinese legal research is scattered across official NPC databases, State Council publications, and commercial legal platforms. Whether you're:
- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking PIPL, CSL, or DSL requirements
- A **legal tech developer** building tools on Chinese law
- A **researcher** analysing legislation across 9 legal categories

...you shouldn't need dozens of browser tabs and manual cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Chinese law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://chinese-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add chinese-law --transport http https://chinese-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chinese-law": {
      "type": "url",
      "url": "https://chinese-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "chinese-law": {
      "type": "http",
      "url": "https://chinese-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/chinese-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "chinese-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/chinese-law-mcp"]
    }
  }
}
```

---

## Example Queries

Once connected, just ask naturally:

- *"个人信息保护法第四条说了什么？"* (What does Article 4 of PIPL say?)
- *"搜索关于数据安全的规定"* (Search for provisions about data security)
- *"网络安全法是否仍然有效？"* (Is the Cybersecurity Law still in force?)
- *"What are the consent requirements under China's PIPL?"*
- *"Find provisions about反垄断 (anti-monopoly) in Chinese law"*
- *"Validate this citation: 民法典 第一条"*
- *"Build a legal stance on data breach notification requirements"*
---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **National Laws** | 385 statutes | Constitution, constitutional-related, civil & commercial, administrative, economic, social, criminal, procedural |
| **Administrative Regulations** | 799 regulations | State Council administrative regulations (行政法规) |
| **Provisions** | 62,648 articles | Full-text searchable with FTS5 |
| **Database Size** | ~51 MB | Optimized SQLite, portable |
| **Daily Updates** | Automated | Freshness checks against NPC database |

### Legal Categories Covered

| Category | Chinese Name | Count |
|----------|-------------|-------|
| Constitution | 宪法 | 7 |
| Constitutional-related | 宪法相关法 | 75 |
| Civil & Commercial | 民法商法 | 46 |
| Administrative | 行政法 | 146 |
| Economic | 经济法 | 133 |
| Social | 社会法 | 44 |
| Criminal | 刑法 | 7 |
| Procedural | 诉讼与非诉讼程序法 | 15 |
| Administrative Regulations | 行政法规 | 799 |
| **Total** | | **1,272 enumerated (1,184 ingestable)** |

**Verified data only** -- every provision is extracted from official DOCX files downloaded from the NPC National Law Database (flk.npc.gov.cn). Zero LLM-generated content.

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is extracted from official NPC DOCX files via mammoth HTML conversion
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law name + article number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
NPC FLK Database → DOCX Download → mammoth HTML → Article Parser → SQLite → FTS5 snippet() → MCP response
                                                      ↑                           ↑
                                              第X条 regex parser          Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Navigate flk.npc.gov.cn SPA manually | Search by plain language: *"个人信息 同意"* |
| Download DOCX files one at a time | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Is this statute still in force?" → check manually | `check_currency` tool → answer in seconds |
| Check multiple sources for updates | Daily automated freshness checks |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Browse flk.npc.gov.cn → Find law → Download DOCX → Open Word → Ctrl+F → Repeat for each law → Manual cross-referencing

**This MCP:** *"What does the PIPL say about cross-border data transfers?"* → Done.

---

## Available Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on 62,648 provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by law name + article number |
| `list_sources` | List all 1,184 available laws with metadata |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from statutes for a legal topic |
| `format_citation` | Format citations per Chinese conventions (full/short/pinpoint) |
| `check_currency` | Check if statute is in force, amended, or repealed |
| `about` | Server info, capabilities, and coverage summary |

---

## Data Sources & Freshness

All content is sourced from authoritative Chinese legal databases:

- **[NPC National Law Database (flk.npc.gov.cn)](https://flk.npc.gov.cn)** -- Official National People's Congress database with full DOCX downloads

### Census-First Ingestion

The entire NPC National Law Database was enumerated via the FLK search API across 9 legal categories. Each law's official DOCX file was downloaded, converted to HTML via mammoth, and parsed article-by-article using Chinese legal numbering patterns (第X条).

| Metric | Value |
|--------|-------|
| **Total laws enumerated** | 1,272 |
| **Ingestable (in force + amended)** | 1,184 |
| **Excluded (repealed)** | 88 |
| **Provisions extracted** | 62,648 |
| **Ingestion success rate** | 99.9% (1 network timeout) |
| **Corpus date** | 2026-02-25 |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors the NPC database for new or amended laws.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from the official NPC National Law Database (flk.npc.gov.cn). However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Only the Chinese-language text is legally binding** -- English queries return Chinese provisions
> - **Verify critical citations** against primary sources for court filings

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for guidance.

---

## Development

### Branching Strategy

This repository uses a `dev` integration branch. **Do not push directly to `main`.**

```
feature-branch → PR to dev → verify on dev → PR to main → deploy
```

- `main` is production-ready. Only receives merges from `dev` via PR.
- `dev` is the integration branch. All changes land here first.
- Feature branches are created from `dev`.

### Setup

```bash
git clone https://github.com/Ansvar-Systems/chinese-law-mcp
cd chinese-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                    # Census-driven full corpus ingestion from flk.npc.gov.cn
npm run build:db                  # Rebuild SQLite database from seed files
npm run check-updates             # Check NPC database for amendments
npm run drift:detect              # Detect data drift against census
npm test                          # Run all tests
npm run test:contract             # Run golden contract tests
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~51 MB (efficient, portable)
- **Ingestion:** Census-first -- 1,272 laws enumerated, 1,184 ingested

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

### [@ansvar/automotive-cybersecurity-mcp](https://github.com/Ansvar-Systems/Automotive-MCP)
**Query UNECE R155/R156 and ISO 21434** -- Automotive cybersecurity compliance. `npx @ansvar/automotive-cybersecurity-mcp`

**69+ national law MCPs** covering Australia, Brazil, Canada, China, Denmark, Finland, France, Germany, Ghana, Iceland, India, Ireland, Israel, Italy, Japan, Kenya, Netherlands, Nigeria, Norway, Poland, Singapore, Slovenia, South Korea, Spain, Sweden, Switzerland, Thailand, Turkey, UAE, UK, US, Zimbabwe, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Judicial interpretation expansion (Supreme People's Court)
- Departmental rules (Ministry-level regulations)
- Historical statute versions and amendment tracking
- English translation integration

---

## Roadmap

- [x] **Full corpus ingestion** -- Census-first: 1,184 laws, 62,648 provisions from NPC DOCX files (v2.0.0)
- [x] **Vercel Streamable HTTP deployment**
- [x] **npm package publication**
- [x] **Golden standard** -- 8 tools, 6-layer security CI/CD, open source files
- [ ] Judicial interpretations (Supreme People's Court)
- [ ] Departmental rules (Ministry-level regulations)
- [ ] Historical statute versions (amendment tracking)
- [ ] English translation integration

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{chinese_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Chinese Law MCP Server: Production-Grade Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/chinese-law-mcp},
  note = {Comprehensive Chinese legal database with 1,184 laws and 62,648 provisions from NPC National Law Database}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Laws & Regulations:** Chinese Government (public domain -- 中华人民共和国政府公开信息)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server started as our internal reference tool -- turns out everyone building compliance tools has the same research frustrations.

So we're open-sourcing it. Navigating 1,184 Chinese laws shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
