import { useMemo, useState } from 'react';

export const usePagination = <T,>(items: T[], pageSize = 10) => {
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(items.length / pageSize);

  const data = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    totalPages,
    data,
    setPage,
  };
};
