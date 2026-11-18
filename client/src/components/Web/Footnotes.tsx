import { useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SearchResultData, ValidSource } from 'librechat-data-provider';
import { FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type NumberedSource = ValidSource & { citationNumber: number };

/** Sources that carry a citation number, one per number, in numeric order. */
function collectNumbered(searchResults?: { [key: string]: SearchResultData }): NumberedSource[] {
  const byNumber = new Map<number, NumberedSource>();
  for (const result of Object.values(searchResults ?? {})) {
    for (const source of result?.organic ?? []) {
      const number = source.citationNumber;
      if (number != null && source.link && !byNumber.has(number)) {
        byNumber.set(number, { ...source, citationNumber: number });
      }
    }
  }
  return [...byNumber.values()].sort((a, b) => a.citationNumber - b.citationNumber);
}

/** Collapsible list of the numbered sources an answer cites, shown beneath the answer. */
export default function Footnotes({
  searchResults,
}: {
  searchResults?: { [key: string]: SearchResultData };
}) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const sources = useMemo(() => collectNumbered(searchResults), [searchResults]);

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-3" role="region" aria-label={localize('com_sources_region_label')}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={listId}
        className="text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:ring-border-heavy inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span>{localize('com_sources_count', { count: sources.length })}</span>
        <ChevronDown
          className={cn(
            'size-4 transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ol id={listId} className="mt-1 flex flex-col gap-0.5">
          {sources.map((source) => (
            <li key={source.citationNumber}>
              <a
                href={source.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-surface-tertiary flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
              >
                <span className="bg-surface-tertiary text-text-secondary flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                  {source.citationNumber}
                </span>
                <FaviconImage domain={getCleanDomain(source.link)} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block truncate text-sm">
                    {source.title || source.link}
                  </span>
                  <span className="text-text-secondary-alt block truncate text-xs">
                    {getCleanDomain(source.link)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
