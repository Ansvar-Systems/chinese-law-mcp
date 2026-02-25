/**
 * Tool registry for Chinese Law MCP Server.
 * Shared between stdio (index.ts) and HTTP (api/mcp.ts) entry points.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation, SearchLegislationInput } from './search-legislation.js';
import { getProvision, GetProvisionInput } from './get-provision.js';
import { listSources } from './list-sources.js';
import { validateCitationTool, ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { checkCurrency, CheckCurrencyInput } from './check-currency.js';
import { getEUBasis, GetEUBasisInput } from './get-eu-basis.js';
import { getChineseImplementations, GetChineseImplementationsInput } from './get-chinese-implementations.js';
import { searchEUImplementations, SearchEUImplementationsInput } from './search-eu-implementations.js';
import { getProvisionEUBasis, GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getAbout, type AboutContext } from './about.js';
export type { AboutContext } from './about.js';

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, freshness, and provenance. ' +
    'Call this to verify data coverage, currency, and content basis before relying on results.',
  inputSchema: { type: 'object', properties: {} },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description:
      'Search Chinese laws and regulations by keyword. Best results with Chinese queries (e.g., "个人信息", "数据出境"). ' +
      'Returns provision-level results with relevance ranking. ' +
      'Results include: document ID, title, provision reference, snippet with >>>highlight<<< markers, and relevance score. ' +
      'Use document_id to filter within a single statute (pass Chinese name like "网络安全法" or English abbreviation like "PIPL"). ' +
      'Use status to filter by in_force/amended/repealed. ' +
      'Content is primarily in Chinese. Default limit is 10 (max 50).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — Chinese terms recommended (e.g., "个人信息", "数据安全"). English terms work for major laws with English metadata (e.g., "PIPL", "cybersecurity").',
        },
        document_id: {
          type: 'string',
          description: 'Filter to a specific law by Chinese name (e.g., "网络安全法"), English abbreviation (e.g., "PIPL", "CSL"), or internal UUID',
        },
        status: {
          type: 'string',
          enum: ['in_force', 'amended', 'repealed'],
          description: 'Filter by legislative status. Omit to search all statuses.',
        },
        language: {
          type: 'string',
          description: 'Filter by language code. Content is predominantly "zh" (Chinese).',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10, max: 50).',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description:
      'Retrieve the full text of a specific article/provision from a Chinese law. ' +
      'Chinese provisions use article notation: 第一条 (Article 1). ' +
      'Pass document_id as a Chinese name (e.g., "网络安全法"), English abbreviation (e.g., "PIPL", "CSL"), ' +
      'or internal UUID. Fuzzy matching supported. ' +
      'Pass article as the Arabic number (e.g., "3") or provision_ref for exact match. ' +
      'Returns: document ID, title, status, provision reference, and full content text (Chinese). ' +
      'WARNING: Omitting article/provision_ref returns ALL provisions (capped at 200).',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Law identifier: Chinese name (e.g., "网络安全法"), English abbreviation (e.g., "PIPL", "CSL"), or internal UUID. Fuzzy matching supported.',
        },
        article: {
          type: 'string',
          description: 'Article number as Arabic numeral (e.g., "3", "21"). Matched against provision_ref and section columns.',
        },
        provision_ref: {
          type: 'string',
          description: 'Direct provision reference (e.g., "3", "21"). Takes precedence over article if both provided.',
        },
        language: {
          type: 'string',
          description: 'Filter by language code. Content is predominantly "zh" (Chinese).',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'list_sources',
    description:
      'Returns metadata about all data sources backing this server, including jurisdiction, authoritative source details, ' +
      'database tier, schema version, build date, record counts, and known limitations. ' +
      'Call this first to understand data coverage and freshness before relying on other tools.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'validate_citation',
    description:
      'Validate a Chinese legal citation against the database. Supports multiple formats: ' +
      'Chinese ("第三条 网络安全法"), English ("Article 3, Cybersecurity Law"), ' +
      'Short ("Art. 3, CSL 2016"), ID-based ("csl-2016, art. 3"). ' +
      'Returns: valid (boolean), parsed components, formatted citation in Chinese and English, ' +
      'and warnings about repealed/amended status.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Chinese legal citation to validate. Examples: "第三条 网络安全法", "Article 3, Cybersecurity Law", "Art. 3, CSL 2016"',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description:
      'Build a comprehensive set of citations for a legal question by searching across all Chinese laws simultaneously. ' +
      'Best for broad legal research questions like "哪些中国法律规范个人数据处理?" or "数据出境安全". ' +
      'Returns aggregated provision-level results with relevance ranking. ' +
      'Use Chinese queries for best results. English abbreviations (PIPL, CSL) work for document filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Legal question or topic to research — Chinese recommended (e.g., "个人信息处理", "数据出境安全评估")',
        },
        document_id: {
          type: 'string',
          description: 'Optionally limit search to one law by ID or name',
        },
        language: {
          type: 'string',
          description: 'Filter results by language code. Content is predominantly "zh" (Chinese).',
        },
        limit: {
          type: 'number',
          description: 'Max results per category (default: 5, max: 20)',
          default: 5,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description:
      'Format a Chinese legal citation in standard conventions. ' +
      'Formats: "chinese" -> "第三条 网络安全法", "english" -> "Article 3, Cybersecurity Law", ' +
      '"full" -> "Article 3, 网络安全法", "short" -> "Art. 3 CSL", "pinpoint" -> "Art. 3". ' +
      'Does NOT validate existence — use validate_citation for that.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Citation string to format (e.g., "第三条 网络安全法", "Article 3, CSL")',
        },
        format: {
          type: 'string',
          enum: ['full', 'short', 'pinpoint', 'chinese', 'english'],
          description: 'Output format. Default: "full".',
          default: 'full',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description:
      'Check whether a Chinese law is currently in force, amended, or repealed. ' +
      'Returns: is_current (boolean), status, dates (issued, in-force), and warnings. ' +
      'Essential before citing legislation — repealed laws should not be cited as current.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Law identifier: Chinese name (e.g., "网络安全法"), English abbreviation (e.g., "PIPL", "CSL"), or internal UUID',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference to check a specific article',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description:
      'Get EU/international legal basis for a Chinese law. Returns EU instruments that the Chinese law ' +
      'relates to or parallels, including CELEX numbers and relationship type. ' +
      'Note: EU cross-reference data is a scaffold — results may be empty for most laws.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Chinese law identifier (e.g., "个人信息保护法", "PIPL", "网络安全法")',
        },
        include_articles: {
          type: 'boolean',
          description: 'Include specific EU article references in the response (default: false)',
          default: false,
        },
        reference_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['implements', 'supplements', 'applies', 'references', 'complies_with', 'derogates_from', 'amended_by', 'repealed_by', 'cites_article'],
          },
          description: 'Filter by reference type. Omit to return all types.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_chinese_implementations',
    description:
      'Find Chinese laws that implement or relate to a specific EU directive or regulation. ' +
      'Input the EU document ID in "type:year/number" format (e.g., "regulation:2016/679" for GDPR). ' +
      'Note: EU cross-reference data is a scaffold — results may be empty.',
    inputSchema: {
      type: 'object',
      properties: {
        eu_document_id: {
          type: 'string',
          description: 'EU document ID in format "type:year/number" (e.g., "regulation:2016/679" for GDPR)',
        },
        primary_only: {
          type: 'boolean',
          description: 'Return only primary implementing statutes (default: false)',
          default: false,
        },
        in_force_only: {
          type: 'boolean',
          description: 'Return only laws currently in force (default: false)',
          default: false,
        },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description:
      'Search for EU directives and regulations that have Chinese law equivalents or implementations. ' +
      'Search by keyword (e.g., "data protection", "cybersecurity"), filter by type, or year range. ' +
      'Note: EU cross-reference data is a scaffold — results may be limited.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword search across EU document titles (e.g., "data protection")',
        },
        type: {
          type: 'string',
          enum: ['directive', 'regulation'],
          description: 'Filter by EU document type',
        },
        year_from: { type: 'number', description: 'Filter: EU documents from this year onwards' },
        year_to: { type: 'number', description: 'Filter: EU documents up to this year' },
        has_chinese_implementation: {
          type: 'boolean',
          description: 'If true, only return EU documents that have at least one Chinese law equivalent',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20, max: 100)',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  {
    name: 'get_provision_eu_basis',
    description:
      'Get EU/international legal basis for a specific provision within a Chinese law. ' +
      'Use this for pinpoint EU/international compliance checks at the article level. ' +
      'Note: EU cross-reference data is a scaffold — results may be empty for most provisions.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Chinese law identifier (e.g., "个人信息保护法", "PIPL", "网络安全法")',
        },
        provision_ref: {
          type: 'string',
          description: 'Provision reference (e.g., "4", "13")',
        },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description:
      'Check EU/international compliance status for a Chinese law or provision. ' +
      'Returns compliance status: compliant, partial, unclear, or not_applicable. ' +
      'Note: EU cross-reference data is a scaffold — may return not_applicable for most laws.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Chinese law identifier (e.g., "个人信息保护法", "PIPL")',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional: check a specific provision (e.g., "4")',
        },
        eu_document_id: {
          type: 'string',
          description: 'Optional: check compliance with a specific EU document (e.g., "regulation:2016/679")',
        },
      },
      required: ['document_id'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context ? [...TOOLS, ABOUT_TOOL] : TOOLS;
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_legislation':
          result = await searchLegislation(db, args as unknown as SearchLegislationInput);
          break;
        case 'get_provision':
          result = await getProvision(db, args as unknown as GetProvisionInput);
          break;
        case 'list_sources':
          result = await listSources(db);
          break;
        case 'validate_citation':
          result = await validateCitationTool(db, args as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          result = await buildLegalStance(db, args as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          result = await checkCurrency(db, args as unknown as CheckCurrencyInput);
          break;
        case 'get_eu_basis':
          result = await getEUBasis(db, args as unknown as GetEUBasisInput);
          break;
        case 'get_chinese_implementations':
          result = await getChineseImplementations(db, args as unknown as GetChineseImplementationsInput);
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(db, args as unknown as SearchEUImplementationsInput);
          break;
        case 'get_provision_eu_basis':
          result = await getProvisionEUBasis(db, args as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          result = await validateEUCompliance(db, args as unknown as ValidateEUComplianceInput);
          break;
        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
          break;
        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}
