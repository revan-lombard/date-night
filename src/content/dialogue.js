/**
 * @file content/dialogue.js
 * @responsibility The conversation graph — data only, no logic. Six questions
 * plus one quiet beat for Ayah, then -> 'ending' (§8). Copy is final prose
 * grounded in "Our Story" (Jonathan & Simone). The highest-love answer in each
 * node is the one that requires actually knowing her / their history.
 *
 * Node shape:
 *   { speaker: 'partner'|'player', line: string, mood?: 'warm'|'neutral'|'cool',
 *     choices: [{ text, love: number, next: string, once?: boolean }] }
 */

export const START = 'start';

export const NODES = {
  start: {
    speaker: 'partner',
    line: "You made it. I ordered you a red — same as our first night here, hey.",
    mood: 'warm',
    choices: [
      { text: 'Same table, even. You remembered.',    love: +8, next: 'q1' },
      { text: "Actually I'm off the wine tonight.",    love: -4, next: 'q1' },
      { text: '[Kiss her]',                            love: +6, next: 'q1', once: true },
    ],
  },

  // Q1 — does he know what today is.
  q1: {
    speaker: 'partner',
    line: 'So. Do you even remember what today is?',
    choices: [
      { text: 'Ten years. Seventeenth of September.',  love: +10, next: 'q2' },
      { text: "Of course. It's... a Thursday?",        love: -6,  next: 'q2' },
      { text: 'Remind me?',                            love: -2,  next: 'q2' },
    ],
  },

  // Q2 — where they first met (right here, Murphy's).
  q2: {
    speaker: 'partner',
    line: 'Do you remember the first time we met? Properly remember it?',
    choices: [
      { text: "Right here at Murphy's. 2016. You were trouble.", love: +10, next: 'q3' },
      { text: 'At a party, I think?',                            love: -2,  next: 'q3' },
      { text: 'Feels like a whole lifetime ago.',               love: +2,  next: 'q3' },
    ],
  },

  // Q3 — best trip. Pilanesberg was their first adventure together.
  q3: {
    speaker: 'partner',
    line: 'What was the best trip we ever took, in your honest opinion?',
    choices: [
      { text: 'Pilanesberg. Our first one. The lion at sunrise.', love: +8, next: 'q4' },
      { text: 'They were all good, really.',                      love: +1, next: 'q4' },
      { text: 'Ballito — the drive down, windows open.',          love: +4, next: 'q4' },
    ],
  },

  // Q4 — say the thing. Their motto / running line.
  q4: {
    speaker: 'partner',
    line: 'Okay. Say the thing. You know the thing.',
    mood: 'warm',
    choices: [
      { text: 'One team. One mission. One God.', love: +12, next: 'q5' },
      { text: 'What thing? Haha.',               love: -4,  next: 'q5' },
      { text: 'A tender, normal reply.',         love: 0,   next: 'q5' },
    ],
  },

  // Q5 — soft, vulnerable. Worst option deflects with a joke.
  q5: {
    speaker: 'partner',
    line: 'Can I ask you something real? ... Are you happy? With us?',
    mood: 'neutral',
    choices: [
      { text: 'Happier than I have any words for. You are home.', love: +10, next: 'ayah' },
      { text: '"Happy enough for a Tuesday."',                    love: -8,  next: 'ayah' },
      { text: 'Take her hand. "Yes. Really."',                   love: +8,  next: 'ayah' },
    ],
  },

  // A quiet beat — Ayah (2020). Her place in the story remains, halo and all.
  // Every answer is kind: grief is not a quiz.
  ayah: {
    speaker: 'partner',
    line: "You know who would have loved tonight? Ayah. Curled up right under this table.",
    mood: 'warm',
    choices: [
      { text: 'Best girl. Her place in the story stays.',   love: +8, next: 'q6' },
      { text: '[Say nothing. Squeeze her hand.]',           love: +6, next: 'q6' },
      { text: "Don't you make me cry at dinner, Simone.",   love: +4, next: 'q6' },
    ],
  },

  // Q6 — forward-looking. Their real next quests: own home, a family.
  q6: {
    speaker: 'partner',
    line: 'So what are we actually doing about the house? The family? All of it?',
    choices: [
      { text: "Building it. With you. Starting now.",  love: +9, next: 'ending' },
      { text: "We'll see how things go.",              love: -2, next: 'ending' },
      { text: 'Whatever makes you happiest.',          love: +5, next: 'ending' },
    ],
  },
};
