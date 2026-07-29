import { describe, expect, it } from 'vitest';
import { resolveSpeakOrientationClass } from './use-three-speak-orientation';

const ORIGIN = 'https://play.3speak.tv';

function playerReady(data: Record<string, unknown>, origin = ORIGIN) {
  return { origin, data: { type: '3speak-player-ready', ...data } };
}

describe('resolveSpeakOrientationClass', () => {
  it('marks a vertical clip as portrait', () => {
    expect(
      resolveSpeakOrientationClass(
        playerReady({
          isVertical: true,
          width: 1080,
          height: 1920,
          aspectRatio: 1080 / 1920,
        }),
      ),
    ).toBe('speak-portrait');
  });

  it('marks a square clip as square', () => {
    expect(
      resolveSpeakOrientationClass(
        playerReady({
          isVertical: false,
          width: 720,
          height: 720,
          aspectRatio: 1,
        }),
      ),
    ).toBe('speak-square');
  });

  it('leaves a landscape clip on the default 16:9 box', () => {
    expect(
      resolveSpeakOrientationClass(
        playerReady({
          isVertical: false,
          width: 1920,
          height: 1080,
          aspectRatio: 1920 / 1080,
        }),
      ),
    ).toBeNull();
  });

  it('ignores a message from another origin', () => {
    expect(
      resolveSpeakOrientationClass(
        playerReady({ isVertical: true }, 'https://evil.example'),
      ),
    ).toBeNull();
  });

  it('ignores an unrelated message from the player', () => {
    expect(
      resolveSpeakOrientationClass({
        origin: ORIGIN,
        data: { type: '3speak-player-progress', isVertical: true },
      }),
    ).toBeNull();
  });

  it('ignores a message with no data', () => {
    expect(
      resolveSpeakOrientationClass({ origin: ORIGIN, data: undefined }),
    ).toBeNull();
  });
});
