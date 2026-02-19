/**
 * validate_eu_compliance — Check Chinese statute's EU/international compliance status.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { resolveExistingStatuteId } from '../utils/statute-id.js';

export interface ValidateEUComplianceInput {
  document_id: string;
  provision_ref?: string;
  eu_document_id?: string;
}

export interface EUComplianceResult {
  document_id: string;
  provision_ref?: string;
  compliance_status: 'compliant' | 'partial' | 'unclear' | 'not_applicable';
  eu_references_found: number;
  warnings: string[];
  recommendations?: string[];
}

export async function validateEUCompliance(
  db: Database,
  input: ValidateEUComplianceInput
): Promise<ToolResponse<EUComplianceResult>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const resolvedId = resolveExistingStatuteId(db, input.document_id);
  if (!resolvedId) {
    throw new Error(`Document "${input.document_id}" not found in database`);
  }

  let provisionId: number | null = null;
  if (input.provision_ref?.trim()) {
    const row = db.prepare(
      'SELECT id FROM legal_provisions WHERE document_id = ? AND (provision_ref = ? OR section = ?) LIMIT 1'
    ).get(resolvedId, input.provision_ref, input.provision_ref) as { id: number } | undefined;

    if (!row) {
      throw new Error(`Provision "${input.provision_ref}" not found in ${resolvedId}`);
    }

    provisionId = row.id;
  }

  let sql = `
    SELECT ed.id, ed.type, ed.title, er.reference_type, er.is_primary_implementation
    FROM eu_documents ed
    JOIN eu_references er ON ed.id = er.eu_document_id
    WHERE er.document_id = ?
  `;
  const params: (string | number)[] = [resolvedId];

  if (provisionId != null) {
    sql += ` AND er.provision_id = ?`;
    params.push(provisionId);
  }

  if (input.eu_document_id) {
    sql += ` AND ed.id = ?`;
    params.push(input.eu_document_id);
  }

  interface Row {
    id: string; type: string; title: string | null;
    reference_type: string; is_primary_implementation: number;
  }

  const rows = db.prepare(sql).all(...params) as Row[];

  const warnings: string[] = [];
  const recommendations: string[] = [];

  const primaryCount = rows.filter((row) => row.is_primary_implementation === 1).length;

  if (rows.length === 0) {
    recommendations.push(
      'No EU/international references found. If this statute has international equivalents, consider adding cross-references.'
    );
  } else if (primaryCount === 0) {
    warnings.push('EU/international references exist, but none are marked as primary implementation.');
    recommendations.push('Review reference quality and mark the primary implementation links.');
  }

  const status: EUComplianceResult['compliance_status'] =
    rows.length === 0 ? 'not_applicable' :
    primaryCount > 0 ? 'compliant' :
    'partial';

  return {
    results: {
      document_id: resolvedId,
      provision_ref: input.provision_ref,
      compliance_status: status,
      eu_references_found: rows.length,
      warnings,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    },
    _metadata: generateResponseMetadata(db),
  };
}
