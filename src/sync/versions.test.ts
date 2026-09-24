import { describe, expect, it, vi } from 'vitest';
import { createRecord, resolveVersions } from './versions';

describe('causal sync versions', () => {
  it('uses ancestry instead of computer clocks to recognize sequential updates', async () => {
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(100000);
      const root = await createRecord('a', resolveVersions([]), {
        'script:a': { name: 'A', value: 1 },
      });
      clock.mockReturnValue(1);
      const update = await createRecord('b', resolveVersions([root]), {
        'script:a': { name: 'A', value: 2 },
      });
      const state = resolveVersions([update, root]);
      expect(state.conflicts).toEqual({});
      expect(state.entries['script:a']?.value).toBe(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('lists remote versions newest first and marks the current heads', async () => {
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(1_000);
      const first = await createRecord('device-one', resolveVersions([]), {
        'script:a': { name: 'A', value: 1 },
      });
      clock.mockReturnValue(2_000);
      const second = await createRecord(
        'device-two',
        resolveVersions([first]),
        {
          'script:a': { name: 'A', value: 2 },
          'script:b': { name: 'B', value: 1 },
        },
      );
      expect(resolveVersions([]).timeline).toEqual([]);
      expect(resolveVersions([second, first]).timeline).toEqual([
        {
          id: second.id,
          at: 2_000,
          device: 'device-two',
          head: true,
          changes: 2,
        },
        {
          id: first.id,
          at: 1_000,
          device: 'device-one',
          head: false,
          changes: 1,
        },
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it('keeps only the most recent versions in the timeline', async () => {
    const clock = vi.spyOn(Date, 'now');
    try {
      const revisions = [];
      let state = resolveVersions([]);
      for (let index = 0; index < 30; index++) {
        clock.mockReturnValue(1_000 + index);
        const revision = await createRecord('device-one', state, {
          'script:a': { name: 'A', value: index },
        });
        revisions.push(revision);
        state = resolveVersions(revisions);
      }
      expect(state.count).toBe(30);
      expect(state.timeline).toHaveLength(24);
      expect(state.timeline?.[0]).toMatchObject({ at: 1_029, head: true });
      expect(state.timeline?.at(-1)?.at).toBe(1_006);
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects missing and cyclic ancestry instead of rebuilding an incomplete state', async () => {
    const root = await createRecord('a', resolveVersions([]), {
      'script:a': { name: 'A', value: 1 },
    });
    const child = await createRecord('a', resolveVersions([root]), {});
    expect(() => resolveVersions([child])).toThrow('缺少父版本');
    expect(() =>
      resolveVersions([{ ...root, parents: [child.id] }, child]),
    ).toThrow('循环引用');
  });
});
