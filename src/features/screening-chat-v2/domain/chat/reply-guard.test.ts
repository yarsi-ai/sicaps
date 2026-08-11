import { describe, it, expect } from 'vitest';

import { isLeakedReply, hasTrailingLeak, hasLeadingLeak, mentionsEmoji } from './reply-guard';

/** Replies the bot legitimately produces — none of these may be flagged. */
const CLEAN_REPLIES = [
  'Does the itching get even worse at night? 🌙',
  'Are there any small bumps or spots on your itchy skin?',
  'Okay, noted. Does it keep you awake at night?',
  'Gatalnya makin parah pas malem ga? 🌙',
  'Sip, aku catat 👍 Masih ada beberapa pertanyaan singkat lagi ya!',
  'Oke aku udah catat semuanya 📝 Nah menurut kamu, keluhan ini (1) biasa aja, (2) cukup ganggu, atau (3) bikin khawatir banget?',
  'Scabies is a skin condition caused by tiny mites 🦠 It is treatable!',
  'Have you noticed any tiny bumps or red spots on the itchy areas?',
  'Coba liat sela jarimu, ada bintik-bintik kecil atau bentolnya nggak?',
];

describe('hasTrailingLeak', () => {
  it('flags a stray word after the final question mark', () => {
    expect(
      hasTrailingLeak('Are there any small bumps or spots on the itchy parts of your skin? rash'),
    ).toBe(true);
  });

  it('flags a stray word followed by an emoji', () => {
    expect(
      hasTrailingLeak("Have you noticed any small bumps or spots where it's itchy? spot🔴"),
    ).toBe(true);
  });

  it('allows a trailing emoji after the final sentence', () => {
    expect(hasTrailingLeak('Does the itching get even worse at night? 🌙')).toBe(false);
  });

  it('allows several trailing emoji', () => {
    expect(hasTrailingLeak('Semua udah lengkap! 🎉✨')).toBe(false);
  });

  it('allows a reply ending exactly on its punctuation', () => {
    expect(hasTrailingLeak('Are there any small bumps or spots on your itchy skin?')).toBe(false);
  });

  it('allows multiple complete sentences', () => {
    expect(hasTrailingLeak('Okay, noted. Does it keep you awake at night?')).toBe(false);
  });

  it('allows a reply with no sentence punctuation at all', () => {
    expect(hasTrailingLeak('Oke aku catat ya')).toBe(false);
  });

  it('allows an emoji placed mid-reply between sentences', () => {
    expect(hasTrailingLeak('Scabies is caused by tiny mites 🦠 It is treatable!')).toBe(false);
  });
});

describe('hasLeadingLeak', () => {
  it('flags a bulleted checklist', () => {
    expect(hasLeadingLeak('* Allowed topic check: yes')).toBe(true);
  });

  it('flags a bare Yes/No verdict', () => {
    expect(hasLeadingLeak('Yes. Single question check passed.')).toBe(true);
  });

  it('does not flag a normal question', () => {
    expect(hasLeadingLeak('Does the itching get worse at night?')).toBe(false);
  });
});

describe('mentionsEmoji', () => {
  it('flags a described emoji', () => {
    expect(mentionsEmoji('Are there bumps on your skin? spot/bump emoji or skin question.')).toBe(
      true,
    );
  });

  it('does not flag an actual emoji character', () => {
    expect(mentionsEmoji('Does it itch at night? 🌙')).toBe(false);
  });
});

describe('isLeakedReply', () => {
  for (const reply of CLEAN_REPLIES) {
    it(`accepts ${JSON.stringify(reply.slice(0, 45))}`, () => {
      expect(isLeakedReply(reply)).toBe(false);
    });
  }

  const LEAKED = [
    'Are there any small bumps or spots on the itchy parts of your skin? rash',
    "Have you noticed any small bumps or spots where it's itchy? spot🔴",
    'Are there any tiny bumps or spots on the itchy parts of your skin? spot/bump emoji or skin question.',
    '* Allowed topic check: yes',
    '= 1 sentence? Yes',
  ];

  for (const reply of LEAKED) {
    it(`rejects ${JSON.stringify(reply.slice(0, 45))}`, () => {
      expect(isLeakedReply(reply)).toBe(true);
    });
  }
});
