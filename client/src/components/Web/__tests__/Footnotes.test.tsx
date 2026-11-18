import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SearchResultData } from 'librechat-data-provider';
import Footnotes from '~/components/Web/Footnotes';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: { count?: number }) =>
    key === 'com_sources_count' ? `Sources (${values?.count})` : key,
}));

jest.mock('~/components/Web/SourceHovercard', () => ({
  FaviconImage: () => null,
  getCleanDomain: (link: string) => new URL(link).hostname,
}));

const results = (): { [key: string]: SearchResultData } => ({
  '0': {
    turn: 0,
    organic: [
      { title: 'Second story', link: 'https://b.test/2', citationNumber: 2 },
      { title: 'First story', link: 'https://a.test/1', citationNumber: 1 },
    ],
  },
  '1': {
    turn: 1,
    organic: [
      { title: 'Repeat of first', link: 'https://a.test/1', citationNumber: 1 },
      { title: 'Unnumbered', link: 'https://c.test/3' },
    ],
  },
});

describe('Footnotes', () => {
  it('stays collapsed and shows the source count until expanded', () => {
    render(<Footnotes searchResults={results()} />);

    const toggle = screen.getByRole('button', { name: 'Sources (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists each numbered source once, in numeric order, with its title and link', () => {
    render(<Footnotes searchResults={results()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sources (2)' }));

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('First story');
    expect(items[1]).toHaveTextContent('2');
    expect(items[1]).toHaveTextContent('Second story');
    expect(screen.getByRole('link', { name: /First story/ })).toHaveAttribute(
      'href',
      'https://a.test/1',
    );
    expect(screen.getByRole('button', { name: 'Sources (2)' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('renders nothing when no source has a citation number or there are no results', () => {
    const plain = { '0': { turn: 0, organic: [{ title: 'x', link: 'https://x.test' }] } };

    const { container, rerender } = render(<Footnotes searchResults={plain} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<Footnotes />);
    expect(container).toBeEmptyDOMElement();
  });
});
