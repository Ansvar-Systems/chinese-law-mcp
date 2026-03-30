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
      'Search Chinese laws and regulations by keyword (e.g., "个人信息", "数据出境"). ' +
      'Returns provision-level results with relevance ranking. ' +
      'Results include: document ID, title, provision reference, snippet with >>>highlight<<< markers, and relevance score. ' +
      'Use document_id to filter within a single statute (pass Chinese name like "网络安全法" or abbreviation like "PIPL"). ' +
      'Use category to filter by law type: national_law, admin_reg, local_reg, judicial_interp, regulatory_decision. ' +
      'Use province to filter local regulations by province code (e.g., "BJ" for Beijing, "GD" for Guangdong). ' +
      'Use status to filter by in_force/amended/repealed. ' +
      'Default limit is 10 (max 50).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query in Chinese (e.g., "个人信息", "数据安全", "反垄断").',
        },
        document_id: {
          type: 'string',
          description: 'Filter to a specific law by Chinese name (e.g., "网络安全法"), abbreviation (e.g., "PIPL", "CSL"), or internal UUID',
        },
        category: {
          type: 'string',
          enum: ['national_law', 'admin_reg', 'local_reg', 'judicial_interp', 'regulatory_decision'],
          description: 'Filter by law category. national_law = NPC laws, admin_reg = State Council regulations, local_reg = provincial/municipal regulations, judicial_interp = SPC interpretations.',
        },
        province: {
          type: 'string',
          description: 'Filter local regulations by province code (ISO 3166-2:CN). Examples: BJ (Beijing), SH (Shanghai), GD (Guangdong), ZJ (Zhejiang), JS (Jiangsu).',
        },
        status: {
          type: 'string',
          enum: ['in_force', 'amended', 'repealed'],
          description: 'Filter by legislative status. Omit to search all statuses.',
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
      'Pass document_id as a Chinese name (e.g., "网络安全法"), abbreviation (e.g., "PIPL", "CSL"), ' +
      'or internal UUID. Fuzzy matching supported. ' +
      'Pass article as the Arabic number (e.g., "3") or provision_ref for exact match. ' +
      'Returns: document ID, title, status, provision reference, and full content text. ' +
      'WARNING: Omitting article/provision_ref returns ALL provisions (capped at 200).',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Law identifier: Chinese name (e.g., "网络安全法"), abbreviation (e.g., "PIPL", "CSL"), or internal UUID. Fuzzy matching supported.',
        },
        article: {
          type: 'string',
          description: 'Article number as Arabic numeral (e.g., "3", "21"). Matched against provision_ref and section columns.',
        },
        provision_ref: {
          type: 'string',
          description: 'Direct provision reference (e.g., "3", "21"). Takes precedence over article if both provided.',
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
      'Returns: valid (boolean), parsed components, formatted citation, ' +
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
      'Use Chinese queries for best results. Abbreviations (PIPL, CSL) work for document filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Legal question or topic to research in Chinese (e.g., "个人信息处理", "数据出境安全评估")',
        },
        document_id: {
          type: 'string',
          description: 'Optionally limit search to one law by ID or name',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10, max: 20)',
          default: 10,
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
          description: 'Law identifier: Chinese name (e.g., "网络安全法"), abbreviation (e.g., "PIPL", "CSL"), or internal UUID',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference to check a specific article',
        },
      },
      required: ['document_id'],
    },
  },
];

const LIST_PROVINCES_TOOL: Tool = {
  name: 'list_provinces',
  description:
    'List all Chinese provinces/regions with their law counts. ' +
    'Returns province name, code, and number of local regulations available. ' +
    'Use the province code with search_legislation to filter results.',
  inputSchema: { type: 'object', properties: {} },
};

const LIST_CATEGORIES_TOOL: Tool = {
  name: 'list_categories',
  description:
    'List all law categories with their document counts. ' +
    'Categories: national_law (NPC laws), admin_reg (State Council regulations), ' +
    'local_reg (provincial/municipal regulations), judicial_interp (SPC interpretations), ' +
    'departmental_rule (ministry rules), regulatory_decision (regulatory decisions).',
  inputSchema: { type: 'object', properties: {} },
};

export function buildTools(context?: AboutContext): Tool[] {
  const tools = [...TOOLS, LIST_PROVINCES_TOOL, LIST_CATEGORIES_TOOL];
  return context ? [...tools, ABOUT_TOOL] : tools;
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
        case 'list_provinces': {
          const rows = db.prepare(`
            SELECT province AS name, province_code AS code, COUNT(*) AS law_count
            FROM legal_documents
            WHERE province_code IS NOT NULL
            GROUP BY province_code
            ORDER BY law_count DESC
          `).all();
          result = { provinces: rows, total: rows.length };
          break;
        }
        case 'list_categories': {
          const rows = db.prepare(`
            SELECT category, type, COUNT(*) AS document_count,
              (SELECT COUNT(*) FROM legal_provisions lp JOIN legal_documents ld ON ld.id = lp.document_id WHERE ld.category = legal_documents.category) AS provision_count
            FROM legal_documents
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY document_count DESC
          `).all();
          result = { categories: rows };
          break;
        }
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
