import { useState, useRef, useEffect } from "react";
import { useGameStore } from "../../store/gameStore";
import { useAuthStore } from "../../store/authStore";
import { getSocket } from "../../services/socket";
import type { Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import type { ChatMessage } from "../../types";

export function ChatPanel() {
  const { chatMessages, chatChannel, addChatMessage, setChatChannel } = useGameStore();
  const { user } = useAuthStore();
  const { t } = useTranslation("chat");
  const [message, setMessage] = useState("");
  const [showChannels, setShowChannels] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(getSocket());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tryGetSocket = () => {
      const s = getSocket();
      if (s) {
        setSocket(s);
        return;
      }
      if (!cancelled) setTimeout(tryGetSocket, 300);
    };
    tryGetSocket();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg: ChatMessage) => addChatMessage(msg);
    const refreshHandler = () => socket.emit("chat:refresh");
    socket.on("chat:message", handler);
    socket.on("chat:refresh", refreshHandler);
    // Pede o perfil atual (tags) ao conectar, para exibir já atualizado.
    socket.emit("chat:refresh");
    return () => { socket.off("chat:message", handler); socket.off("chat:refresh", refreshHandler); };
  }, [socket, addChatMessage]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("chat:join", chatChannel);
  }, [socket, chatChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = () => {
    if (!message.trim() || !socket) return;
    socket.emit("chat:message", { channel: chatChannel, message: message.trim() });
    setMessage("");
  };

  const channels = [
    { id: "global", label: t("channels.global"), color: "text-purple-400" },
    { id: "local", label: t("channels.local"), color: "text-green-400" },
    { id: "guild", label: t("channels.guild"), color: "text-cyan-400" },
    { id: "party", label: t("channels.party"), color: "text-yellow-400" },
    { id: "trade", label: t("channels.trade"), color: "text-orange-400" },
  ];

  const activeChannel = channels.find((c) => c.id === chatChannel);

  const renderTags = (msg: ChatMessage) => {
    const tags: { label: string; cls: string }[] = [];
    if (msg.role === "admin" || msg.role === "owner") tags.push({ label: "Staff", cls: "bg-red-500/20 text-red-300 border-red-500/40" });
    else if (msg.isVip) tags.push({ label: "VIP", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" });
    if (msg.guildTag) tags.push({ label: msg.guildTag, cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" });
    if (tags.length === 0) return null;
    return (
      <span className="inline-flex items-center gap-0.5 mr-1">
        {tags.map((tag, i) => (
          <span
            key={i}
            className={`text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded border ${tag.cls} mr-0.5`}
          >
            {tag.label}
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="w-80 bg-dark-900/90 backdrop-blur-md border-l border-dark-700 flex flex-col">
      <div className="h-10 border-b border-dark-700 flex items-center px-3 gap-2 relative">
        <button
          onClick={() => setShowChannels(!showChannels)}
          className={`text-xs font-medium px-2 py-1 rounded ${activeChannel?.color} bg-dark-800/50`}
        >
          {activeChannel?.label}
        </button>
        {showChannels && (
          <div className="absolute bottom-12 right-2 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-50">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => { setChatChannel(ch.id); setShowChannels(false); }}
                className={`block w-full text-left px-4 py-2 text-sm hover:bg-dark-700 ${ch.color} ${chatChannel === ch.id ? "bg-dark-700" : ""}`}
              >
                {ch.label}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs text-gray-500">({chatMessages.length})</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chatMessages.map((msg, i) => {
          const isMine = msg.userId === user?.id;
          const nameColor = msg.role === "admin" || msg.role === "owner"
            ? "text-red-400"
            : isMine
              ? "text-purple-400"
              : "text-blue-400";
          return (
            <div key={i} className="text-xs leading-relaxed">
              <span className={`font-semibold ${nameColor}`}>
                {renderTags(msg)}
                <span className={msg.role === "admin" || msg.role === "owner" ? "text-red-300" : ""}>{msg.username}</span>
                {typeof msg.level === "number" && msg.level > 0 && (
                  <span className="text-gray-500 font-normal"> ({msg.level})</span>
                )}
              </span>
              <span className="text-gray-400">: </span>
              <span className="text-gray-300">{msg.message}</span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2 border-t border-dark-700">
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={t("placeholder")}
            className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
          />
          <button onClick={sendMessage} className="p-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
