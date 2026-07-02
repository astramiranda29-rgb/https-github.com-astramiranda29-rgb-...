import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FolderKanban,
  Trash2,
  Users,
  ShieldCheck,
  LogOut,
  FolderOpen,
  Wifi,
  WifiOff,
  Bell,
  Menu,
  X,
  User as UserIcon,
  AlertTriangle
} from "lucide-react";

import Login from "./components/Login";
import DriveView from "./components/DriveView";
import TrashView from "./components/TrashView";
import { safeJson } from "./utils";
import AuditLogView from "./components/AuditLogView";
import UserManagementView from "./components/UserManagementView";

import { User, FolderMetadata, FileMetadata, AuditLog } from "./types";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<"drive" | "trash" | "audit" | "users">("drive");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Synchronized state
  const [folders, setFolders] = useState<FolderMetadata[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isSynced, setIsSynced] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ title: string; message: string } | null>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const cachedUser = localStorage.getItem("drive_user");
    if (cachedUser) {
      try {
        setCurrentUser(JSON.parse(cachedUser));
      } catch (err) {
        console.error("Stale user session");
      }
    }
  }, []);

  // Fetch full drive data
  const fetchDriveContents = async () => {
    try {
      const res = await fetch("/api/drive/contents");
      const data = await safeJson(res);
      if (res.ok) {
        setFolders(data.folders || []);
        setFiles(data.files || []);
        // Save locally to cache in case of disconnects
        localStorage.setItem("drive_cached_folders", JSON.stringify(data.folders || []));
        localStorage.setItem("drive_cached_files", JSON.stringify(data.files || []));
      }
    } catch (err) {
      console.warn("Could not fetch latest server state, loading cached local data");
      const cachedF = localStorage.getItem("drive_cached_folders");
      const cachedFi = localStorage.getItem("drive_cached_files");
      if (cachedF) setFolders(JSON.parse(cachedF));
      if (cachedFi) setFiles(JSON.parse(cachedFi));
    }
  };

  // Fetch audit logs
  const fetchLogs = async () => {
    if (!currentUser || (currentUser.username !== "Frida29" && currentUser.username !== "Fida29" && currentUser.role !== "admin")) return;
    try {
      const res = await fetch(`/api/drive/logs?username=${encodeURIComponent(currentUser.username)}`);
      const data = await safeJson(res);
      if (res.ok) {
        setLogs(data || []);
      }
    } catch (err) {
      console.warn("Could not fetch audit logs");
    }
  };

  // Trigger sync on active user changes
  useEffect(() => {
    if (!currentUser) return;

    // Load initial payloads
    fetchDriveContents();
    fetchLogs();

    // Establish Server-Sent Events (SSE) Real-Time Connection
    const eventSource = new EventSource("/api/sync/events");

    eventSource.onopen = () => {
      setIsSynced(true);
    };

    eventSource.onerror = () => {
      setIsSynced(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "sync_drive") {
          fetchDriveContents();
          fetchLogs();
          showToast("Actualización de Archivos", payload.message);
        } else if (payload.type === "log_update") {
          fetchLogs();
          showToast("Actividad en vivo", payload.message);
        } else if (payload.type === "sync_users") {
          showToast("Gestión de Usuarios", payload.message);
        }
      } catch (err) {
        console.error("Error parsing real-time message", err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [currentUser]);

  const showToast = (title: string, message: string) => {
    setToastNotification({ title, message });
    setTimeout(() => {
      setToastNotification(null);
    }, 4000);
  };

  const handleLoginSuccess = (user: User) => {
    localStorage.setItem("drive_user", JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("drive_user");
    setCurrentUser(null);
    setActiveTab("drive");
    setShowLogoutConfirm(false);
  };

  const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";

  if (isFileProtocol) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
        <div className="w-full max-w-xl bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden p-8">
          <div className="flex items-center gap-3 text-rose-600 mb-6">
            <div className="w-12 h-12 bg-rose-50 rounded-lg flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Ejecución desde Archivo Local Detectada</h2>
              <p className="text-xs text-rose-500 font-medium">HTTP 404 - El servidor no está respondiendo</p>
            </div>
          </div>
          
          <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
            <p>
              Parece que has extraído el archivo <strong>ZIP</strong> y has abierto el archivo <code>index.html</code> directamente haciendo doble clic en él.
            </p>
            <p>
              Este proyecto es una aplicación web <strong>Full-Stack</strong> (Frontend + Backend) que requiere un servidor activo para gestionar la base de datos, los archivos locales, y la sincronización en tiempo real.
            </p>
            
            <div className="bg-slate-50 rounded-lg p-5 border border-slate-200 font-mono text-xs text-slate-850 space-y-3">
              <p className="font-semibold text-slate-900 text-xs uppercase tracking-wider font-sans">Pasos para iniciar el sistema correctamente:</p>
              <div>
                <span className="text-blue-600 font-bold">1.</span> Abre una terminal o consola en la carpeta del proyecto.
              </div>
              <div>
                <span className="text-blue-600 font-bold">2.</span> Instala los paquetes necesarios ejecutando:
                <pre className="mt-1.5 p-2 bg-slate-900 text-slate-100 rounded select-all font-mono">npm install</pre>
              </div>
              <div>
                <span className="text-blue-600 font-bold">3.</span> Inicia el servidor de desarrollo ejecutando:
                <pre className="mt-1.5 p-2 bg-slate-900 text-slate-100 rounded select-all font-mono">npm run dev</pre>
              </div>
              <div>
                <span className="text-blue-600 font-bold">4.</span> Abre la siguiente dirección en tu navegador:
                <a href="http://localhost:3000" className="mt-1 block text-blue-600 hover:underline font-semibold" target="_blank" rel="noopener noreferrer">http://localhost:3000</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Count active trash items
  const trashCount = folders.filter((f) => f.isDeleted).length + files.filter((f) => f.isDeleted).length;
  const isAdmin = currentUser.username === "Frida29" || currentUser.role === "admin";

  // Calculate total used space (excluding deleted files)
  const totalSizeUsed = files.filter((f) => !f.isDeleted).reduce((acc, f) => acc + f.size, 0);

  const formatStorageSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const finalVal = i < sizes.length ? i : sizes.length - 1;
    return parseFloat((bytes / Math.pow(k, finalVal)).toFixed(2)) + " " + sizes[finalVal];
  };

  const totalCapacityBytes = 100000 * 1024 * 1024 * 1024 * 1024; // 100,000 TB
  const usedPercentage = Math.min((totalSizeUsed / totalCapacityBytes) * 100, 100);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white antialiased">
      
      {/* Toast live notifications (SSE) */}
      <AnimatePresence>
        {toastNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="fixed top-4 right-4 z-50 bg-slate-900 text-white rounded-xl p-4 shadow-xl border border-slate-800 flex items-start gap-3.5 max-w-sm w-full"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-blue-400 animate-swing" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">{toastNotification.title}</p>
              <p className="text-sm font-semibold text-white mt-0.5 leading-snug">{toastNotification.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between bg-white px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-blue-200">
            <FolderKanban className="w-4.5 h-4.5" />
          </div>
          <span className="font-bold tracking-tight text-slate-800 text-sm">CloudDrive</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Synchronized indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
            isSynced ? "bg-green-50 text-green-700 border border-green-100" : "bg-amber-50 text-amber-700 border border-amber-100"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isSynced ? "bg-green-500 animate-pulse" : "bg-amber-500"}`} />
            <span>{isSynced ? "Sincronizado" : "Sin Conexión"}</span>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg"
          >
            {isMobileMenuOpen ? <X className="w-5.5 h-5.5" /> : <Menu className="w-5.5 h-5.5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-3 shrink-0 overflow-hidden"
          >
            <div className="p-3.5 bg-slate-50 rounded-xl flex items-center gap-3 border border-slate-100">
              <div className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-xs truncate">{currentUser.username}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">
                  {currentUser.username === "Frida29" ? "Administrador Principal" : "Cuenta de Usuario"}
                </p>
              </div>
            </div>

            <nav className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab("drive");
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "drive" ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="w-4.5 h-4.5" />
                  <span>Mi Unidad</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveTab("trash");
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "trash" ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 className="w-4.5 h-4.5" />
                  <span>Papelera</span>
                </div>
                {trashCount > 0 && (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${activeTab === "trash" ? "bg-blue-200/50 text-blue-800" : "bg-slate-100 text-slate-600"}`}>
                    {trashCount}
                  </span>
                )}
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => {
                      setActiveTab("audit");
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeTab === "audit" ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <ShieldCheck className="w-4.5 h-4.5" />
                    <span>Registro de Auditoría</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab("users");
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeTab === "users" ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <Users className="w-4.5 h-4.5" />
                    <span>Control de Cuentas</span>
                  </button>
                </>
              )}
            </nav>

            {/* Mobile Storage Space Widget */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Espacio del Disco</span>
                <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">100,000 TB</span>
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                <span>{formatStorageSize(totalSizeUsed)} utilizado</span>
                <span className="text-[10px] text-slate-400">Excelente para uso sin Internet</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(usedPercentage, 0.5)}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setShowLogoutConfirm(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4.5 h-4.5" />
              <span>Cerrar Sesión</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar (Left side panel) */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0 select-none">
        {/* Brand Banner */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-100">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-blue-100 shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-slate-800 leading-tight">
              CloudDrive
            </h1>
            <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider mt-0.5">
              Sincronización Local
            </p>
          </div>
        </div>

        {/* User Card */}
        <div className="px-4 py-5 border-b border-slate-100">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
              {currentUser.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800 text-xs truncate" title={currentUser.username}>
                {currentUser.username}
              </p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                {currentUser.username === "Frida29" ? "Administrador" : "Colaborador"}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Rail */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Almacenamiento Fijo</div>
          
          <button
            onClick={() => setActiveTab("drive")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "drive"
                ? "bg-blue-50 text-blue-700 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="w-4.5 h-4.5" />
              <span>Mi Unidad</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab("trash")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "trash"
                ? "bg-blue-50 text-blue-700 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4.5 h-4.5" />
              <span>Papelera</span>
            </div>
            {trashCount > 0 && (
              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                activeTab === "trash" ? "bg-blue-200/50 text-blue-800" : "bg-slate-100 text-slate-600"
              }`}>
                {trashCount}
              </span>
            )}
          </button>

          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Administración
                </span>
              </div>

              <button
                onClick={() => setActiveTab("audit")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "audit"
                    ? "bg-blue-50 text-blue-700 font-bold shadow-sm"
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                <ShieldCheck className="w-4.5 h-4.5" />
                <span>Registro de Auditoría</span>
              </button>

              <button
                onClick={() => setActiveTab("users")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "users"
                    ? "bg-blue-50 text-blue-700 font-bold shadow-sm"
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                <Users className="w-4.5 h-4.5" />
                <span>Control de Cuentas</span>
              </button>
            </>
          )}
        </nav>

        {/* Storage Space Widget */}
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Espacio del Disco</span>
              <span className="text-blue-600">Local Seguro</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Utilizado</p>
                  <p className="font-extrabold text-slate-700 text-xs mt-0.5">
                    {formatStorageSize(totalSizeUsed)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Disponible</p>
                  <p className="font-extrabold text-blue-600 text-xs mt-0.5">
                    100,000 TB
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(usedPercentage, 0.5)}%` }}
                />
              </div>

              <div className="flex items-center gap-1.5 text-[9px] text-slate-450 font-semibold leading-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
                <span>Optimizado para uso 100% sin Internet.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info (Sync Status) */}
        <div className="p-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl text-[11px] bg-slate-50">
            <span className="text-slate-400 font-medium">Sincronización</span>
            <div className="flex items-center gap-1.5 font-bold">
              {isSynced ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-green-500 animate-pulse" />
                  <span className="text-green-700">En línea</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-700">Modo local</span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg font-semibold text-xs transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main content stage */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === "drive" && (
            <motion.div
              key="drive"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <DriveView
                currentUser={currentUser}
                folders={folders}
                files={files}
                onRefresh={fetchDriveContents}
              />
            </motion.div>
          )}

          {activeTab === "trash" && (
            <motion.div
              key="trash"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <TrashView
                currentUser={currentUser}
                folders={folders}
                files={files}
                onRefresh={fetchDriveContents}
              />
            </motion.div>
          )}

          {activeTab === "audit" && isAdmin && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <AuditLogView logs={logs} onRefresh={fetchLogs} />
            </motion.div>
          )}

          {activeTab === "users" && isAdmin && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <UserManagementView currentUser={currentUser} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Logout Custom Confirmation Modal Overlay */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-xl overflow-hidden p-6 space-y-4 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <LogOut className="w-6 h-6 text-amber-600" />
              </div>
              <div className="space-y-1 col-span-3">
                <h3 className="font-extrabold text-slate-800 text-lg">
                  ¿Cerrar Sesión?
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  ¿Está seguro de que desea salir del portal de sincronización? Deberá ingresar su nombre de usuario y PIN para volver a acceder.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
