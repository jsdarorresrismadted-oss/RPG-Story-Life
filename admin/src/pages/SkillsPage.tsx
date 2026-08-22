import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2, Palette } from "lucide-react";
import { adminApi } from "../api";
import JsonField from "../components/JsonField";
import IconPicker from "../components/IconPicker";
import {
  actionFields,
  conditionFields,
  skillModifierFields,
  effectModifierFields,
  scalingFields,
  kindOptions,
  triggerOptions,
  targetOptions,
  passiveTypeOptions,
  passiveFlatGroups,
  passivePercentGroups,
  emptyStatModifiers,
  parseJsonArray,
  parseStatModifiers,
  JsonArrayEditor,
} from "../dslFields";

interface GameClassLite {
  id: string;
  name: string;
}

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const defaultSkill = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  iconSecondary: "",
  kind: "attack",
  trigger: "active",
  target: "enemy",
  cooldown: 0,
  manaCost: 0,
  castTime: 0,
  channelMs: 0,
  rankRequired: 1,
  sortOrder: 0,
  isActive: true,
  scaling: [] as any[],
  actions: [] as any[],
  conditions: [] as any[],
  onConditionMet: [] as any[],
  events: [] as any[],
};

const defaultPassive = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  rankRequired: 1,
  sortOrder: 0,
  isActive: true,
  statModifiers: emptyStatModifiers(),
  skillModifiers: [] as any[],
  effectModifiers: [] as any[],
  conditions: [] as any[],
  events: [] as any[],
  type: "permanente",
  internalCooldownMs: 0,
};

export default function SkillsPage() {
  const [searchParams] = useSearchParams();
  const urlClassId = searchParams.get("class") || "";
  const urlTab = searchParams.get("tab") === "passives" ? "passives" : "skills";
  const queryClient = useQueryClient();
  const { data: classesData } = useQuery({ queryKey: ["crud", "classes"], queryFn: async () => (await adminApi.classes.list()).data });
  const classes: { id: string; name: string }[] = (classesData ?? []).map((c: any) => ({ id: c.id, name: c.name }));
  const [selectedClassId, setSelectedClassId] = useState(urlClassId);
  const [tab, setTab] = useState<"skills" | "passives">(urlTab);
  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: ["crud", "skills", selectedClassId],
    queryFn: async () => (await adminApi.skills.list(selectedClassId)).data,
    enabled: tab === "skills" && !!selectedClassId,
  });
  const skills: any[] = skillsData ?? [];
  const { data: passivesData, isLoading: passivesLoading } = useQuery({
    queryKey: ["crud", "passives", selectedClassId],
    queryFn: async () => (await adminApi.passives.list(selectedClassId)).data,
    enabled: tab === "passives" && !!selectedClassId,
  });
  const passives: any[] = passivesData ?? [];
  const loading = tab === "skills" ? skillsLoading : passivesLoading;
  const reload = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crud", "skills", selectedClassId] }),
      queryClient.invalidateQueries({ queryKey: ["crud", "passives", selectedClassId] }),
    ]);

  useEffect(() => {
    if (classes.length > 0) {
      const valid = urlClassId && classes.some((c) => c.id === urlClassId);
      if (!valid) setSelectedClassId(classes[0].id);
    }
  }, [classes]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...defaultSkill });
  const [saving, setSaving] = useState(false);
  const [artBusy, setArtBusy] = useState(false);
  const [passiveModalOpen, setPassiveModalOpen] = useState(false);
  const [passiveEditing, setPassiveEditing] = useState<any>(null);
  const [passiveForm, setPassiveForm] = useState<any>({ ...defaultPassive });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultSkill });
    setModalOpen(true);
  };

  const openEdit = (skill: any) => {
    setEditing(skill);
    setForm({
      name: skill.name ?? "",
      slug: skill.slug ?? "",
      description: skill.description ?? "",
      icon: skill.icon ?? "",
      iconSecondary: skill.iconSecondary ?? "",
      kind: skill.kind ?? "attack",
      trigger: skill.trigger ?? "active",
      target: skill.target ?? "enemy",
      cooldown: skill.cooldown ?? 0,
      manaCost: skill.manaCost ?? 0,
      castTime: skill.castTime ?? 0,
      channelMs: skill.channelMs ?? 0,
      rankRequired: skill.rankRequired ?? 1,
      sortOrder: skill.sortOrder ?? 0,
      isActive: skill.isActive ?? true,
      scaling: parseJsonArray(skill.scaling),
      actions: parseJsonArray(skill.actions),
      conditions: parseJsonArray(skill.conditions),
      onConditionMet: parseJsonArray(skill.onConditionMet),
      events: parseJsonArray(skill.events),
    });
    setModalOpen(true);
  };

  const buildPayload = () => {
    const payload: Record<string, any> = {
      name: form.name,
      slug: form.slug || form.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `skill-${Date.now()}`,
      description: form.description,
      icon: form.icon || null,
      kind: form.kind,
      trigger: form.trigger,
      target: form.target,
      cooldown: Number(form.cooldown) || 0,
      manaCost: Number(form.manaCost) || 0,
      castTime: Number(form.castTime) || 0,
      channelMs: Number(form.channelMs) || 0,
      rankRequired: Number(form.rankRequired) || 1,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: !!form.isActive,
    };
    for (const key of ["scaling", "actions", "conditions", "onConditionMet", "events"] as const) {
      payload[key] = Array.isArray(form[key]) && form[key].length > 0 ? JSON.stringify(form[key]) : "[]";
    }
    return payload;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!String(form.icon || "").trim()) {
      toast.error("Ícone é obrigatório — escolha o ícone principal da skill");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing?.id) {
        await adminApi.skills.update(editing.id, payload);
        toast.success("Skill updated");
      } else {
        await adminApi.skills.create(selectedClassId, payload);
        toast.success("Skill created");
      }
      setModalOpen(false);
      setEditing(null);
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: any) => {
    if (!window.confirm(`Delete skill "${skill.name}"?`)) return;
    try {
      await adminApi.skills.delete(skill.id);
      toast.success("Skill deleted");
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  const handleGenerateArt = async () => {
    if (!String(form.name || "").trim()) {
      toast.error("Preencha o nome da skill antes de gerar a arte");
      return;
    }
    setArtBusy(true);
    try {
      const { data } = await adminApi.skills.aiIcons({
        name: form.name,
        description: form.description,
        kind: form.kind,
        currentIcon: form.icon,
        seed: editing?.id ? `${editing.id}-${form.name}` : form.name,
      });
      setForm({ ...form, icon: data.icon });
      toast.success("Artes geradas! Revise e salve.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao gerar artes");
    } finally {
      setArtBusy(false);
    }
  };

  const openCreatePassive = () => {
    setPassiveEditing(null);
    setPassiveForm({ ...defaultPassive });
    setPassiveModalOpen(true);
  };

  const openEditPassive = (p: any) => {
    setPassiveEditing(p);
    setPassiveForm({
      name: p.name ?? "",
      slug: p.slug ?? "",
      description: p.description ?? "",
      icon: p.icon ?? "",
      rankRequired: p.rankRequired ?? 1,
      sortOrder: p.sortOrder ?? 0,
      isActive: p.isActive ?? true,
      statModifiers: parseStatModifiers(p.statModifiers),
      skillModifiers: parseJsonArray(p.skillModifiers),
      effectModifiers: parseJsonArray(p.effectModifiers),
      conditions: parseJsonArray(p.conditions),
      events: parseJsonArray(p.events),
      type: p.type ?? "permanente",
      internalCooldownMs: Number(p.internalCooldownMs) || 0,
    });
    setPassiveModalOpen(true);
  };

  const handleSubmitPassive = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: passiveForm.name,
        slug: passiveForm.slug || null,
        description: passiveForm.description,
        icon: passiveForm.icon || null,
        rankRequired: Number(passiveForm.rankRequired) || 1,
        sortOrder: Number(passiveForm.sortOrder) || 0,
        isActive: !!passiveForm.isActive,
        statModifiers: JSON.stringify(passiveForm.statModifiers),
        skillModifiers: JSON.stringify(passiveForm.skillModifiers || []),
        effectModifiers: JSON.stringify(passiveForm.effectModifiers || []),
        conditions: JSON.stringify(passiveForm.conditions || []),
        events: JSON.stringify(passiveForm.events || []),
        type: passiveForm.type || "permanente",
        internalCooldownMs: Number(passiveForm.internalCooldownMs) || 0,
      };
      if (passiveEditing?.id) {
        await adminApi.passives.update(passiveEditing.id, payload);
        toast.success("Passive updated");
      } else {
        await adminApi.passives.create(selectedClassId, payload);
        toast.success("Passive created");
      }
      setPassiveModalOpen(false);
      setPassiveEditing(null);
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePassive = async (p: any) => {
    if (!window.confirm(`Delete passive "${p.name}"?`)) return;
    try {
      await adminApi.passives.delete(p.id);
      toast.success("Passive deleted");
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  const renderField = (
    field: { name: string; label: string; type?: string; options?: string[] },
    span2 = false
  ) => {
    const value = form[field.name];
    if (field.type === "select") {
      return (
        <select value={value ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} className={inputClass}>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "boolean") {
      return (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => setForm({ ...form, [field.name]: e.target.checked })}
            className="w-4 h-4 accent-accent-500"
          />
          <span className="text-sm text-gray-400">{value ? "Yes" : "No"}</span>
        </div>
      );
    }
    if (field.type === "textarea" || span2) {
      return (
        <textarea
          value={value ?? ""}
          onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
          className={`${inputClass} resize-y`}
          rows={3}
        />
      );
    }
    return (
      <input
        type="number"
        value={value ?? 0}
        onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
        className={inputClass}
      />
    );
  };

  const row = (field: { name: string; label: string; type?: string; options?: string[] }, span2 = false) => (
    <div key={field.name} className={span2 ? "sm:col-span-2" : ""}>
      <label className="block text-sm text-gray-400 mb-1.5">{field.label}</label>
      {renderField(field, span2)}
    </div>
  );

  const triggerBadge = (trigger: string) =>
    trigger === "ultimate" ? "bg-purple-500/20 text-purple-400" : trigger === "auto" ? "bg-gray-600/20 text-gray-400" : "bg-accent-500/20 text-accent-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Skills</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-dark-900 border border-dark-600 rounded-lg p-0.5">
            <button
              onClick={() => setTab("skills")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "skills" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Habilidades
            </button>
            <button
              onClick={() => setTab("passives")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "passives" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Passivas
            </button>
          </div>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={tab === "skills" ? openCreate : openCreatePassive}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <span className="text-lg leading-none">+</span> New
          </button>
        </div>
      </div>

      {tab === "passives" ? (
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">ID</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Rank</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Stat Modifiers</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Skill / Effect Mods</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Active</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {passives.map((p) => (
                  <tr key={p.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-[11px] text-gray-500" title={p.id}>{String(p.id ?? "").slice(0, 8)}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium text-white">{p.name}</span>
                      <p className="text-xs text-gray-500 max-w-xs truncate">{p.description}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-xs text-gray-400">Rank {p.rankRequired}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-gray-400">
                      {(() => {
                        const sm = parseStatModifiers(p.statModifiers);
                        const flatCount = Object.keys(sm.flat || {}).length;
                        const pctCount = Object.keys(sm.percent || {}).length;
                        if (!flatCount && !pctCount) return "-";
                        return [flatCount ? `flat: ${flatCount}` : "", pctCount ? `%: ${pctCount}` : ""].filter(Boolean).join(", ");
                      })()}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-gray-400">
                      {(() => {
                        const s = parseJsonArray(p.skillModifiers).length;
                        const e = parseJsonArray(p.effectModifiers).length;
                        return [s ? `skills: ${s}` : "", e ? `effects: ${e}` : ""].filter(Boolean).join(", ") || "-";
                      })()}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-600/20 text-gray-400"}`}>
                        {p.isActive ? "on" : "off"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button onClick={() => openEditPassive(p)} className="text-blue-400 hover:text-blue-300 mr-3">
                        Edit
                      </button>
                      <button onClick={() => handleDeletePassive(p)} className="text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && passives.length === 0 && (
              <p className="text-center text-gray-500 py-8">No passives for this class — click "New" to add one</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">ID</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Trigger</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Kind</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Target</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Cooldown</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Mana</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Rank</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => (
                  <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-[11px] text-gray-500" title={s.id}>{String(s.id ?? "").slice(0, 8)}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium text-white">{s.name}</span>
                      <p className="text-xs text-gray-500 max-w-xs truncate">{s.description}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${triggerBadge(s.trigger)}`}>
                        {s.trigger}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-400">{s.kind || "-"}</td>
                    <td className="py-2.5 px-4 text-gray-400">{s.target || "-"}</td>
                    <td className="py-2.5 px-4 font-mono text-xs">{s.cooldown}</td>
                    <td className="py-2.5 px-4 font-mono text-xs">{s.manaCost}</td>
                    <td className="py-2.5 px-4">{s.rankRequired}</td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(s)} className="text-blue-400 hover:text-blue-300 mr-3">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(s)} className="text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && skills.length === 0 && (
              <p className="text-center text-gray-500 py-8">No skills for this class — click "New" to add one</p>
            )}
          </div>
        </div>
      )}

      {passiveModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setPassiveModalOpen(false); setPassiveEditing(null); }}>
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-4xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{passiveEditing?.id ? "Edit Passive" : "New Passive"}</h2>
              <button onClick={() => { setPassiveModalOpen(false); setPassiveEditing(null); }} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitPassive} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Name *</label>
                  <input type="text" value={passiveForm.name} onChange={(e) => setPassiveForm({ ...passiveForm, name: e.target.value })} className={inputClass} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Slug</label>
                  <input type="text" value={passiveForm.slug} onChange={(e) => setPassiveForm({ ...passiveForm, slug: e.target.value })} className={inputClass} placeholder="ex.: cav-muralha" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Icon</label>
                  <input type="text" value={passiveForm.icon} onChange={(e) => setPassiveForm({ ...passiveForm, icon: e.target.value })} className={inputClass} placeholder="e.g. 'Shield'" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Description *</label>
                  <textarea value={passiveForm.description} onChange={(e) => setPassiveForm({ ...passiveForm, description: e.target.value })} className={`${inputClass} resize-y`} rows={2} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Rank Required</label>
                  <input type="number" min={1} value={passiveForm.rankRequired} onChange={(e) => setPassiveForm({ ...passiveForm, rankRequired: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Tipo de Passiva</label>
                  <select value={passiveForm.type} onChange={(e) => setPassiveForm({ ...passiveForm, type: e.target.value })} className={inputClass}>
                    {passiveTypeOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Cooldown Interno (ms; 0 = sem limite)</label>
                  <input type="number" min={0} value={passiveForm.internalCooldownMs} onChange={(e) => setPassiveForm({ ...passiveForm, internalCooldownMs: Number(e.target.value) })} className={inputClass} />
                  <p className="text-[11px] text-gray-600 mt-1">Tempo mínimo entre gatilhos dos events (anti-loop).</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Sort Order</label>
                  <input type="number" value={passiveForm.sortOrder} onChange={(e) => setPassiveForm({ ...passiveForm, sortOrder: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Active</label>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      checked={!!passiveForm.isActive}
                      onChange={(e) => setPassiveForm({ ...passiveForm, isActive: e.target.checked })}
                      className="w-4 h-4 accent-accent-500"
                    />
                    <span className="text-sm text-gray-400">{passiveForm.isActive ? "Yes" : "No"}</span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Stat Modifiers — Plano</label>
                  <JsonField
                    schema={{ mode: "fixed-record", groups: passiveFlatGroups }}
                    value={passiveForm.statModifiers.flat}
                    onChange={(v) => setPassiveForm({ ...passiveForm, statModifiers: { ...passiveForm.statModifiers, flat: v } })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Stat Modifiers — Percentual</label>
                  <JsonField
                    schema={{ mode: "fixed-record", groups: passivePercentGroups }}
                    value={passiveForm.statModifiers.percent}
                    onChange={(v) => setPassiveForm({ ...passiveForm, statModifiers: { ...passiveForm.statModifiers, percent: v } })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Skill Modifiers</label>
                  <JsonField
                    schema={{ mode: "object-array", addLabel: "Adicionar modificador de skill", fields: skillModifierFields }}
                    value={passiveForm.skillModifiers}
                    onChange={(v) => setPassiveForm({ ...passiveForm, skillModifiers: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Effect Modifiers</label>
                  <JsonField
                    schema={{ mode: "object-array", addLabel: "Adicionar modificador de efeito", fields: effectModifierFields }}
                    value={passiveForm.effectModifiers}
                    onChange={(v) => setPassiveForm({ ...passiveForm, effectModifiers: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Conditions (gate de ativação)</label>
                  <JsonField
                    schema={{ mode: "object-array", addLabel: "Adicionar condição", fields: conditionFields }}
                    value={passiveForm.conditions}
                    onChange={(v) => setPassiveForm({ ...passiveForm, conditions: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Events (reação a eventos de combate)</label>
                  <JsonArrayEditor
                    key={`${passiveEditing?.id ?? "new"}-passive-events`}
                    value={passiveForm.events}
                    onChange={(v) => setPassiveForm({ ...passiveForm, events: v })}
                  />
                  <p className="text-[11px] text-gray-600 mt-1">[{'{ event: "onHit", conditions?: [...], actions: [...] }'}] — ex.: onCast, onHit, onCrit, onKill, onReceiveHit, onBattleStart, onTick, onEffectApplied</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setPassiveModalOpen(false); setPassiveEditing(null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : passiveEditing?.id ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setModalOpen(false); setEditing(null); }}>
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-4xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{editing?.id ? "Edit Skill" : "New Skill"}</h2>
              <button onClick={() => { setModalOpen(false); setEditing(null); }} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Slug</label>
                  <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputClass} placeholder="ex.: cav-golpe-pesado" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Icon</label>
                  <IconPicker categories={["Skills"]} value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} placeholder="Ícone principal da skill" />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleGenerateArt}
                    disabled={artBusy}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {artBusy ? <Loader2 size={16} className="animate-spin" /> : <Palette size={16} />}
                    {artBusy ? "Gerando artes (pode levar ~1 min)..." : "Gerar arte da skill com IA (ícone + efeito)"}
                  </button>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Usa Gemini Image (se GEMINI_API_KEY + GEMINI_IMAGE_MODEL configurados) ou OpenAI (gpt-image-1).
                    Gera um par de artes no estilo atual de iconskill/ e preenche os dois campos.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Description *</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputClass} resize-y`} rows={2} required />
                </div>
                {row({ name: "kind", label: "Kind", type: "select", options: kindOptions })}
                {row({ name: "trigger", label: "Trigger", type: "select", options: triggerOptions })}
                {row({ name: "target", label: "Target", type: "select", options: targetOptions })}
                {row({ name: "cooldown", label: "Cooldown (ms)" })}
                {row({ name: "manaCost", label: "Mana Cost" })}
                {row({ name: "castTime", label: "Cast Time (ms)" })}
                {row({ name: "channelMs", label: "Channel (ms)" })}
                {row({ name: "rankRequired", label: "Rank Required" })}
                {row({ name: "sortOrder", label: "Sort Order" })}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Active</label>
                  {renderField({ name: "isActive", label: "Active", type: "boolean" })}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Scaling (base extra para dano/cura)</label>
                  <JsonField
                    schema={{ mode: "object-array", addLabel: "Adicionar scaling", fields: scalingFields }}
                    value={form.scaling}
                    onChange={(v) => setForm({ ...form, scaling: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Actions (DSL executada pelo motor)</label>
                  <JsonField
                    schema={{ mode: "object-array", addLabel: "Adicionar ação", fields: actionFields }}
                    value={form.actions}
                    onChange={(v) => setForm({ ...form, actions: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Conditions (gate para usar a skill — combos)</label>
                  <JsonField
                    schema={{ mode: "object-array", addLabel: "Adicionar condição", fields: conditionFields }}
                    value={form.conditions}
                    onChange={(v) => setForm({ ...form, conditions: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">On Condition Met (ações executadas quando as conditions passam — substitui actions)</label>
                  <JsonField
                    schema={{ mode: "object-array", addLabel: "Adicionar ação", fields: actionFields }}
                    value={form.onConditionMet}
                    onChange={(v) => setForm({ ...form, onConditionMet: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Events (reação a eventos de combate)</label>
                  <JsonArrayEditor
                    key={`${editing?.id ?? "new"}-skill-events`}
                    value={form.events}
                    onChange={(v) => setForm({ ...form, events: v })}
                  />
                  <p className="text-[11px] text-gray-600 mt-1">[{'{ event: "onHit", conditions?: [...], actions: [...] }'}] — ex.: onCast, onHit, onCrit, onKill, onReceiveHit, onBattleStart, onTick, onEffectApplied</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setModalOpen(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editing?.id ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
