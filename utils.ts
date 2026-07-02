import React, { useState } from "react";
import { motion } from "motion/react";
import { FolderKanban, Lock, User, Eye, EyeOff, AlertCircle } from "lucide-react";
import { User as UserType } from "../types";
import { safeJson } from "../utils";

interface LoginProps {
  onLoginSuccess: (user: UserType) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !pin.trim()) {
      setError("Por favor, complete todos los campos.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), pin: pin.trim() }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Error al iniciar sesión.");
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans selection:bg-blue-600 selection:text-white">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-8"
      >
        {/* Header Icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-blue-100 mb-4">
            <FolderKanban className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-850 tracking-tight">
            CloudDrive
          </h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Sincronización local en tiempo real estilo Drive
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg flex items-start gap-3 text-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username Input */}
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2"
            >
              Usuario
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                <User className="w-5 h-5" />
              </span>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Ej. Frida29"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-lg text-slate-900 text-sm font-medium transition-colors outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* PIN / Password Input */}
          <div>
            <label
              htmlFor="pin"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2"
            >
              Contraseña o PIN
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                <Lock className="w-5 h-5" />
              </span>
              <input
                id="pin"
                type={showPin ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-lg text-slate-900 text-sm font-medium tracking-widest transition-colors outline-none focus:ring-1 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-100 active:scale-[0.98]"
          >
            {loading ? "Accediendo..." : "Entrar al Sistema"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
