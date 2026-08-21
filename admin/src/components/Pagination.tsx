import { Button } from "./ui";

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, pageCount, total, pageSize, onPage }: PaginationProps) {
  if (pageCount <= 1) return null;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-gray-400">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => onPage(page - 1)} disabled={page <= 0}>
          Anterior
        </Button>
        <span className="px-2">
          {page + 1} / {pageCount}
        </span>
        <Button variant="secondary" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
