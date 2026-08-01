import { describe, expect, it } from 'vitest';
import { coverGradient, coverLetter } from './cover';

describe('cover', () => {
  it('is deterministic for a given name', () => {
    expect(coverGradient('Bayaan')).toBe(coverGradient('Bayaan'));
    expect(coverGradient('Bayaan')).not.toBe(coverGradient('Recall'));
  });

  it('takes the first alphanumeric char, uppercased', () => {
    expect(coverLetter('  after')).toBe('A');
    expect(coverLetter('26 songs')).toBe('2');
    expect(coverLetter('')).toBe('♪');
  });
});
