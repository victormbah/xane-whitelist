// backend/utils/xanetag.js

const FREE_TAG_REGEX = /^(?=.*[\d_])[a-z0-9_]{5,20}$/;
const PREMIUM_TAG_REGEX = /^[a-z0-9_]{5,20}$/;

const RESERVED_TAGS = new Set([
  'admin',
  'xane',
  'support',
  'help',
  'root',
  'xaneapp',
  'official',
]);

function normalizeTag(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

/**
 * Free XaneTag:
 * - 5–20 characters
 * - lowercase letters, numbers and underscores only
 * - must contain at least one number OR underscore
 */
function isValidTagFormat(tag) {
  return FREE_TAG_REGEX.test(String(tag || ''));
}

/**
 * Premium XaneTag:
 * - 5–20 characters
 * - lowercase letters, numbers and underscores only
 * - no requirement for a number or underscore
 */
function isValidPremiumTagFormat(tag) {
  return PREMIUM_TAG_REGEX.test(String(tag || ''));
}

function isReserved(tag) {
  return RESERVED_TAGS.has(normalizeTag(tag));
}

/**
 * Returns a simple, specific validation message.
 *
 * Examples:
 * victor   -> Add a number or "_"
 * vic.tor  -> Can't use "."
 * VicTor   -> Use lowercase letters only
 * vic      -> Must be at least 5 characters
 */
function getTagValidationError(raw, { premium = false } = {}) {
  const value = String(raw || '').trim();

  if (!value) {
    return 'XaneTag is required';
  }

  if (value.length < 5) {
    return 'Must be at least 5 characters';
  }

  if (value.length > 20) {
    return 'Maximum 20 characters';
  }

  if (/[A-Z]/.test(value)) {
    return 'Use lowercase letters only';
  }

  const invalidCharacter = value.match(/[^a-z0-9_]/);

  if (invalidCharacter) {
    return `Can't use "${invalidCharacter[0]}"`;
  }

  if (!premium && !/[\d_]/.test(value)) {
    return 'Add a number or "_"';
  }

  return null;
}

/**
 * Generate valid Free XaneTag alternatives.
 */
function suggestAlternatives(tag) {
  const base = normalizeTag(tag)
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 16);

  const suggestions = new Set();

  for (let i = 0; i < 20 && suggestions.size < 3; i++) {
    const suffix = Math.floor(10 + Math.random() * 90);
    const candidate = `${base}_${suffix}`.slice(0, 20);

    if (
      isValidTagFormat(candidate) &&
      !isReserved(candidate)
    ) {
      suggestions.add(candidate);
    }
  }

  return Array.from(suggestions);
}

module.exports = {
  normalizeTag,
  isValidTagFormat,
  isValidPremiumTagFormat,
  isReserved,
  getTagValidationError,
  suggestAlternatives,
};