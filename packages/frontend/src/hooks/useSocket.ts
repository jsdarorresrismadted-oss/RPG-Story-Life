import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../stores/authStore";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { token, isAuthenticated } = useAuthStore();

  const connect = useCallback(() => {
    if (!isAuthenticated || !token || socketRef.current?.connected) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL || "/", {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket error:", err.message);
    });

    socketRef.current = socket;
  }, [isAuthenticated, token]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (data: any) => void) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => disconnect();
  }, [isAuthenticated, connect, disconnect]);

  return { socket: socketRef.current, connect, disconnect, emit, on };
}