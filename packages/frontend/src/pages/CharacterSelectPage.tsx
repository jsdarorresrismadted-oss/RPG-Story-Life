import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { api } from "../lib/api";

export function CharacterSelectPage() {
  const navigate = useNavigate();
  const { user, characters, token, setCharacters, selectCharacter, initializeAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await initializeAuth();
      const [charsRes, classesRes] = await Promise.all([
        api.get("/api/characters/my"),
        api.get("/api/characters/index"),
      ]);
      setCharacters(charsRes.data.character ? [charsRes.data.character] : []);
      setClasses(classesRes.data.classes || []);
    } catch (err) {
      console.error("Failed to load character data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newCharName.trim() || !selectedClass) return;
    setCreating(true);
    try {
      await api.post("/api/characters", { name: newCharName, classId: selectedClass });
      await loadData();
      setNewCharName("");
      setSelectedClass("");
    } catch (err) {
      alert("Erro ao criar personagem");
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (char: any) => {
    selectCharacter(char);
    navigate("/game");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-yellow-400 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-yellow-400 mb-2">Selecione seu Personagem</h1>
          <p className="text-gray-400">Bem-vindo, {user?.displayName || user?.username}!</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {characters.map((char: any) => (
            <div
              key={char.id}
              onClick={() => handleSelect(char)}
              className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-yellow-400 hover:shadow-lg transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
                  {char.class?.icon || "⚔️"}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{char.name}</h3>
                  <p className="text-gray-400">{char.class?.name} • Level {char.level}</p>
                </div>
              </div>
            </div>
          ))}
          {characters.length < 5 && (
            <div
              onClick={() => setCreating(true)}
              className="bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg p-6 hover:border-yellow-400 hover:bg-gray-700 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[200px]"
            >
              <div className="text-4xl mb-2">+</div>
              <p className="text-gray-400">Criar novo personagem</p>
            </div>
          )}
        </div>

        {creating && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
              <h2 className="text-2xl font-bold text-yellow-400 mb-6">Criar Personagem</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
                  <input
                    type="text"
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-400"
                    maxLength={20}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Classe</label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-400"
                    required
                  >
                    <option value="">Selecione uma classe</option>
                    {classes.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} {c.isStarter ? "(Iniciante)" : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-4 mt-6">
                  <button
                    onClick={() => { setCreating(false); setNewCharName(""); setSelectedClass(""); }}
                    className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newCharName.trim() || !selectedClass}
                    className="flex-1 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg hover:bg-yellow-300 disabled:opacity-50"
                  >
                    {creating ? "Criando..." : "Criar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}