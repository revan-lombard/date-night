/**
 * @file content/dialogue.js
 * @responsibility The conversation graph — data only, no logic. Nine questions
 * plus one quiet beat for Ayah, then -> 'ending'. Every line is grounded in
 * "Our Story" (Jonathan & Simone): the dates, the places, the WhatsApp, the
 * movie, the lion, the letterboard. The highest-love answer in each node is the
 * one that requires actually knowing her / their history; a stranger could not
 * guess it. Nothing here can make him lose — the worst path is still dinner.
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

  // Q1 — does he know what today is. (Official 17 Sept 2016; married 17 Sept 2023.)
  q1: {
    speaker: 'partner',
    line: 'So. Do you even remember what today is?',
    choices: [
      { text: 'Ten years together. Three married. Same date, twice — because you\'re efficient.', love: +10, next: 'q2' },
      { text: "Of course. It's... a Thursday?",        love: -6,  next: 'q2' },
      { text: 'Our anniversary. Which one, though?',   love: +2,  next: 'q2' },
    ],
  },

  // Q2 — where they first met (right here, Murphy's in Lambton).
  q2: {
    speaker: 'partner',
    line: 'Do you remember the first time we met? Properly remember it?',
    choices: [
      { text: "Right here at Murphy's. Lambton. 2016. You were trouble.", love: +10, next: 'q_text' },
      { text: 'At a party, I think?',                                     love: -2,  next: 'q_text' },
      { text: 'Feels like a whole lifetime ago.',                        love: +2,  next: 'q_text' },
    ],
  },

  // Q3 — the WhatsApp that started it all (18 May 2016).
  q_text: {
    speaker: 'partner',
    line: "And then I had to text you first, remember? What did I say?",
    mood: 'warm',
    choices: [
      { text: '"Hey stranger 😊." 18 May 2016. Then you invited me to your sister\'s 21st.', love: +10, next: 'q_movie' },
      { text: '"Hey stranger." Then something about the Matric Dance.',                  love: +6,  next: 'q_movie' },
      { text: 'Was it "u up?"',                                                          love: -5,  next: 'q_movie' },
    ],
  },

  // Q4 — the first date (26 Sept 2016, NuMetro at Bedford Centre).
  q_movie: {
    speaker: 'partner',
    line: 'Okay, pop quiz. Our first proper date. What did we watch?',
    choices: [
      { text: 'Suicide Squad. NuMetro, Bedford Centre. You hated it, I loved it.', love: +9, next: 'q3' },
      { text: 'Some superhero thing?',                                             love: +1, next: 'q3' },
      { text: 'I was watching you, not the movie.',                                love: +4, next: 'q3' },
    ],
  },

  // Q5 — best trip. Pilanesberg was their first adventure together.
  q3: {
    speaker: 'partner',
    line: 'What was the best trip we ever took, in your honest opinion?',
    choices: [
      { text: 'Pilanesberg. Our first one. The lion at sunrise.', love: +8, next: 'q4' },
      { text: 'They were all good, really.',                      love: +1, next: 'q4' },
      { text: 'Ballito — the drive down, windows open.',          love: +4, next: 'q4' },
    ],
  },

  // Q6 — say the thing. Their motto — it's on the poster.
  q4: {
    speaker: 'partner',
    line: 'Okay. Say the thing. You know the thing.',
    mood: 'warm',
    choices: [
      { text: 'One team. One mission. One God.', love: +12, next: 'q_ring' },
      { text: 'What thing? Haha.',               love: -4,  next: 'q_ring' },
      { text: 'A tender, normal reply.',         love: 0,   next: 'q_ring' },
    ],
  },

  // Q7 — the proposal (18 Dec 2021, Pretoria: sunflowers, candles, a letterboard).
  q_ring: {
    speaker: 'partner',
    line: 'The day you asked me. What did the little letterboard say? I still have it, you know.',
    mood: 'warm',
    choices: [
      { text: '"Forever starts today." Sunflowers everywhere. You cried before I did.', love: +10, next: 'q5' },
      { text: '"Will you marry me?" Obviously.',                                        love: -2,  next: 'q5' },
      { text: 'I was too busy shaking to read it.',                                      love: +4,  next: 'q5' },
    ],
  },

  // Q8 — soft, vulnerable. Worst option deflects with a joke.
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
    line: "You feel that? Like Ayah's right here with us — curled up under the table, same as every dinner.",
    mood: 'warm',
    choices: [
      { text: 'She is. Best girl never misses a dinner.',   love: +8, next: 'q6' },
      { text: '[Say nothing. Squeeze her hand.]',           love: +6, next: 'q6' },
      { text: "Don't you make me cry at dinner, Simone.",   love: +4, next: 'q6' },
    ],
  },

  // Q9 — forward-looking. Their real next quests: own home, a family.
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
