import { DurationPipe } from './duration.pipe';

describe('DurationPipe', () => {
  const pipe = new DurationPipe();

  it('formats seconds as m:ss', () => {
    expect(pipe.transform(0)).toBe('0:00');
    expect(pipe.transform(5)).toBe('0:05');
    expect(pipe.transform(65)).toBe('1:05');
    expect(pipe.transform(214)).toBe('3:34');
  });

  it('formats past an hour as h:mm:ss', () => {
    expect(pipe.transform(3600)).toBe('1:00:00');
    expect(pipe.transform(3725)).toBe('1:02:05');
  });

  it('returns a placeholder for unknown/invalid values', () => {
    expect(pipe.transform(null)).toBe('--:--');
    expect(pipe.transform(undefined)).toBe('--:--');
    expect(pipe.transform(NaN)).toBe('--:--');
    expect(pipe.transform(Infinity)).toBe('--:--');
    expect(pipe.transform(-3)).toBe('--:--');
  });
});
