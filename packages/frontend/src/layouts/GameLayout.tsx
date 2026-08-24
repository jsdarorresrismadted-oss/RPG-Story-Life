import { Outlet } from "react-router-dom";

export function GameLayout() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-yellow-400">RPG Story Life</h1>
          <nav className="flex gap-4">
            <a href="/" className="hover:text-yellow-400">Jogar</a>
            <a href="/character" className="hover:text-yellow-400">Personagem</a>
            <a href="/guild" className="hover:text-yellow-400">Guilda</a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-gray-800 border-t border-gray-700 p-4 text-center text-gray-400">
        RPG Story Life v2.0
      </footer>
    </div>
  );
}