const FREE_TAG_REGEX = /^(?=.*[\d_])[a-z0-9_]{3,20}$/;
const PREMIUM_TAG_REGEX = /^[a-z0-9_]{3,20}$/;

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

function isValidTagFormat(tag) {
  return FREE_TAG_REGEX.test(tag);
}

function isValidPremiumTagFormat(tag) {
  return PREMIUM_TAG_REGEX.test(tag);
}

function isReserved(tag) {
  return RESERVED_TAGS.has(tag);
}

function suggestAlternatives(tag) {
  const base = tag.slice(0, 16);
  const suggestions = new Set();

  for (let i = 0; i < 6 && suggestions.size < 3; i++) {
    const suffix = Math.floor(10 + Math.random() * 89);
    const candidate = `${base}_${suffix}`.slice(0, 20);

    if (isValidTagFormat(candidate)) {
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
  suggestAlternatives,
};