// Referral ladder, in ascending order. Matches the "The ladder" section of the spec.
const LEVELS = [
  { key: 'waitlist_member', threshold: 0, label: 'Waitlist Member' },
  { key: 'scout', threshold: 3, label: 'Xane Scout' },
  { key: 'advocate', threshold: 10, label: 'Xane Advocate' },
  { key: 'ambassador', threshold: 30, label: 'Xane Ambassador' },
  { key: 'lead', threshold: 50, label: 'Xane Lead' },
  // 'captain' and 'founding_council' are locked/unrevealed until launch per the spec,
  // so they're intentionally not reachable through referral_count here.
];

function levelForReferralCount(count) {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (count >= level.threshold) current = level;
  }
  return current;
}

function nextLevel(currentKey) {
  const idx = LEVELS.findIndex((l) => l.key === currentKey);
  return LEVELS[idx + 1] || null;
}

module.exports = { LEVELS, levelForReferralCount, nextLevel };
