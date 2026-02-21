# Chinese Law MCP Server

**The NPC Law Database alternative for the AI age.**

[![npm version](https://badge.fury.io/js/%40ansvar/chinese-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/chinese-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Chinese-law-mcp?style=social)](https://github.com/Ansvar-Systems/Chinese-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Chinese-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Chinese-law-mcp/actions/workflows/ci.yml)

Query **Chinese legislation** -- covering data protection, cybersecurity, corporate law, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Chinese legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Chinese legal research is scattered across official government databases, commercial legal platforms, and institutional archives. Whether you're:
- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking if a statute is still in force
- A **legal tech developer** building tools on Chinese law
- A **researcher** tracing legislative history

...you shouldn't need dozens of browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

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

- *"What does the Chinese data protection law say about consent?"*
- *"Search for cybersecurity requirements in Chinese legislation"*
- *"Is this statute still in force?"*
- *"Find provisions about personal data in Chinese law"*
- *"What EU directives does this Chinese law implement?"*
- *"Which Chinese laws implement the GDPR?"*
- *"Validate this legal citation"*
- *"Build a legal stance on data breach notification requirements"*

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across all provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by statute + chapter/section |
| `check_currency` | Check if statute is in force, amended, or repealed |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from statutes for a legal topic |
| `format_citation` | Format citations per Chinese conventions (full/short/pinpoint) |
| `list_sources` | List all available statutes with metadata |
| `about` | Server info, capabilities, and coverage summary |

### EU/International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations for Chinese statute |
| `get_chinese_law_implementations` | Find Chinese laws implementing EU act |
| `search_eu_implementations` | Search EU documents with Chinese implementation counts |
| `get_provision_eu_basis` | Get EU law references for specific provision |
| `validate_eu_compliance` | Check implementation status of EU directives |

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from official Chinese government sources
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by statute identifier + chapter/section
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
Official Sources --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                     ^                       ^
              Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search official databases by statute number | Search by plain language |
| Navigate multi-chapter statutes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Is this statute still in force?" --> check manually | `check_currency` tool --> answer in seconds |
| Find EU basis --> dig through EUR-Lex | `get_eu_basis` --> linked EU directives instantly |
| No API, no integration | MCP protocol --> AI-native |

---

## Data Sources & Freshness

All content is sourced from authoritative Chinese legal databases:

- **[National People's Congress](https://www.npc.gov.cn)** -- Official Chinese government legal database

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

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
> Statute text is sourced from official Chinese government publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is limited** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources for court filings
> - **EU cross-references** are extracted from statute text, not EUR-Lex full text

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Chinese-law-mcp
cd Chinese-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

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

**30+ national law MCPs** covering Australia, Brazil, Canada, China, Denmark, Finland, France, Germany, Ghana, Iceland, India, Ireland, Israel, Italy, Japan, Kenya, Netherlands, Nigeria, Norway, Singapore, Slovenia, South Korea, Sweden, Switzerland, Thailand, UAE, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion
- EU cross-reference improvements
- Historical statute versions and amendment tracking
- Additional statutory instruments and regulations

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] EU/international law cross-references
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Court case law expansion
- [ ] Historical statute versions (amendment tracking)
- [ ] Preparatory works / explanatory memoranda
- [ ] Lower court and tribunal decisions

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{chinese_law_mcp_2025,
  author = {Ansvar Systems AB},
  title = {Chinese Law MCP Server: AI-Powered Legal Research Tool},
  year = {2025},
  url = {https://github.com/Ansvar-Systems/Chinese-law-mcp},
  note = {Chinese legal database with full-text search and EU cross-references}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Chinese Government (public domain)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server started as our internal reference tool -- turns out everyone building compliance tools has the same research frustrations.

So we're open-sourcing it.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
