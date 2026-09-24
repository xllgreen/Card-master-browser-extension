import { describe, expect, it } from 'vitest';

import {
  USERSCRIPT_CARD_THEME_ONE_VARIANTS,
  USERSCRIPT_CARD_THEME_TWO_VARIANTS,
  USERSCRIPT_CARD_VARIANTS,
  type UserscriptCardVariant,
  userscriptCardMedia,
} from '../../lib/userscript-deck-media';
import type { UserscriptPresentation } from '../domain/types';
import {
  allocateUserscriptPresentation,
  presentationStillImage,
  resolveUserscriptPresentation,
} from './presentation';

function presentation(variant: UserscriptCardVariant): UserscriptPresentation {
  return {
    accent: '#abcdef',
    media: { kind: 'image', image: userscriptCardMedia(variant).poster },
  };
}

function appearances(variant: UserscriptCardVariant, count: number) {
  return Array.from({ length: count }, () => presentation(variant));
}

describe('userscript presentation allocation', () => {
  it('splits the twelve card covers into the two custom card themes', () => {
    expect(USERSCRIPT_CARD_THEME_ONE_VARIANTS).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(USERSCRIPT_CARD_THEME_TWO_VARIANTS).toEqual([
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
    expect(USERSCRIPT_CARD_VARIANTS).toEqual([
      ...USERSCRIPT_CARD_THEME_ONE_VARIANTS,
      ...USERSCRIPT_CARD_THEME_TWO_VARIANTS,
    ]);
    for (const variant of USERSCRIPT_CARD_THEME_ONE_VARIANTS) {
      // 视频路径仍保留，只用于把早期写进数据的动态卡面对应回同一张静图。
      expect(userscriptCardMedia(variant).video).toBe(
        `userscript-deck/video/userscript-cards/${variant.padStart(2, '0')}.mp4`,
      );
      expect(userscriptCardMedia(variant).poster).toBe(
        `userscript-deck/card-art/userscript-cards/${variant}.svg`,
      );
    }
    for (const variant of USERSCRIPT_CARD_THEME_TWO_VARIANTS) {
      expect(userscriptCardMedia(variant).video).toBe('');
      expect(userscriptCardMedia(variant).poster).toBe(
        `userscript-deck/card-art/userscript-cards/${variant}.svg`,
      );
    }
    expect(
      Object.values(userscriptCardMedia('7')).every(
        (value) => typeof value === 'string',
      ),
    ).toBe(true);
    expect(userscriptCardMedia('7').accent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('gives every card presentation a still image and never a video', () => {
    for (const variant of USERSCRIPT_CARD_VARIANTS) {
      expect(presentationStillImage(presentation(variant))).toBe(
        userscriptCardMedia(variant).poster,
      );
    }
  });

  it('randomizes only among the least-used card presentations', () => {
    const current = [
      ...appearances('1', 6),
      ...appearances('2', 5),
      ...appearances('3', 4),
      ...appearances('4', 4),
      ...appearances('5', 6),
      ...appearances('6', 5),
      ...appearances('7', 5),
      ...appearances('8', 4),
      ...appearances('9', 6),
      ...appearances('10', 5),
      ...appearances('11', 6),
      ...appearances('12', 6),
    ];

    expect(allocateUserscriptPresentation(current, () => 0).media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('3').poster,
    });
    expect(allocateUserscriptPresentation(current, () => 0).accent).toBe(
      userscriptCardMedia('3').accent,
    );
    expect(allocateUserscriptPresentation(current, () => 0.999).media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('8').poster,
    });
    expect(allocateUserscriptPresentation(current, () => 0.999).accent).toBe(
      userscriptCardMedia('8').accent,
    );
  });

  it('randomizes across the full pool when every count is equal', () => {
    const current = USERSCRIPT_CARD_VARIANTS.flatMap((variant) =>
      appearances(variant, 6),
    );
    const first = allocateUserscriptPresentation(current, () => 0);
    const last = allocateUserscriptPresentation(current, () => 0.999);

    expect(first.media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('1').poster,
    });
    expect(last.media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('12').poster,
    });
    expect(allocateUserscriptPresentation(current, () => 0.999)).not.toBe(last);
  });

  it('excludes a card from the next draw after it moves above the minimum', () => {
    const equal = USERSCRIPT_CARD_VARIANTS.flatMap((variant) =>
      appearances(variant, 6),
    );
    const selected = allocateUserscriptPresentation(equal, () => 0.999);

    expect(selected.media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('12').poster,
    });
    expect(
      allocateUserscriptPresentation([...equal, selected], () => 0.999).media,
    ).toEqual({
      kind: 'image',
      image: userscriptCardMedia('11').poster,
    });
  });

  it('counts legacy animated card covers against the same still art', () => {
    const current: UserscriptPresentation[] = USERSCRIPT_CARD_VARIANTS.map(
      (variant) => {
        const media = userscriptCardMedia(variant);
        return {
          accent: '#abcdef',
          media: media.video
            ? { kind: 'video', video: media.video }
            : { kind: 'image', image: media.poster },
        };
      },
    );

    expect(allocateUserscriptPresentation(current, () => 0).media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('1').poster,
    });
  });

  it('ignores custom and unrelated media when counting appearances', () => {
    const current: UserscriptPresentation[] = [
      presentation('1'),
      {
        accent: '#123456',
        media: {
          kind: 'image',
          image: 'data:image/webp;base64,Y292ZXI=',
        },
      },
      {
        accent: '#654321',
        media: {
          kind: 'video',
          video: 'userscript-deck/video/preinstalled-cards/01-bilikit-core.mp4',
        },
      },
    ];

    expect(allocateUserscriptPresentation(current, () => 0).media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('2').poster,
    });
  });

  it('rewrites legacy webp cover references onto the current svg art', () => {
    const resolved = resolveUserscriptPresentation({
      accent: '#111111',
      media: {
        kind: 'image',
        image: 'userscript-deck/card-art/userscript-cards/03.webp',
      },
    });

    expect(resolved.media).toEqual({
      kind: 'image',
      image: 'userscript-deck/card-art/userscript-cards/3.svg',
    });
    expect(resolved.accent).toBe(userscriptCardMedia('3').accent);
  });

  it('resolves a legacy animated preset cover onto its still art', () => {
    const resolved = resolveUserscriptPresentation({
      accent: '#333333',
      media: {
        kind: 'video',
        video: 'userscript-deck/video/userscript-cards/05.mp4',
      },
    });

    expect(resolved.media).toEqual({
      kind: 'image',
      image: 'userscript-deck/card-art/userscript-cards/5.svg',
    });
    expect(resolved.accent).toBe(userscriptCardMedia('5').accent);
  });

  it('keeps the extracted poster of an uploaded animated cover', () => {
    const resolved = resolveUserscriptPresentation({
      accent: '#445566',
      media: {
        kind: 'video',
        video: 'data:video/mp4;base64,YW5pbQ==',
        poster: 'data:image/webp;base64,Y292ZXI=',
      },
    });

    expect(resolved.media).toEqual({
      kind: 'image',
      image: 'data:image/webp;base64,Y292ZXI=',
    });
    expect(resolved.accent).toBe('#445566');
  });

  it('falls back to the default still cover when a video is unrecognisable', () => {
    const resolved = resolveUserscriptPresentation({
      accent: '#222222',
      media: { kind: 'video', video: 'data:video/mp4;base64,YW5pbQ==' },
    });

    expect(resolved.media).toEqual({
      kind: 'image',
      image: userscriptCardMedia('1').poster,
    });
    expect(resolved.accent).toBe(userscriptCardMedia('1').accent);
  });

  it('keeps unrelated custom covers untouched while resolving', () => {
    const resolved = resolveUserscriptPresentation({
      accent: '#222222',
      media: { kind: 'image', image: 'data:image/webp;base64,Y292ZXI=' },
    });

    expect(resolved.media).toEqual({
      kind: 'image',
      image: 'data:image/webp;base64,Y292ZXI=',
    });
    expect(resolved.accent).toBe('#222222');
  });
});
