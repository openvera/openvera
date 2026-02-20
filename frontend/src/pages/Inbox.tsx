import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Inbox as InboxIcon,
  RotateCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  EmptyState,
  type FileTreeNode,
  deleteFileByPath,
  getFileTree,
  getPendingFiles,
  scanInbox,
} from 'openvera'

export default function Inbox() {
  const queryClient = useQueryClient()

  // Pending files (in DB but no document yet — awaiting AI processing)
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-files'],
    queryFn: getPendingFiles,
  })
  const pendingFiles = pendingData?.files ?? []

  // File tree
  const { data: treeData, isLoading: treeLoading } = useQuery({
    queryKey: ['file-tree'],
    queryFn: getFileTree,
  })

  const [showDuplicates, setShowDuplicates] = useState(false)

  const duplicateCount = useMemo(() => {
    function count(nodes: FileTreeNode[]): number {
      return nodes.reduce((sum, n) => {
        if (n.type === 'dir') return sum + count(n.children ?? [])
        return sum + (n.is_duplicate ? 1 : 0)
      }, 0)
    }
    return count(treeData?.tree ?? [])
  }, [treeData])

  const scanMutation = useMutation({
    mutationFn: scanInbox,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-files'] })
      queryClient.invalidateQueries({ queryKey: ['file-tree'] })
    },
  })

  const handleDeleteFile = async (path: string) => {
    await deleteFileByPath(path)
    queryClient.invalidateQueries({ queryKey: ['file-tree'] })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Inkorg</h1>
        <button
          className="btn btn-primary btn-sm"
          disabled={scanMutation.isPending}
          onClick={() => scanMutation.mutate()}
        >
          <RotateCw
            className={`w-4 h-4 ${scanMutation.isPending ? 'animate-spin' : ''}`}
          />
          Skanna inkorg
        </button>
      </div>

      {scanMutation.isSuccess && (() => {
        const d = scanMutation.data
        const parts: string[] = []
        if (d.new > 0) parts.push(`${d.new} nya`)
        if (d.duplicate > 0) parts.push(`${d.duplicate} dubletter`)
        if (d.unreadable > 0) parts.push(`${d.unreadable} oläsbara (ej nedladdade från iCloud?)`)
        if (d.skipped > 0) parts.push(`${d.skipped} redan kända`)
        const summary = parts.length > 0 ? parts.join(', ') : 'inga filer hittades'
        const semantic = d.new > 0 ? 'success' : d.unreadable > 0 ? 'warning' : 'info';
        return (
          <div className={`alert alert-sm alert-${semantic}`}>
            <span className="flex-1">{d.scanned} skannade — {summary}</span>
            <button className={`btn btn-${semantic} btn-sm ml-auto px-2`} onClick={() => scanMutation.reset()}>
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )
      })()}

      {/* Pending files — registered but no document yet */}
      <section>
        <h2 className="text-sm font-semibold text-base-content/50 uppercase tracking-wide mb-3">
          Väntar på bearbetning ({pendingFiles.length})
        </h2>

        {pendingLoading
          ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner" />
              </div>
            )
          : pendingFiles.length === 0
            ? (
                <div className="bg-base-100 rounded-xl shadow-sm p-8 text-center text-base-content/50">
                  <InboxIcon className="w-8 h-8 mb-2 opacity-30" />
                  <p>Inga filer väntar på bearbetning</p>
                </div>
              )
            : (
                <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th className="tabular-nums text-base-content/40 w-12">ID</th>
                          <th>Sökväg</th>
                          <th>Typ</th>
                          <th className="text-right">Storlek</th>
                          <th>Registrerad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingFiles.map((f) => (
                          <tr key={f.id}>
                            <td className="tabular-nums text-base-content/40">{f.id}</td>
                            <td>
                              <a
                                href={`/api/files/${f.id}/view`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link link-hover link-primary text-xs font-mono"
                              >
                                {f.filepath}
                              </a>
                            </td>
                            <td className="text-xs">
                              {f.mime_type?.split('/').pop() ?? '—'}
                            </td>
                            <td className="text-right tabular-nums">
                              {f.file_size != null ? formatSize(f.file_size) : '—'}
                            </td>
                            <td className="tabular-nums">
                              {f.created_at?.split('T')[0] ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
      </section>

      {/* File browser */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-base-content/50 uppercase tracking-wide">
            Filträd
          </h2>
          {duplicateCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-base-content/50 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={showDuplicates}
                onChange={(e) => setShowDuplicates(e.target.checked)}
              />
              Visa {duplicateCount} dubletter
            </label>
          )}
        </div>

        {treeLoading
          ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner" />
              </div>
            )
          : treeData?.tree
            ? (
                <div className="bg-base-100 rounded-xl shadow-sm p-4">
                  <ul className="text-sm font-mono">
                    {treeData.tree.map((node) => (
                      <TreeNode key={node.path} node={node} depth={0} showDuplicates={showDuplicates} onDelete={handleDeleteFile} />
                    ))}
                  </ul>
                </div>
              )
            : (
                <EmptyState title="Inget filträd" description="Kunde inte läsa filsystemet" />
              )}
      </section>
    </div>
  )
}

function TreeNode({ node, depth, showDuplicates, onDelete }: { node: FileTreeNode; depth: number; showDuplicates: boolean; onDelete: (path: string) => void }) {
  const [open, setOpen] = useState(depth < 1)

  if (node.type === 'dir') {
    return (
      <li>
        <button
          className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-base-200 w-full text-left"
          onClick={() => setOpen(!open)}
        >
          {open
            ? <ChevronDown className="w-3 h-3 text-base-content/30" />
            : <ChevronRight className="w-3 h-3 text-base-content/30" />}
          {open
            ? <FolderOpen className="w-4 h-4 text-warning/70" />
            : <Folder className="w-4 h-4 text-warning/70" />}
          <span className="font-medium">{node.name}</span>
          <span className="text-base-content/30 text-xs">
            ({node.file_count})
          </span>
        </button>
        {open && node.children && (
          <ul className="ml-5 border-l border-base-300">
            {node.children
              .filter((child) => showDuplicates || !child.is_duplicate)
              .map((child) => (
                <TreeNode key={child.path} node={child} depth={depth + 1} showDuplicates={showDuplicates} onDelete={onDelete} />
              ))}
          </ul>
        )}
      </li>
    )
  }

  if (node.is_duplicate && !showDuplicates) return null

  return (
    <li className="group flex items-center gap-1.5 py-0.5 px-1 ml-[18px]">
      <File className={`w-3 h-3 ${node.is_duplicate ? 'text-warning/50' : 'text-base-content/30'}`} />
      <a
        href={`/api/files/view-by-path?path=${encodeURIComponent(node.path)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
      >
        {node.name}
      </a>
      {node.size != null && (
        <span className="text-base-content/30 text-xs">
          {formatSize(node.size)}
        </span>
      )}
      {node.is_duplicate && (
        <>
          <span className="badge badge-warning badge-xs badge-soft">dublett</span>
          <a
            href={`/api/files/view-by-path?path=${encodeURIComponent(node.duplicate_of!)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base-content/30 text-xs hover:underline"
          >= {node.duplicate_of!.split('/').pop()}</a>
        </>
      )}
      {!node.in_db && !node.is_duplicate && (
        <span className="badge badge-ghost badge-xs text-base-content/40">ej i DB</span>
      )}
      <button
        className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs text-error/50 hover:text-error"
        onClick={() => onDelete(node.path)}
        title="Ta bort fil"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
