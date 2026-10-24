import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countEmojis } from '../util.js';
import { fallbackGroupPost, fallbackNudge, groupPost, habitNudge, timeLeftPhrase } from '../habit.js';

const failing = async () => {
  throw new Error('AI down');
};

test('timeLeftPhrase', () => {
  assert.equal(timeLeftPhrase(0.4), 'under an hour');
  assert.equal(timeLeftPhrase(1.2), 'about 1 hour');
  assert.equal(timeLeftPhrase(4.6), 'about 5 hours');
  assert.equal(timeLeftPhrase(undefined), 'the rest of the day');
});

test('fallback nudges: both tones, ≤ 120 chars, ≤ 1 emoji', () => {
  const cases = [
    { tone: 'supportive', streak: 6, best: 10 },
    { tone: 'supportive', streak: 10, best: 10 },
    { tone: 'supportive', streak: 0, best: 3 },
    { tone: 'roast', streak: 6, best: 10 },
    { tone: 'roast', streak: 0, best: 0 },
  ];
  for (const c of cases) {
    const m = fallbackNudge({ name: 'Nav', habitLabel: 'creatine', hoursLeftToday: 4, ...c });
    assert.ok(m.length <= 120, m);
    assert.ok(countEmojis(m) <= 1, m);
  }
  assert.equal(
    fallbackNudge({ name: 'Nav', habitLabel: 'creatine', tone: 'supportive', streak: 6, best: 10, hoursLeftToday: 4 }),
    'Nav, 6 days strong on creatine. About 4 hours left to make it 7 💪'
  );
});

test('habitNudge: AI failure → fallback flag', async () => {
  const r = await habitNudge({ name: 'Nav', habitLabel: 'creatine', tone: 'roast', streak: 6, best: 6, hoursLeftToday: 3 }, { generate: failing });
  assert.equal(r.fallback, true);
  assert.match(r.message, /6-day creatine streak/);
});

test('habitNudge: AI output trimmed to one line, 1 emoji, 120 chars', async () => {
  const generate = async () => ({ message: `"Six days in, don't fumble the creatine now 💪🔥🎉 ${'so close '.repeat(20)}"\nsecond line` });
  const r = await habitNudge({ name: 'Nav', habitLabel: 'creatine', tone: 'supportive', streak: 6, best: 6, hoursLeftToday: 3 }, { generate });
  assert.equal(r.fallback, undefined);
  assert.ok(r.message.length <= 120);
  assert.equal(countEmojis(r.message), 1);
  assert.ok(!r.message.includes('second line'));
});

test('habitNudge: personal insult → fallback', async () => {
  const generate = async () => ({ message: 'Get up, you lazy loser.' });
  const r = await habitNudge({ name: 'Nav', habitLabel: 'creatine', tone: 'roast', streak: 2, best: 5, hoursLeftToday: 3 }, { generate });
  assert.equal(r.fallback, true);
});

test('fallback group posts', () => {
  assert.equal(
    fallbackGroupPost({ name: 'Nav', habitLabel: 'creatine', tone: 'supportive', streak: 6, event: 'habit_done', groupStats: { done_today: 3, members: 5 } }),
    'Nav checked off creatine 💪 · 6-day streak · 3/5 done today'
  );
  assert.match(fallbackGroupPost({ name: 'Nav', habitLabel: 'creatine', tone: 'roast', streak: 6, event: 'streak_broken' }), /6-day creatine streak/);
  assert.match(fallbackGroupPost({ name: 'Nav', habitLabel: 'creatine', tone: 'supportive', streak: 6, event: 'streak_broken' }), /ended/);
});

test('groupPost: AI output accepted and capped; failure → fallback', async () => {
  const ok = await groupPost(
    { name: 'Nav', habitLabel: 'creatine', tone: 'supportive', streak: 6, event: 'habit_done', groupStats: { done_today: 3, members: 5 } },
    { generate: async () => ({ body: 'Nav took creatine 💪 · 6-day streak · 3/5 done today' }) }
  );
  assert.deepEqual(ok, { body: 'Nav took creatine 💪 · 6-day streak · 3/5 done today' });
  const bad = await groupPost({ name: 'Nav', habitLabel: 'creatine', tone: 'roast', streak: 6, event: 'habit_done' }, { generate: failing });
  assert.equal(bad.fallback, true);
  assert.ok(bad.body.length <= 140);
});
