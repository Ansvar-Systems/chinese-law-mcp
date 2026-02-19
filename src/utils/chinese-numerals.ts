/**
 * Chinese numeral conversion utilities.
 *
 * Converts between Chinese numerals (一, 二, 三, ...) and Arabic numbers.
 * Chinese law uses 第N条 format for article references:
 *   第一条 = Article 1
 *   第二十一条 = Article 21
 *   第一百零三条 = Article 103
 */

const CHINESE_DIGITS: Record<string, number> = {
  '零': 0, '〇': 0,
  '一': 1, '壹': 1,
  '二': 2, '贰': 2, '两': 2,
  '三': 3, '叁': 3,
  '四': 4, '肆': 4,
  '五': 5, '伍': 5,
  '六': 6, '陆': 6,
  '七': 7, '柒': 7,
  '八': 8, '捌': 8,
  '九': 9, '玖': 9,
};

const CHINESE_MULTIPLIERS: Record<string, number> = {
  '十': 10, '拾': 10,
  '百': 100, '佰': 100,
  '千': 1000, '仟': 1000,
};

const ARABIC_TO_CHINESE: string[] = [
  '零', '一', '二', '三', '四', '五', '六', '七', '八', '九',
];

/**
 * Convert a Chinese numeral string to an Arabic number.
 * Examples:
 *   一 -> 1
 *   十 -> 10
 *   十一 -> 11
 *   二十一 -> 21
 *   一百 -> 100
 *   一百零三 -> 103
 *   二百五十六 -> 256
 */
export function chineseToArabic(chinese: string): number {
  const chars = chinese.trim().split('');
  if (chars.length === 0) return 0;

  // Handle single digit
  if (chars.length === 1) {
    if (chars[0] in CHINESE_DIGITS) return CHINESE_DIGITS[chars[0]];
    if (chars[0] === '十') return 10;
    return 0;
  }

  let result = 0;
  let currentNum = 0;
  let lastMultiplier = 1;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    if (char in CHINESE_DIGITS) {
      currentNum = CHINESE_DIGITS[char];
    } else if (char in CHINESE_MULTIPLIERS) {
      const multiplier = CHINESE_MULTIPLIERS[char];

      if (currentNum === 0 && multiplier === 10 && i === 0) {
        // Leading 十 means 10 (e.g., 十一 = 11)
        result += 10;
      } else {
        result += currentNum * multiplier;
      }
      currentNum = 0;
      lastMultiplier = multiplier;
    }
  }

  // Add any trailing digit (e.g., the 三 in 二十三)
  result += currentNum;

  return result;
}

/**
 * Convert an Arabic number to a Chinese numeral string.
 * Examples:
 *   1 -> 一
 *   10 -> 十
 *   11 -> 十一
 *   21 -> 二十一
 *   100 -> 一百
 *   103 -> 一百零三
 */
export function arabicToChinese(num: number): string {
  if (num < 0 || num > 9999) return String(num);
  if (num === 0) return '零';

  const parts: string[] = [];

  const thousands = Math.floor(num / 1000);
  const hundreds = Math.floor((num % 1000) / 100);
  const tens = Math.floor((num % 100) / 10);
  const ones = num % 10;

  if (thousands > 0) {
    parts.push(ARABIC_TO_CHINESE[thousands] + '千');
  }

  if (hundreds > 0) {
    parts.push(ARABIC_TO_CHINESE[hundreds] + '百');
  } else if (thousands > 0 && (tens > 0 || ones > 0)) {
    parts.push('零');
  }

  if (tens > 0) {
    if (tens === 1 && thousands === 0 && hundreds === 0) {
      // Leading 十 without 一 (e.g., 十一 not 一十一)
      parts.push('十');
    } else {
      parts.push(ARABIC_TO_CHINESE[tens] + '十');
    }
  } else if (hundreds > 0 && ones > 0) {
    parts.push('零');
  }

  if (ones > 0) {
    parts.push(ARABIC_TO_CHINESE[ones]);
  }

  return parts.join('');
}

/**
 * Extract article number from a Chinese article reference.
 * Examples:
 *   "第一条" -> 1
 *   "第二十一条" -> 21
 *   "第一百零三条" -> 103
 *   "第三条第一款" -> 3 (article only; paragraph handled separately)
 */
export function extractArticleNumber(ref: string): number | null {
  // Match 第...条 pattern
  const match = ref.match(/第(.+?)条/);
  if (!match) return null;

  const numStr = match[1].trim();

  // Try Arabic numeral first
  const arabicNum = parseInt(numStr, 10);
  if (!isNaN(arabicNum)) return arabicNum;

  // Try Chinese numeral
  return chineseToArabic(numStr);
}

/**
 * Extract paragraph number from a Chinese article reference.
 * Examples:
 *   "第三条第一款" -> 1
 *   "第三条第二款" -> 2
 */
export function extractParagraphNumber(ref: string): number | null {
  const match = ref.match(/第(.+?)款/);
  if (!match) return null;

  const numStr = match[1].trim();

  const arabicNum = parseInt(numStr, 10);
  if (!isNaN(arabicNum)) return arabicNum;

  return chineseToArabic(numStr);
}

/**
 * Build a Chinese article reference string.
 * Examples:
 *   buildChineseRef(3) -> "第三条"
 *   buildChineseRef(21, 1) -> "第二十一条第一款"
 */
export function buildChineseRef(article: number, paragraph?: number): string {
  let ref = `第${arabicToChinese(article)}条`;
  if (paragraph != null && paragraph > 0) {
    ref += `第${arabicToChinese(paragraph)}款`;
  }
  return ref;
}
