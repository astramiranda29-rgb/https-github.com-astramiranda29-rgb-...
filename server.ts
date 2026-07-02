import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const CHUNKS_DIR = path.join(DATA_DIR, "chunks");
if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

// Interfaces
interface User {
  id: string;
  username: string;
  pin: string;
  role: "admin" | "user";
  createdAt: string;
}

interface FileMetadata {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  parentFolderId: string;
  createdBy: string;
  createdAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  originalParentFolderId?: string;
}

interface FolderMetadata {
  id: string;
  name: string;
  parentId: string | null;
  category: "presentations" | "images" | "preach" | "music" | "videos";
  createdBy: string;
  createdAt: string;
  fixed?: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  originalParentId?: string | null;
}

interface AuditLog {
  id: string;
  timestamp: string;
  username: string;
  action: "login" | "upload" | "delete" | "move" | "rename" | "create_folder" | "restore" | "create_user" | "delete_user";
  details: string;
}

interface Database {
  users: User[];
  folders: FolderMetadata[];
  files: FileMetadata[];
  logs: AuditLog[];
}

// Initial Database Seeding Helper
const getInitialDb = (): Database => {
  const rootFolders: FolderMetadata[] = [
    {
      id: "presentations",
      name: "Presentaciones de PowerPoint",
      parentId: null,
      category: "presentations",
      createdBy: "Sistema",
      createdAt: new Date().toISOString(),
      fixed: true,
      isDeleted: false,
    },
    {
      id: "images",
      name: "Imágenes",
      parentId: null,
      category: "images",
      createdBy: "Sistema",
      createdAt: new Date().toISOString(),
      fixed: true,
      isDeleted: false,
    },
    {
      id: "preach",
      name: "Material de prédicas",
      parentId: null,
      category: "preach",
      createdBy: "Sistema",
      createdAt: new Date().toISOString(),
      fixed: true,
      isDeleted: false,
    },
    {
      id: "music",
      name: "Música y audio",
      parentId: null,
      category: "music",
      createdBy: "Sistema",
      createdAt: new Date().toISOString(),
      fixed: true,
      isDeleted: false,
    },
    {
      id: "videos",
      name: "Videos",
      parentId: null,
      category: "videos",
      createdBy: "Sistema",
      createdAt: new Date().toISOString(),
      fixed: true,
      isDeleted: false,
    },
  ];

  // Pre-generate A-Z inside PowerPoint Presentations
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  letters.forEach((letter) => {
    rootFolders.push({
      id: `letter_${letter}`,
      name: letter,
      parentId: "presentations",
      category: "presentations",
      createdBy: "Sistema",
      createdAt: new Date().toISOString(),
      fixed: true,
      isDeleted: false,
    });
  });

  return {
    users: [
      {
        id: "admin_user",
        username: "Frida29",
        pin: "Leviatan",
        role: "admin",
        createdAt: new Date().toISOString(),
      },
      {
        id: "admin_user_alt",
        username: "Fida29",
        pin: "Leviatan",
        role: "admin",
        createdAt: new Date().toISOString(),
      },
    ],
    folders: rootFolders,
    files: [],
    logs: [
      {
        id: "log_init",
        timestamp: new Date().toISOString(),
        username: "Sistema",
        action: "login",
        details: "Sistema inicializado correctamente con estructura de carpetas fijas.",
      },
    ],
  };
};

// Database Read/Write Functions
const readDb = (): Database => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = getInitialDb();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const content = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading database file, returning default initial state", err);
    return getInitialDb();
  }
};

const writeDb = (data: Database): void => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing database file", err);
  }
};

// Safe helper to convert double-encoded ISO-8859-1 (latin1) filenames back to valid UTF-8
const parseFilenameSafely = (filename: string): string => {
  try {
    const decoded = Buffer.from(filename, "latin1").toString("utf8");
    // If different and has no replacement character (indicating it was successfully decoded), return it
    if (decoded !== filename && !decoded.includes("\uFFFD")) {
      return decoded;
    }
  } catch (e) {
    // Fail-safe
  }
  return filename;
};

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage });

// Real-time synchronization active client connections (Server-Sent Events)
let sseClients: express.Response[] = [];

const broadcastSyncEvent = (payload: { type: string; message: string; timestamp: string }) => {
  const dataString = JSON.stringify(payload);
  sseClients.forEach((client) => {
    client.write(`data: ${dataString}\n\n`);
  });
};

async function startServer() {
  // Cleanup old chunks on boot
  try {
    if (fs.existsSync(CHUNKS_DIR)) {
      const items = fs.readdirSync(CHUNKS_DIR);
      for (const item of items) {
        const itemPath = path.join(CHUNKS_DIR, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(itemPath);
        }
      }
      console.log("Temporales de subidas anteriores limpiados correctamente.");
    }
  } catch (err) {
    console.error("Error al limpiar temporales de subida:", err);
  }

  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- API ROUTES ---

  // SSE Stream for Real-Time Sync
  app.get("/api/sync/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial ping
    res.write(`data: ${JSON.stringify({ type: "connected", message: "Sincronización en tiempo real establecida" })}\n\n`);

    sseClients.push(res);

    req.on("close", () => {
      sseClients = sseClients.filter((client) => client !== res);
    });
  });

  // Auth: Login
  app.post("/api/auth/login", (req, res) => {
    const { username, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: "Nombre de usuario y contraseña/PIN son obligatorios." });
    }

    const db = readDb();
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.pin === pin
    );

    if (!user) {
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    // Log the successful login
    const newLog: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      username: user.username,
      action: "login",
      details: `Usuario ${user.username} ha iniciado sesión.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "log_update",
      message: `${user.username} inició sesión`,
      timestamp: newLog.timestamp,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  });

  // Auth: Create User
  app.post("/api/auth/users", (req, res) => {
    const { adminUsername, newUsername, pin, role } = req.body;

    if (!adminUsername || !newUsername || !pin) {
      return res.status(400).json({ error: "Faltan campos obligatorios." });
    }

    const db = readDb();
    const adminUser = db.users.find((u) => u.username.toLowerCase() === adminUsername.toLowerCase() && u.role === "admin");
    if (!adminUser) {
      return res.status(403).json({ error: "Solo el administrador 'Frida29' puede crear usuarios." });
    }

    const exists = db.users.some((u) => u.username.toLowerCase() === newUsername.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "El nombre de usuario ya existe." });
    }

    const newUser: User = {
      id: `user_${Date.now()}`,
      username: newUsername,
      pin,
      role: role || "user",
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: adminUsername,
      action: "create_user",
      details: `Se creó la cuenta para el usuario: ${newUsername} (${role || "user"}).`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_users",
      message: `Usuario ${newUsername} creado`,
      timestamp: newLog.timestamp,
    });

    res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role } });
  });

  // Auth: List Users (Admin only)
  app.get("/api/auth/users", (req, res) => {
    const requester = req.query.username as string;
    if (!requester) {
      return res.status(400).json({ error: "Debe especificar el usuario solicitante." });
    }

    const db = readDb();
    const adminUser = db.users.find((u) => u.username.toLowerCase() === requester.toLowerCase() && u.role === "admin");
    if (!adminUser) {
      return res.status(403).json({ error: "No autorizado." });
    }

    // Return users without exposing PIN directly or filter them
    const safeUsers = db.users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
    }));

    res.json(safeUsers);
  });

  // Auth: Delete User
  app.delete("/api/auth/users/:id", (req, res) => {
    const requester = req.query.username as string;
    const targetUserId = req.params.id;

    if (!requester) {
      return res.status(400).json({ error: "Debe especificar el usuario solicitante." });
    }

    const db = readDb();
    const adminUser = db.users.find((u) => u.username.toLowerCase() === requester.toLowerCase() && u.role === "admin");
    if (!adminUser) {
      return res.status(403).json({ error: "No autorizado." });
    }

    const userToDelete = db.users.find((u) => u.id === targetUserId);
    if (!userToDelete) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    if (userToDelete.username === "Frida29" || userToDelete.username === "Fida29") {
      return res.status(400).json({ error: "No se puede eliminar al administrador principal." });
    }

    db.users = db.users.filter((u) => u.id !== targetUserId);

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: requester,
      action: "delete_user",
      details: `Se eliminó el usuario: ${userToDelete.username}.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_users",
      message: `Usuario ${userToDelete.username} eliminado`,
      timestamp: newLog.timestamp,
    });

    res.json({ success: true });
  });

  // Get full contents (Folders, Files, Logs)
  app.get("/api/drive/contents", (req, res) => {
    const db = readDb();
    res.json({
      folders: db.folders,
      files: db.files,
    });
  });

  // Create subfolder
  app.post("/api/drive/folders", (req, res) => {
    const { name, parentId, category, username } = req.body;

    if (!name || !category || !username) {
      return res.status(400).json({ error: "Nombre, categoría y usuario son requeridos." });
    }

    // Check if parent folder is "Presentaciones de PowerPoint" (PowerPoint root or A-Z letters)
    // No new custom subfolders allowed inside presentations
    if (parentId === "presentations" || (parentId && parentId.startsWith("letter_")) || category === "presentations") {
      return res.status(400).json({ error: "No se permite crear carpetas personalizadas en Presentaciones de PowerPoint. Utilice la estructura predefinida A-Z." });
    }

    const db = readDb();

    // Check duplicates in the same parent folder
    const duplicate = db.folders.some(
      (f) =>
        f.parentId === parentId &&
        f.name.toLowerCase() === name.trim().toLowerCase() &&
        !f.isDeleted
    );

    if (duplicate) {
      return res.status(400).json({ error: "Ya existe una carpeta con este nombre en este directorio." });
    }

    const newFolder: FolderMetadata = {
      id: `folder_${Date.now()}`,
      name: name.trim(),
      parentId: parentId || null,
      category,
      createdBy: username,
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };

    db.folders.push(newFolder);

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "create_folder",
      details: `Se creó la carpeta: "${newFolder.name}" en la categoría de ${category}.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Carpeta creada: ${newFolder.name}`,
      timestamp: newLog.timestamp,
    });

    res.json(newFolder);
  });

  // Rename folder
  app.post("/api/drive/folders/rename", (req, res) => {
    const { folderId, newName, username } = req.body;

    if (!folderId || !newName || !username) {
      return res.status(400).json({ error: "ID de carpeta, nuevo nombre y usuario son requeridos." });
    }

    const db = readDb();
    const folder = db.folders.find((f) => f.id === folderId);

    if (!folder) {
      return res.status(404).json({ error: "Carpeta no encontrada." });
    }

    if (folder.fixed) {
      return res.status(400).json({ error: "No se puede renombrar esta carpeta fija del sistema." });
    }

    const oldName = folder.name;
    folder.name = newName.trim();

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "rename",
      details: `Se renombró la carpeta "${oldName}" a "${folder.name}".`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Carpeta renombrada: ${folder.name}`,
      timestamp: newLog.timestamp,
    });

    res.json(folder);
  });

  // Move Folder or File
  app.post("/api/drive/move", (req, res) => {
    const { itemType, itemId, targetFolderId, username } = req.body;

    if (!itemType || !itemId || !username) {
      return res.status(400).json({ error: "Tipo, ID de elemento y usuario son requeridos." });
    }

    const db = readDb();
    let itemName = "";

    if (itemType === "folder") {
      const folder = db.folders.find((f) => f.id === itemId);
      if (!folder) return res.status(404).json({ error: "Carpeta no encontrada." });
      if (folder.fixed) return res.status(400).json({ error: "No se pueden mover las carpetas fijas del sistema." });

      // If moving inside "presentations" or letters, block it
      if (targetFolderId === "presentations" || (targetFolderId && targetFolderId.startsWith("letter_"))) {
        return res.status(400).json({ error: "No se pueden mover carpetas personalizadas a la sección de Presentaciones." });
      }

      // Check if moving folder inside itself or its children
      if (targetFolderId === itemId) {
        return res.status(400).json({ error: "No se puede mover una carpeta dentro de sí misma." });
      }

      let currentParent = targetFolderId;
      while (currentParent) {
        if (currentParent === itemId) {
          return res.status(400).json({ error: "No se puede mover una carpeta dentro de una de sus subcarpetas." });
        }
        const parent = db.folders.find((f) => f.id === currentParent);
        currentParent = parent ? parent.parentId : null;
      }

      itemName = folder.name;
      folder.parentId = targetFolderId || null;
    } else {
      const file = db.files.find((f) => f.id === itemId);
      if (!file) return res.status(404).json({ error: "Archivo no encontrado." });

      // PowerPoint presentations must only go inside A-Z subfolders (not presentations root, and only if target is letter_*)
      if (targetFolderId === "presentations") {
        return res.status(400).json({ error: "Por favor, mueva el archivo dentro de una de las carpetas de letras de la A a la Z." });
      }

      itemName = file.name;
      file.parentFolderId = targetFolderId;
    }

    // Find destination folder name for log
    let targetName = "Raíz";
    if (targetFolderId) {
      const targetFolder = db.folders.find((f) => f.id === targetFolderId);
      if (targetFolder) {
        targetName = targetFolder.name;
      }
    }

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "move",
      details: `Se movió el ${itemType === "folder" ? "directorio" : "archivo"} "${itemName}" a la carpeta "${targetName}".`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Elemento movido: ${itemName}`,
      timestamp: newLog.timestamp,
    });

    res.json({ success: true });
  });

  // Soft delete folder (sends to Trash)
  app.post("/api/drive/folders/delete", (req, res) => {
    const { folderId, username } = req.body;

    if (!folderId || !username) {
      return res.status(400).json({ error: "ID de carpeta y usuario son requeridos." });
    }

    const db = readDb();
    const folder = db.folders.find((f) => f.id === folderId);

    if (!folder) {
      return res.status(404).json({ error: "Carpeta no encontrada." });
    }

    if (folder.fixed) {
      return res.status(400).json({ error: "No se puede eliminar una carpeta fija del sistema." });
    }

    folder.isDeleted = true;
    folder.deletedAt = new Date().toISOString();
    folder.deletedBy = username;
    folder.originalParentId = folder.parentId;
    folder.parentId = "trash"; // Special parent for trash

    // Soft delete all files and folders nested in it
    const softDeleteChildren = (parentID: string) => {
      db.files.forEach((file) => {
        if (file.parentFolderId === parentID && !file.isDeleted) {
          file.isDeleted = true;
          file.deletedAt = new Date().toISOString();
          file.deletedBy = username;
          file.originalParentFolderId = file.parentFolderId;
        }
      });

      db.folders.forEach((child) => {
        if (child.parentId === parentID && !child.isDeleted) {
          child.isDeleted = true;
          child.deletedAt = new Date().toISOString();
          child.deletedBy = username;
          child.originalParentId = child.parentId;
          softDeleteChildren(child.id);
        }
      });
    };

    softDeleteChildren(folderId);

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "delete",
      details: `Se envió la carpeta "${folder.name}" a la Papelera.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Carpeta enviada a Papelera: ${folder.name}`,
      timestamp: newLog.timestamp,
    });

    res.json({ success: true });
  });

  // Upload File
  app.post("/api/drive/upload", upload.single("file"), (req, res) => {
    const { parentFolderId, category, username } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ningún archivo." });
    }

    if (!parentFolderId || !category || !username) {
      // Cleanup uploaded file if metadata is missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Se requiere carpeta de destino, categoría y nombre de usuario." });
    }

    const db = readDb();

    // Auto-resolve name conflicts: if a file with the same name already exists in the same folder and is not deleted,
    // we append a suffix (e.g. "Name (1).jpg") so we don't fail, keeping the upload experience seamless.
    // Fix encoding safely: convert the filename from ISO-8859-1 (latin1) back to UTF-8 if double-encoded
    const originalName = parseFilenameSafely(req.file.originalname);
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    let finalName = originalName;
    let counter = 1;

    while (
      db.files.some(
        (f) =>
          f.parentFolderId === parentFolderId &&
          f.name.toLowerCase() === finalName.toLowerCase() &&
          !f.isDeleted
      )
    ) {
      finalName = `${baseName} (${counter})${ext}`;
      counter++;
    }

    const uniqueIdSuffix = Math.random().toString(36).substring(2, 11);
    const newFile: FileMetadata = {
      id: `file_${Date.now()}_${uniqueIdSuffix}`,
      name: finalName,
      originalName: originalName,
      mimeType: req.file.mimetype || "application/octet-stream",
      size: req.file.size,
      filePath: req.file.filename, // Store unique local filename
      parentFolderId,
      createdBy: username,
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };

    db.files.push(newFile);

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "upload",
      details: `Se subió el archivo "${newFile.name}" a la carpeta de destino.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Archivo subido: ${newFile.name}`,
      timestamp: newLog.timestamp,
    });

    res.json(newFile);
  });

  // Upload File Chunk (for large files to avoid HTTP 413)
  app.post("/api/drive/upload-chunk", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ningún fragmento." });
    }

    const {
      chunkIndex,
      totalChunks,
      uploadId,
      originalName: clientOriginalName,
      parentFolderId,
      category,
      username,
    } = req.body;

    if (!uploadId || chunkIndex === undefined || totalChunks === undefined || !parentFolderId || !category || !username) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: "Faltan parámetros obligatorios para la subida fragmentada." });
    }

    const parsedChunkIndex = parseInt(chunkIndex, 10);
    const parsedTotalChunks = parseInt(totalChunks, 10);

    // Create a temporary folder for this specific uploadId session
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Move the uploaded temp file to the session directory as the chunkIndex name
    const chunkPath = path.join(sessionDir, parsedChunkIndex.toString());
    try {
      fs.renameSync(req.file.path, chunkPath);
    } catch (err) {
      // Fallback to copy and unlink if rename fails (e.g. cross-device link)
      fs.copyFileSync(req.file.path, chunkPath);
      fs.unlinkSync(req.file.path);
    }

    // Check if we have received all chunks
    const filesInSession = fs.readdirSync(sessionDir);
    if (filesInSession.length === parsedTotalChunks) {
      // We have all chunks! Let's merge them.
      const db = readDb();

      // Resolve filename encoding and naming conflicts safely
      const originalName = clientOriginalName ? clientOriginalName : parseFilenameSafely(req.file.originalname);
      const ext = path.extname(originalName);
      const baseName = path.basename(originalName, ext);
      let finalName = originalName;
      let counter = 1;

      while (
        db.files.some(
          (f) =>
            f.parentFolderId === parentFolderId &&
            f.name.toLowerCase() === finalName.toLowerCase() &&
            !f.isDeleted
        )
      ) {
        finalName = `${baseName} (${counter})${ext}`;
        counter++;
      }

      // Final unique filename on disk
      const finalDiskFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const finalDiskPath = path.join(UPLOADS_DIR, finalDiskFilename);

      try {
        // Delete final file if it somehow exists
        if (fs.existsSync(finalDiskPath)) {
          fs.unlinkSync(finalDiskPath);
        }

        // Append chunks sequentially
        for (let i = 0; i < parsedTotalChunks; i++) {
          const currentChunkPath = path.join(sessionDir, i.toString());
          if (!fs.existsSync(currentChunkPath)) {
            throw new Error(`Falta el fragmento número ${i}. No se puede reconstruir el archivo.`);
          }
          const chunkBuffer = fs.readFileSync(currentChunkPath);
          fs.appendFileSync(finalDiskPath, chunkBuffer);
        }

        // Calculate final file size
        const stats = fs.statSync(finalDiskPath);

        // Clean up chunk files and session directory
        for (let i = 0; i < parsedTotalChunks; i++) {
          const currentChunkPath = path.join(sessionDir, i.toString());
          if (fs.existsSync(currentChunkPath)) {
            fs.unlinkSync(currentChunkPath);
          }
        }
        fs.rmdirSync(sessionDir);

        // Store metadata in DB
        const uniqueIdSuffix = Math.random().toString(36).substring(2, 11);
        const newFile: FileMetadata = {
          id: `file_${Date.now()}_${uniqueIdSuffix}`,
          name: finalName,
          originalName: originalName,
          mimeType: req.file!.mimetype || "application/octet-stream",
          size: stats.size,
          filePath: finalDiskFilename,
          parentFolderId,
          createdBy: username,
          createdAt: new Date().toISOString(),
          isDeleted: false,
        };

        db.files.push(newFile);

        const newLog: AuditLog = {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString(),
          username,
          action: "upload",
          details: `Se subió el archivo "${newFile.name}" mediante subida fragmentada.`,
        };
        db.logs.unshift(newLog);
        writeDb(db);

        broadcastSyncEvent({
          type: "sync_drive",
          message: `Archivo subido y fragmentos ensamblados: ${newFile.name}`,
          timestamp: newLog.timestamp,
        });

        return res.json(newFile);

      } catch (mergeError: any) {
        console.error("Error merging chunks:", mergeError);
        if (fs.existsSync(finalDiskPath)) {
          fs.unlinkSync(finalDiskPath);
        }
        return res.status(500).json({ error: `Error al unir los fragmentos: ${mergeError.message}` });
      }
    } else {
      // Not all chunks received yet, send success for this chunk
      return res.json({ success: true, status: "chunk_received", chunkIndex: parsedChunkIndex });
    }
  });

  // Serve file directly (to stream audio/video or show images)
  app.get("/api/drive/files/view/:id", (req, res) => {
    const db = readDb();
    const file = db.files.find((f) => f.id === req.params.id);

    if (!file) {
      return res.status(404).send("Archivo no encontrado");
    }

    const localPath = path.join(UPLOADS_DIR, file.filePath);
    if (!fs.existsSync(localPath)) {
      return res.status(404).send("El archivo físico no existe en el disco.");
    }

    res.setHeader("Content-Type", file.mimeType);
    // Format headers correctly according to RFC 5987 with UTF-8 filename support
    const safeFilenameView = file.name.replace(/["\\]/g, "");
    const asciiFallbackView = safeFilenameView.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
    res.setHeader("Content-Disposition", `inline; filename="${asciiFallbackView}"; filename*=UTF-8''${encodeURIComponent(safeFilenameView)}`);
    fs.createReadStream(localPath).pipe(res);
  });

  // Download file in its original format
  app.get("/api/drive/files/download/:id", (req, res) => {
    const db = readDb();
    const file = db.files.find((f) => f.id === req.params.id);

    if (!file) {
      return res.status(404).send("Archivo no encontrado");
    }

    const localPath = path.join(UPLOADS_DIR, file.filePath);
    if (!fs.existsSync(localPath)) {
      return res.status(404).send("El archivo físico no existe en el disco.");
    }

    res.setHeader("Content-Type", "application/octet-stream");
    // Format headers correctly according to RFC 5987 with UTF-8 filename support
    const safeFilenameDownload = file.name.replace(/["\\]/g, "");
    const asciiFallbackDownload = safeFilenameDownload.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFallbackDownload}"; filename*=UTF-8''${encodeURIComponent(safeFilenameDownload)}`);
    fs.createReadStream(localPath).pipe(res);
  });

  // Rename File
  app.post("/api/drive/files/rename", (req, res) => {
    const { fileId, newName, username } = req.body;

    if (!fileId || !newName || !username) {
      return res.status(400).json({ error: "ID de archivo, nuevo nombre y usuario son requeridos." });
    }

    const db = readDb();
    const file = db.files.find((f) => f.id === fileId);

    if (!file) {
      return res.status(404).json({ error: "Archivo no encontrado." });
    }

    const oldName = file.name;
    const ext = path.extname(oldName);
    let finalName = newName.trim();
    if (!finalName.endsWith(ext) && ext) {
      finalName = finalName + ext;
    }

    file.name = finalName;

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "rename",
      details: `Se renombró el archivo "${oldName}" a "${file.name}".`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Archivo renombrado: ${file.name}`,
      timestamp: newLog.timestamp,
    });

    res.json(file);
  });

  // Soft delete file (to Trash)
  app.post("/api/drive/files/delete", (req, res) => {
    const { fileId, username } = req.body;

    if (!fileId || !username) {
      return res.status(400).json({ error: "ID de archivo y usuario son requeridos." });
    }

    const db = readDb();
    const file = db.files.find((f) => f.id === fileId);

    if (!file) {
      return res.status(404).json({ error: "Archivo no encontrado." });
    }

    file.isDeleted = true;
    file.deletedAt = new Date().toISOString();
    file.deletedBy = username;
    file.originalParentFolderId = file.parentFolderId;

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "delete",
      details: `Se envió el archivo "${file.name}" a la Papelera.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Archivo enviado a Papelera: ${file.name}`,
      timestamp: newLog.timestamp,
    });

    res.json({ success: true });
  });

  // Restore elements from Trash
  app.post("/api/drive/restore", (req, res) => {
    const { itemType, itemId, username } = req.body;

    if (!itemType || !itemId || !username) {
      return res.status(400).json({ error: "Tipo, ID y usuario son requeridos." });
    }

    const db = readDb();
    let itemName = "";

    if (itemType === "folder") {
      const folder = db.folders.find((f) => f.id === itemId);
      if (!folder) return res.status(404).json({ error: "Carpeta no encontrada." });

      folder.isDeleted = false;
      folder.parentId = folder.originalParentId || null;
      folder.deletedAt = undefined;
      folder.deletedBy = undefined;
      itemName = folder.name;

      // Recursive restore nested contents that were soft deleted
      const restoreNested = (parentID: string) => {
        db.folders.forEach((child) => {
          if (child.parentId === parentID && child.isDeleted) {
            child.isDeleted = false;
            child.deletedAt = undefined;
            child.deletedBy = undefined;
            restoreNested(child.id);
          }
        });
        db.files.forEach((file) => {
          if (file.parentFolderId === parentID && file.isDeleted) {
            file.isDeleted = false;
            file.deletedAt = undefined;
            file.deletedBy = undefined;
          }
        });
      };
      restoreNested(itemId);
    } else {
      const file = db.files.find((f) => f.id === itemId);
      if (!file) return res.status(404).json({ error: "Archivo no encontrado." });

      file.isDeleted = false;
      file.parentFolderId = file.originalParentFolderId || "presentations";
      file.deletedAt = undefined;
      file.deletedBy = undefined;
      itemName = file.name;
    }

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "restore",
      details: `Se restauró el elemento "${itemName}" desde la Papelera.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Elemento restaurado: ${itemName}`,
      timestamp: newLog.timestamp,
    });

    res.json({ success: true });
  });

  // Permanent Delete File or Folder from Trash
  app.post("/api/drive/permanent-delete", (req, res) => {
    const { itemType, itemId, username } = req.body;

    if (!itemType || !itemId || !username) {
      return res.status(400).json({ error: "Tipo, ID y usuario son requeridos." });
    }

    const db = readDb();
    let itemName = "";

    if (itemType === "folder") {
      const folder = db.folders.find((f) => f.id === itemId);
      if (!folder) return res.status(404).json({ error: "Carpeta no encontrada." });

      itemName = folder.name;

      // Remove physical files recursively
      const deletePhysicalRecursively = (parentID: string) => {
        // Remove nested files from disk and database
        const filesInFolder = db.files.filter((f) => f.parentFolderId === parentID);
        filesInFolder.forEach((file) => {
          const filePathOnDisk = path.join(UPLOADS_DIR, file.filePath);
          if (fs.existsSync(filePathOnDisk)) {
            try {
              fs.unlinkSync(filePathOnDisk);
            } catch (err) {
              console.error("Error deleting physical file:", filePathOnDisk, err);
            }
          }
        });

        db.files = db.files.filter((f) => f.parentFolderId !== parentID);

        // Find subfolders
        const subfolders = db.folders.filter((f) => f.parentId === parentID);
        subfolders.forEach((sub) => {
          deletePhysicalRecursively(sub.id);
        });

        db.folders = db.folders.filter((f) => f.parentId !== parentID);
      };

      deletePhysicalRecursively(itemId);
      db.folders = db.folders.filter((f) => f.id !== itemId);
    } else {
      const file = db.files.find((f) => f.id === itemId);
      if (!file) return res.status(404).json({ error: "Archivo no encontrado." });

      itemName = file.name;
      const filePathOnDisk = path.join(UPLOADS_DIR, file.filePath);
      if (fs.existsSync(filePathOnDisk)) {
        try {
          fs.unlinkSync(filePathOnDisk);
        } catch (err) {
          console.error("Error deleting physical file:", filePathOnDisk, err);
        }
      }

      db.files = db.files.filter((f) => f.id !== itemId);
    }

    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username,
      action: "delete",
      details: `Se eliminó PERMANENTEMENTE "${itemName}" de la Papelera.`,
    };
    db.logs.unshift(newLog);
    writeDb(db);

    broadcastSyncEvent({
      type: "sync_drive",
      message: `Eliminado permanente: ${itemName}`,
      timestamp: newLog.timestamp,
    });

    res.json({ success: true });
  });

  // Get audit logs
  app.get("/api/drive/logs", (req, res) => {
    const requester = req.query.username as string;
    if (!requester) {
      return res.status(400).json({ error: "Debe especificar el usuario solicitante." });
    }

    const db = readDb();
    const adminUser = db.users.find((u) => u.username.toLowerCase() === requester.toLowerCase() && u.role === "admin");
    if (!adminUser) {
      return res.status(403).json({ error: "Solo el administrador 'Frida29' puede ver el registro de auditoría." });
    }

    res.json(db.logs);
  });

  // --- VITE MIDDLEWARE SETUP ---

  // Robust determination of whether to run in production mode (serving pre-built dist assets)
  // or development mode (using Vite dev server middleware).
  // We run in production if:
  // 1. NODE_ENV is explicitly set to "production"
  // 2. We are running the compiled/bundled CJS file (e.g., node dist/server.cjs)
  // 3. Or server.ts is missing but the dist directory with index.html is present
  const isProd =
    process.env.NODE_ENV === "production" ||
    (process.argv[1] && (process.argv[1].endsWith("server.cjs") || process.argv[1].includes("dist"))) ||
    (!fs.existsSync(path.join(process.cwd(), "server.ts")) && fs.existsSync(path.join(process.cwd(), "dist", "index.html")));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // catch-all fallback to serve transformed index.html in dev mode
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
