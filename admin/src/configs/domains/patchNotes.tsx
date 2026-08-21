import { CrudConfig, boolBadge, idColumn } from "../shared";

export const patchNotesConfig: CrudConfig = {
  key: "patchNotes",
  title: "Patch Notes (Dashboard)",
  columns: [
    idColumn,
    { key: "title", label: "Title", render: (v) => <span className="font-medium text-white">{v}</span> },
    { key: "version", label: "Versão" },
    { key: "content", label: "Conteúdo", render: (v) => <span className="text-gray-400 max-w-xs truncate block whitespace-pre">{v}</span> },
    { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
    {
      key: "createdAt",
      label: "Criado em",
      render: (v) => <span className="text-xs text-gray-500">{v ? new Date(v).toLocaleDateString("pt-BR") : "-"}</span>,
    },
  ],
  fields: [
    { name: "title", label: "Título", type: "text", required: true },
    { name: "version", label: "Versão", type: "text", placeholder: "ex: 1.1" },
    { name: "content", label: "Conteúdo", type: "textarea", required: true, hint: "Aviso exibido no Dashboard do jogo. Use \\n para quebra de linha." },
    { name: "isActive", label: "Active (exibir no jogo)", type: "boolean", defaultValue: true },
  ],
};
