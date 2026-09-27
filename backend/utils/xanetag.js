const TAG_REGEX = /^[a-z0-9_]{3,20}$/;

// A handful of names we never want to hand out.
const RESERVED_TAGS = new Set(['admin', 'xane', 'support', 'help', 'root', 'xaneapp', 'official']);

function normalizeTag(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

/**
 * Validates a free XaneTag against the waitlist rules:
 * 3-20 chars, lowercase letters, numbers and underscores.
 */
function isValidTagFormat(tag) {
  return TAG_REGEX.test(tag);
}

function isReserved(tag) {
  return RESERVED_TAGS.has(tag);
}

/**
 * Suggests alternatives when a requested tag is taken, similar to the
 * "if taken, suggest another option" behaviour in the spec.
 */
function suggestAlternatives(tag) {
  const base = tag.slice(0, 16); // leave room for suffixes within the 20 char cap
  const suggestions = new Set();
  for (let i = 0; i < 6 && suggestions.size < 3; i++) {
    const suffix = Math.floor(10 + Math.random() * 89); // two-digit suffix
    const candidate = `${base}_${suffix}`.slice(0, 20);
    if (isValidTagFormat(candidate)) suggestions.add(candidate);
  }
  return Array.from(suggestions);
}

module.exports = { normalizeTag, isValidTagFormat, isReserved, suggestAlternatives };
