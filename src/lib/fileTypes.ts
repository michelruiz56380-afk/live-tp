/** Formats acceptés pour les rendus et les documents de travail. */
export const ACCEPTED_FILES = [
  'image/*', 'video/*', '.pdf',
  '.doc', '.docx', '.odt', '.rtf', '.txt',
  '.xls', '.xlsx', '.ods', '.csv',
  '.ppt', '.pptx', '.odp',
].join(',')

export const ACCEPTED_LABEL = 'image, vidéo, PDF, Word, Excel, PowerPoint'

export type FileKind = 'image' | 'video' | 'pdf' | 'word' | 'excel' | 'text' | 'other'

export function fileKind(name: string, mime: string | null): FileKind {
  const m = mime ?? ''
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'word'
  if (['xlsx', 'xls', 'ods', 'csv'].includes(ext)) return 'excel'
  if (ext === 'txt' || m === 'text/plain') return 'text'
  return 'other'
}
