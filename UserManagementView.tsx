export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface FileMetadata {
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

export interface FolderMetadata {
  id: string;
  name: string;
  parentId: string | null;
  category: 'presentations' | 'images' | 'preach' | 'music' | 'videos';
  createdBy: string;
  createdAt: string;
  fixed?: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  originalParentId?: string | null;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  username: string;
  action: 'login' | 'upload' | 'delete' | 'move' | 'rename' | 'create_folder' | 'restore' | 'create_user' | 'delete_user';
  details: string;
}

export interface DriveContents {
  folders: FolderMetadata[];
  files: FileMetadata[];
}
