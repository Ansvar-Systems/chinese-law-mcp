#!/usr/bin/env tsx
/**
 * Free-tier database builder for Chinese Law MCP server.
 *
 * Builds a smaller database with only key cybersecurity/data protection laws.
 * Used for the Vercel deployment and npm package.
 *
 * Usage: npm run build:db:free
 */

// Re-uses the full build-db.ts logic.
// In practice, the difference is in which seed files are included in data/seed/.
// The free tier includes: CSL, PIPL, DSL, Company Law, Civil Code (contracts), E-Commerce Law, AML.
// The professional tier adds: all State Council regulations, judicial interpretations, departmental rules.

console.log('Free-tier build: Using the same build-db.ts with free-tier seed files.');
console.log('Ensure data/seed/ contains only free-tier law files.\n');

// Dynamic import to run the build
await import('./build-db.js');
