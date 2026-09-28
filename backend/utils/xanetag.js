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

function isValidTagFormat(tag) {
  return FREE_TAG_REGEX.test(normalizeTag(tag));
}

function isValidPremiumTagFormat(tag) {
  return PREMIUM_TAG_REGEX.test(normalizeTag(tag));
}

function isReserved(tag) {
  return RESERVED_TAGS.has(normalizeTag(tag));
}

function suggestAlternatives(tag) {
  const base = normalizeTag(tag).slice(0, 16);
  const suggestions = new Set();

  for (let i = 0; i < 10 && suggestions.size < 3; i++) {
    const suffix = Math.floor(10 + Math.random() * 90);
    const candidate = `${base}_${suffix}`.slice(0, 20);

    if (isValidTagFormat(candidate) && !isReserved(candidate)) {
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