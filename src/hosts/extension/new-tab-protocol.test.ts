import { describe, expect, it } from 'vitest';

import { EXTENSION_CHANNEL } from './extension-channel';
import { newTabRequest } from './new-tab-protocol';
import { extensionRequest } from './protocol';

describe('new-tab protocol', () => {
  it('accepts bounded search requests through the shared extension protocol', () => {
    const request = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-search',
      query: 'card master',
      limit: 12,
      sources: ['history', 'bookmark'],
      blacklist: [{ mode: 'domain', value: 'blocked.example' }],
    };

    expect(newTabRequest(request)).toBe(true);
    expect(extensionRequest(request)).toBe(true);
  });

  it('rejects unknown sources and unbounded inputs', () => {
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-search',
        query: 'query',
        limit: 101,
        sources: ['unknown'],
        blacklist: [],
      }),
    ).toBe(false);
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-favicon-read',
        url: 'https://example.com/',
        size: 512,
      }),
    ).toBe(false);
  });

  it('requires an actual bookmark mutation', () => {
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-bookmark-update',
        id: 'bookmark-1',
      }),
    ).toBe(false);
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-bookmark-move',
        id: 'bookmark-1',
      }),
    ).toBe(false);
  });

  it('accepts the dedicated new-tab settings command', () => {
    const request = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-settings-open',
    };
    expect(newTabRequest(request)).toBe(true);
    expect(extensionRequest(request)).toBe(true);
  });

  it('accepts the dedicated browser new-tab command', () => {
    const request = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-open',
    };
    expect(newTabRequest(request)).toBe(true);
    expect(extensionRequest(request)).toBe(true);
  });

  it('accepts the Bing daily wallpaper refresh command', () => {
    const request = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-bing-wallpaper-refresh',
    };
    expect(newTabRequest(request)).toBe(true);
    expect(extensionRequest(request)).toBe(true);
    expect(
      newTabRequest({
        channel: 'other-channel',
        type: 'new-tab-bing-wallpaper-refresh',
      }),
    ).toBe(false);
  });
});
