import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader, Trash2, X, Wand2 } from "lucide-react";
import { aiApi, itemsApi, questsApi, mapsApi } from "../services/api";
import toast from "react-hot-toast";

interface Plan {
  updates: { id: string; reason: string; patch: Record<string, any> }[];
  deletes: { id: string; reason: string }[];
  provider?: string;
}

const DOMAIN_LABEL: Record<string, string> = {
  items: "Itens",
  quests: "Quests",
  maps: "Mapas",
};

export function AIAdjustModal({
  domain,
  open,
  onClose,
  onApplied,
}: {
  domain: "items" | "quests" | "maps";
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setPlan(null);
    (async () => {
      try {
        const api = domain === "items" ? itemsApi : domain === "quests" ? questsApi : mapsApi;
        const { data } = await api.getAll({ limit: 1000 });
        const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        const m: Record<string, string> = {};
        for (const r of list) m[r.id] = r.name ?? r.title ?? r.id;
        setNames(m);
      } catch {
        /* ignora */
      }
    })();
  }, [open, domain]);

  const analyze = async () => {
    setLoading(true);
    setPlan(null);
    try {
      const { data } = await aiApi.adjust(domain, prompt);
      setPlan(data);
      if ((data.updates?.length || 0) === 0 && (data.deletes?.length || 0) === 0) {
        toast("A IA não encontrou ajustes necessários.", { icon: "ℹ️" });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Falha ao analisar com a IA");
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    if (!window.confirm(`Aplicar ${plan.updates.length} ajuste(s) e remover ${plan.deletes.length} item(ns) de ${DOMAIN_LABEL[domain]}? Esta ação altera o banco.`))
      return;
    setApplying(true);
    try {
      const { data } = await aiApi.adjustApply(domain, plan.updates, plan.deletes);
      toast.success(
        `Aplicado: ${data.updated?.length || 0} atualizado(s), ${data.deleted?.length || 0} removido(s)` +
          (data.skipped?.length ? `, ${data.skipped.length} ignorado(s)` : "")
      );
      onApplied?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Falha ao aplicar");
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="panel w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            <Wand2 size={18} className="text-purple-400" /> IA: Balancear & Limpar — {DOMAIN_LABEL[domain]}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          A IA revisa todos os {DOMAIN_LABEL[domain].toLowerCase()} ativos, sugere ajustes de balanceamento e marca
          itens sem uso (órfãos) para remoção. Você revisa o plano antes de aplicar.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Instruções opcionais (ex.: 'itens de nível 10 não podem custar mais que 5000 gold', 'remova placeholders')"
          className="input-rpg w-full"
        />

        <div className="flex gap-2 mt-3">
          <button onClick={analyze} disabled={loading} className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? "Analisando..." : "Analisar com IA"}
          </button>
          {plan && (
            <button onClick={apply} disabled={applying} className="btn-primary text-sm px-4 py-2 flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50">
              {applying ? <Loader size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {applying ? "Aplicando..." : `Aplicar (${plan.updates.length}↑ / ${plan.deletes.length}🗑)`}
            </button>
          )}
        </div>

        {plan && (
          <div className="mt-4 space-y-4">
            {plan.updates.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Atualizações ({plan.updates.length})</p>
                <div className="space-y-2">
                  {plan.updates.map((u, i) => (
                    <div key={i} className="rounded-lg bg-dark-900/70 border border-dark-700 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white truncate">{names[u.id] || u.id}</span>
                        <span className="text-[10px] text-purple-400 font-mono truncate max-w-[120px]">{u.id}</span>
                      </div>
                      {u.reason && <p className="text-[11px] text-gray-400 mt-1">{u.reason}</p>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(u.patch).map(([k, v]) => (
                          <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 border border-dark-600 text-gray-300">
                            {k}: <span className="text-emerald-300">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.deletes.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-red-400 mb-2">Remoções ({plan.deletes.length})</p>
                <div className="space-y-2">
                  {plan.deletes.map((d, i) => (
                    <div key={i} className="rounded-lg bg-dark-900/70 border border-red-500/30 p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-white truncate block">{names[d.id] || d.id}</span>
                        {d.reason && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{d.reason}</p>}
                      </div>
                      <span className="text-[10px] text-red-400 font-mono truncate max-w-[120px]">{d.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.updates.length === 0 && plan.deletes.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum ajuste necessário.</p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function DomainAdjustButton({
  domain,
  onApplied,
  label,
}: {
  domain: "items" | "quests" | "maps";
  onApplied?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-primary text-sm px-3 py-2 flex items-center gap-2"
      >
        <Wand2 size={15} /> {label || "IA: Balancear & Limpar"}
      </button>
      <AIAdjustModal domain={domain} open={open} onClose={() => setOpen(false)} onApplied={onApplied} />
    </>
  );
}
