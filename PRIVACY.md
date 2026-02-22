# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Chinese legal professional rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- All China Lawyers Association (ACLA) rules require strict confidentiality and data handling controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/chinese-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/chinese-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://chinese-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text, provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (China)

### ACLA and Lawyers Law Rules

Chinese lawyers are bound by strict confidentiality rules under the Lawyers Law of the People's Republic of China (律师法) and the All China Lawyers Association (ACLA) Code of Conduct.

#### Attorney-Client Confidentiality

- All client communications are protected under the Lawyers Law
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- State secrets and commercial secrets receive additional protection

### PIPL and Client Data Processing

Under the **PIPL (Personal Information Protection Law, 个人信息保护法)**:

- You are the **Personal Information Handler** when processing client personal information
- AI service providers (Anthropic, Vercel) may be **Entrusted Parties** (受托方)
- Cross-border data transfers must comply with PIPL Chapter III requirements (security assessment, standard contracts, or certification)
- The **Cyberspace Administration of China (CAC)** oversees compliance
- Additional requirements under the Data Security Law (数据安全法) and Cybersecurity Law (网络安全法) may apply

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does the Civil Code say about contract formation?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for unfair competition under the Anti-Unfair Competition Law?"
```

- Query pattern may reveal you are working on a competition matter
- Anthropic/Vercel logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases with proper data processing agreements
- Be particularly cautious with matters involving state secrets or national security

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use commercial legal databases (pkulaw.com, Wolters Kluwer China, Westlaw China)

### For Large Firms / Corporate Legal

1. Negotiate data processing agreements with AI service providers under PIPL requirements
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns
4. Assess cross-border data transfer compliance requirements

### For Government / Public Sector

1. Use self-hosted deployment, no external APIs
2. Follow Chinese government information security requirements (MLPS 2.0)
3. Air-gapped option available for classified matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/chinese-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **ACLA Guidance**: Consult All China Lawyers Association ethics guidance

---

**Last Updated**: 2026-02-22
**Tool Version**: 1.0.0
