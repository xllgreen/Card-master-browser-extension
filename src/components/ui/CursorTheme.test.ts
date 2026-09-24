import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('shared cursor theme', () => {
  it('uses native cursors while keeping semantic interaction states global', () => {
    const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

    expect(css).toContain('--app-ui-cursor-default: default');
    expect(css).toContain('--app-ui-cursor-pointer: pointer');
    expect(css).not.toContain('visual/cursors/');
    expect(css).toContain(':is(:root, :host, .app-ui-theme)');
    expect(css).toContain('button:not(:disabled)');
    expect(css).toContain('input:disabled');
    expect(css).toContain('[contenteditable="true"]');
  });
});
