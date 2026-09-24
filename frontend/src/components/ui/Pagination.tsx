import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
};

const pageWindow = (page: number, pageCount: number) => {
  const window = 1;
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - window; p <= page + window; p += 1) {
    if (p > 0 && p <= pageCount) pages.add(p);
  }
  return Array.from(pages).sort((a, b) => a - b);
};

export const Pagination: React.FC<PaginationProps> = ({ page, pageCount, onChange }) => {
  if (pageCount <= 1) return null;
  const pages = pageWindow(page, pageCount);

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Page précédente"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      {pages.map((p, index) => {
        const prev = pages[index - 1];
        const gap = prev !== undefined && p - prev > 1;
        return (
          <React.Fragment key={p}>
            {gap && <span className="pagination__ellipsis">…</span>}
            <button
              type="button"
              className={`pagination__btn${p === page ? ' pagination__btn--active' : ''}`}
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          </React.Fragment>
        );
      })}
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="Page suivante"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
};
