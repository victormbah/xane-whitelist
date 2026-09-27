// Copy lifted directly from the marketing lead's spec doc.
// {{tag}}       -> user's current active tag (premium if active, else free tag)
// {{position}}  -> formatted waitlist position, e.g. "#1,284"
// {{nextGoal}}  -> short string like "Seven more referrals and you're an Advocate."

function formatPosition(position) {
  return `#${Number(position).toLocaleString('en-US')}`;
}

const TEMPLATES = {
  waitlist_member: ({ tag, position }) => ({
    subject: `@${tag} is yours`,
    html: `
      <p>@${tag} —</p>
      <p>Your XaneTag is reserved. Nobody else can take it.</p>
      <p>You're ${formatPosition(position)} on the waitlist. The first 100 get rewards when Xane launches.</p>
      <p>Here's how to move: refer 1 person and you jump 3 places.</p>
      <p><a href="{{referralLink}}">Copy your link</a></p>
      <p>Every referral moves you up the waitlist and counts toward your level. Three referrals makes you a Xane Scout.</p>
      <p><a href="{{leaderboardLink}}">See all levels</a></p>
      <p>— The Xane team</p>
    `,
  }),
  scout: ({ tag, position, nextGoal }) => ({
    subject: `You're a Xane Scout!`,
    html: `
      <p>@${tag} —</p>
      <p>Three people joined Xane through you. That makes you a Scout.</p>
      <p>You now get early Xane updates before everyone else.</p>
      <p>You're at ${formatPosition(position)}. ${nextGoal}</p>
      <p><a href="{{leaderboardLink}}">See your climb</a></p>
    `,
  }),
  advocate: ({ tag, position, nextGoal }) => ({
    subject: `Say Goodbye to @${tag}!`,
    html: `
      <p>@${tag} —</p>
      <p>Ten referrals. You're a Xane Advocate now.</p>
      <p>Your XaneTag is now @${tag}. No number. Just your name and nobody can take it.</p>
      <p>You also get first look at Xane opportunities as they open.</p>
      <p>You're at ${formatPosition(position)}. ${nextGoal}</p>
      <p><a href="{{leaderboardLink}}">See your climb</a></p>
    `,
  }),
  ambassador: ({ tag, position, nextGoal }) => ({
    subject: `You're a Xane Ambassador`,
    html: `
      <p>@${tag} —</p>
      <p>Thirty people. Most users never pass three.</p>
      <p>As an Ambassador, you can host your own Xane campaigns, and you're eligible for campaign incentives.</p>
      <p>Someone from our team will reach out this week about your first one.</p>
      <p>You're at ${formatPosition(position)}. ${nextGoal}</p>
      <p><a href="{{leaderboardLink}}">See your climb</a></p>
    `,
  }),
  lead: ({ tag, position }) => ({
    subject: `You're Xane in your city`,
    html: `
      <p>@${tag} —</p>
      <p>Fifty referrals. You're now a Xane Lead.</p>
      <p>You represent Xane in your city. Your name goes on the map, and you get a direct line to the team.</p>
      <p>Your merch ships at launch. We will ask for your size and address closer to the date.</p>
      <p>You're at ${formatPosition(position)}.</p>
      <p>Fifty people trusted you enough to try something new. That's the hard part, and you've already done it.</p>
      <p>You're not just on the waitlist; you're part of how Xane gets built.</p>
      <p><a href="{{leaderboardLink}}">See your climb</a></p>
    `,
  }),
};

const NEXT_GOAL_COPY = {
  waitlist_member: 'Three referrals makes you a Xane Scout.',
  scout: 'Seven more referrals and you\'re an Advocate.',
  advocate: 'Twenty more to Ambassador.',
  ambassador: 'Twenty more to Xane Lead.',
  lead: '',
};

module.exports = { TEMPLATES, NEXT_GOAL_COPY, formatPosition };
