import { ReactNode } from "react";
import { EmptyState } from "./ui";

export interface DataTableColumn {
  key: string;
  label: string;
  render?: (value: any, item: any) => any;
}

interface DataTableProps {
  columns: DataTableColumn[];
  rows: any[];
  loading?: boolean;
  emptyMessage?: string;
  selected?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
  rowActions?: (item: any) => ReactNode;
  getId?: (item: any) => string;
}

export function DataTable({
  columns,
  rows,
  loading,
  emptyMessage = "Nenhum registro",
  selected,
  onToggleRow,
  onToggleAll,
  allSelected,
  rowActions,
  getId = (item: any) => item.id,
}: DataTableProps) {
  const selectable = !!selected && !!onToggleRow;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-600">
              {selectable && (
                <th className="py-3 px-4 w-10">
                  {onToggleAll && (
                    <input
                      type="checkbox"
                      checked={!!allSelected}
                      onChange={onToggleAll}
                      className="w-4 h-4 accent-accent-500"
                    />
                  )}
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className="text-left py-3 px-4 text-gray-400 font-medium">
                  {col.label}
                </th>
              ))}
              {rowActions && <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const id = getId(item);
              return (
                <tr
                  key={id}
                  className={`border-b border-dark-700 hover:bg-dark-800/50 ${selected?.has(id) ? "bg-accent-600/10" : ""}`}
                >
                  {selectable && (
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        checked={selected!.has(id)}
                        onChange={() => onToggleRow!(id)}
                        className="w-4 h-4 accent-accent-500"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="py-2.5 px-4">
                      {col.render ? col.render(item[col.key], item) : item[col.key] ?? "-"}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">{rowActions(item)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <div className="py-8">
            <EmptyState title={emptyMessage} />
          </div>
        )}
      </div>
    </div>
  );
}
