import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DeckEntryLogo } from './DeckEntryLogo';

describe('DeckEntryLogo', () => {
  it('renders the shared 万象星核 logo asset', () => {
    const markup = renderToStaticMarkup(
      <DeckEntryLogo className="shared-deck-logo" />,
    );

    expect(markup).toContain('class="shared-deck-logo"');
    expect(markup).toContain(
      '/project-assets/userscript-deck/visual/action-icons/novabay-icon.svg',
    );
    expect(markup).toContain('draggable="false"');
  });
});
