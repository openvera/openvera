import type { Document } from '../types'

import { api } from './client'

export const getDocuments = (params?: {
  company_id?: number;
  doc_type?: string;
  unmatched_only?: boolean;
}) => {
  const search = new URLSearchParams()
  if (params?.company_id) search.set('company_id', String(params.company_id))
  if (params?.doc_type) search.set('doc_type', params.doc_type)
  if (params?.unmatched_only) search.set('unmatched_only', '1')
  const qs = search.toString()
  return api<Document[]>(`/api/documents${qs ? `?${qs}` : ''}`)
}

export const getDocumentDetails = (id: number) =>
  api<Record<string, unknown>>(`/api/document_details?id=${id}`)

export const updateDocument = (
  id: number,
  data: Record<string, unknown>,
) =>
  api<{ success: boolean; updated: number }>(
    `/api/document/${id}/update`,
    { method: 'POST', body: JSON.stringify(data) },
  )

export const reviewDocument = (id: number, unreview = false) =>
  api<{ success: boolean; reviewed: boolean }>(
    `/api/document/${id}/review`,
    { method: 'POST', body: JSON.stringify({ unreview }) },
  )

export const archiveDocument = (id: number, docType = 'archive') =>
  api<{ ok: boolean }>(`/api/document/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify({ doc_type: docType }),
  })

export const deleteDocument = (id: number) =>
  api<{ ok: boolean }>(`/api/document/${id}`, { method: 'DELETE' })

export const batchUpdateDocuments = (data: {
  ids: number[];
  doc_type?: string | null;
  party_id?: number | null;
  reviewed?: boolean;
  archived?: boolean;
}) =>
  api<{ ok: boolean; updated: number }>('/api/documents/batch-update', {
    method: 'PUT',
    body: JSON.stringify(data),
  })

// --- Inbox & File Tree ---

export interface ScanResult {
  scanned: number;
  new: number;
  skipped: number;
  duplicate: number;
  unreadable: number;
  errors: string[];
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'dir';
  path: string;
  size?: number;
  in_db?: boolean;
  is_duplicate?: boolean;
  duplicate_of?: string;
  file_count?: number;
  children?: FileTreeNode[];
}

export interface PendingFile {
  id: number;
  filepath: string;
  filename: string;
  created_at: string;
  mime_type: string | null;
  file_size: number | null;
}

export const scanInbox = () =>
  api<ScanResult>('/api/inbox/scan', { method: 'POST' })

export const getPendingFiles = () =>
  api<{ files: PendingFile[]; count: number }>('/api/files/pending')

export const getFileTree = () =>
  api<{ tree: FileTreeNode[] }>('/api/files/tree')

export const deleteFileByPath = (path: string) =>
  api<{ ok: boolean; deleted: string }>('/api/files/delete-by-path', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
