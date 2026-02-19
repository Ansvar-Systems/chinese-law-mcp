/**
 * Chinese legal citation formatter.
 *
 * Formats:
 *   chinese:  "第三条 中华人民共和国网络安全法"
 *   english:  "Article 3, Cybersecurity Law of the People's Republic of China"
 *   full:     "Article 3, Cybersecurity Law (CSL 2016)"
 *   short:    "Art. 3 CSL 2016"
 *   pinpoint: "Art. 3, Para. 1"
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';
import { buildChineseRef } from '../utils/chinese-numerals.js';

export function formatCitation(
  parsed: ParsedCitation,
  format: CitationFormat = 'full'
): string {
  if (!parsed.valid || !parsed.article) {
    return '';
  }

  const articleNum = parseInt(parsed.article, 10);
  const paragraphNum = parsed.paragraph ? parseInt(parsed.paragraph, 10) : undefined;
  const title = parsed.title ?? parsed.title_en ?? '';

  switch (format) {
    case 'chinese': {
      const ref = buildChineseRef(
        isNaN(articleNum) ? 0 : articleNum,
        paragraphNum
      );
      return `${ref} ${title}`.trim();
    }

    case 'english': {
      let ref = `Article ${parsed.article}`;
      if (parsed.paragraph) {
        ref += `, Paragraph ${parsed.paragraph}`;
      }
      const name = parsed.title_en ?? title;
      return `${ref}, ${name}`.trim().replace(/,\s*$/, '');
    }

    case 'full': {
      let ref = `Article ${parsed.article}`;
      if (parsed.paragraph) {
        ref += `, Paragraph ${parsed.paragraph}`;
      }
      return `${ref}, ${title}`.trim().replace(/,\s*$/, '');
    }

    case 'short': {
      let ref = `Art. ${parsed.article}`;
      if (parsed.paragraph) {
        ref += `, Para. ${parsed.paragraph}`;
      }
      return `${ref} ${title}`.trim();
    }

    case 'pinpoint': {
      let ref = `Art. ${parsed.article}`;
      if (parsed.paragraph) {
        ref += `, Para. ${parsed.paragraph}`;
      }
      return ref;
    }

    default:
      return `Article ${parsed.article}, ${title}`.trim().replace(/,\s*$/, '');
  }
}
