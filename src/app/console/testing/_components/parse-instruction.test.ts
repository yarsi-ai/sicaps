import { describe, it, expect } from 'vitest';
import { parseInstruction } from './parse-instruction';

describe('parseInstruction', () => {
  it('extracts EXPLORE instruction with target', () => {
    const systemMessage = `You are SICAPS, a friendly chatbot...

[TURN GUIDANCE]
Instruction: EXPLORE
Target: lokasi_tubuh
Follow-up: No

Please ask about body location.`;

    const result = parseInstruction(systemMessage);

    expect(result).toEqual({
      type: 'EXPLORE',
      target: 'lokasi_tubuh',
      isFollowUp: false,
    });
  });

  it('extracts FOLLOW_UP instruction with isFollowUp=true', () => {
    const systemMessage = `System prompt text here...

[TURN GUIDANCE]
Instruction: FOLLOW_UP
Target: intensitas
Follow-up: Yes

Additional context.`;

    const result = parseInstruction(systemMessage);

    expect(result).toEqual({
      type: 'FOLLOW_UP',
      target: 'intensitas',
      isFollowUp: true,
    });
  });

  it('extracts COMPLETE instruction without target', () => {
    const systemMessage = `Prompt text...

[TURN GUIDANCE]
Instruction: COMPLETE
Target:
Follow-up: No`;

    const result = parseInstruction(systemMessage);

    expect(result).toEqual({
      type: 'COMPLETE',
      target: null,
      isFollowUp: false,
    });
  });

  it('extracts REDIRECT instruction', () => {
    const systemMessage = `[TURN GUIDANCE]
Instruction: REDIRECT
Target: off_topic
Follow-up: No`;

    const result = parseInstruction(systemMessage);

    expect(result).toEqual({
      type: 'REDIRECT',
      target: 'off_topic',
      isFollowUp: false,
    });
  });

  it('returns null when marker not found', () => {
    const systemMessage = 'You are SICAPS. No guidance section here.';

    const result = parseInstruction(systemMessage);

    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseInstruction('')).toBeNull();
  });

  it('returns null when marker present but no instruction type', () => {
    const systemMessage = `Text before...

[TURN GUIDANCE]
Target: intensitas
Follow-up: Yes`;

    const result = parseInstruction(systemMessage);

    expect(result).toBeNull();
  });

  it('returns null when instruction type is invalid', () => {
    const systemMessage = `[TURN GUIDANCE]
Instruction: INVALID_TYPE
Target: something
Follow-up: No`;

    const result = parseInstruction(systemMessage);

    expect(result).toBeNull();
  });

  it('stops parsing at next section marker', () => {
    const systemMessage = `[TURN GUIDANCE]
Instruction: EXPLORE
Target: waktu
Follow-up: No

[RESPONSE FORMAT]
Respond in JSON format.`;

    const result = parseInstruction(systemMessage);

    expect(result).toEqual({
      type: 'EXPLORE',
      target: 'waktu',
      isFollowUp: false,
    });
  });

  it('handles Follow-up value "true" as truthy', () => {
    const systemMessage = `[TURN GUIDANCE]
Instruction: FOLLOW_UP
Target: kontak
Follow-up: true`;

    const result = parseInstruction(systemMessage);

    expect(result).toEqual({
      type: 'FOLLOW_UP',
      target: 'kontak',
      isFollowUp: true,
    });
  });
});
