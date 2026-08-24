import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Senhas não coincidem");
      return;
    }
    if (password.length < 8) {
      setError("Senha deve ter pelo menos 8 caracteres");
      return;
    }
    if (username.length < 3) {
      setError("Usuário deve ter pelo menos 3 caracteres");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await register(username, email, password, displayName);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Erro ao registrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg p-8 border border-gray-700">
        <h1 className="text-3xl font-bold text-yellow-400 text-center mb-8">Criar Conta</h1>

        {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Usuário</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
              required
              minLength={3}
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Display Name (opcional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Confirmar Senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg hover:bg-yellow-300 disabled:opacity-50"
          >
            {loading ? "Registrando..." : "Criar Conta"}
          </button>
        </form>

        <p className="mt-6 text-center text-gray-400">
          Já tem conta? <Link to="/login" className="text-yellow-400 hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}