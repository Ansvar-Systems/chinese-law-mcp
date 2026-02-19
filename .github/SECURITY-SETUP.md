# Security Setup Guide (Internal)

## Required Secrets

Configure these secrets in the GitHub repository settings:

| Secret | Purpose | Source |
|--------|---------|--------|
| `NPM_TOKEN` | npm publishing with provenance | npm.js account (Ansvar org) |
| `VERCEL_TOKEN` | Vercel deployment | Vercel dashboard |
| `VERCEL_ORG_ID` | Vercel organization | Vercel dashboard |
| `VERCEL_PROJECT_ID` | Vercel project | Vercel dashboard |

## MCP Registry Publishing

Registry publishing uses Azure Key Vault for signing:

- **Vault:** `kv-ansvar-dev`
- **Key:** `mcp-registry-signing-key`
- **Algorithm:** ECDSA P-384
- **DNS Auth:** `ansvar.eu` TXT record

To publish:
```bash
mcp-publisher login dns azure-key-vault \
  --domain="ansvar.eu" \
  --vault "kv-ansvar-dev" \
  --key "mcp-registry-signing-key"

mcp-publisher publish
```

## Branch Protection

Enable these rules on `main`:
- Require pull request reviews (1 reviewer)
- Require status checks to pass (ci, contract-tests)
- Require branches to be up to date
- Do not allow bypassing the above settings

## Security Scanning

All 6 scanners are configured in `.github/workflows/ci.yml`:
- CodeQL (semantic SAST)
- Semgrep (pattern SAST)
- Trivy (dependency CVE)
- Gitleaks (secret detection)
- Socket Security (supply chain)
- OSSF Scorecard (security posture)
