import { fileKind } from './fileTypes'

const STYLE = `
  body { font-family: Inter, system-ui, sans-serif; color: #16181d; margin: 24px; font-size: 22px; line-height: 1.5; }
  h1, h2, h3 { line-height: 1.2; } img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; font-size: 22px; }
  td, th { border: 1px solid #d5d8dd; padding: 6px 10px; vertical-align: top; white-space: pre-wrap; }
  tr:first-child td { background: #f2f3f5; font-weight: 600; }
  .sheet { color: #6b7280; font-size: 16px; margin: 24px 0 8px; }
`

/**
 * Convertit un Word (.docx), un tableur (.xlsx, .xls, .ods, .csv) ou un .txt
 * en HTML, entièrement dans le navigateur (aucun envoi à un service tiers).
 * Le résultat est destiné à une iframe « sandbox » sans scripts.
 * Renvoie null pour un format non pris en charge.
 */
export async function officeToHtml(url: string, name: string, mime: string | null): Promise<string | null> {
  const kind = fileKind(name, mime)
  if (kind !== 'word' && kind !== 'excel' && kind !== 'text') return null
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fichier inaccessible (${res.status})`)
  const buf = await res.arrayBuffer()

  let body = ''
  if (kind === 'word') {
    const mammoth = await import('mammoth')
    body = (await mammoth.convertToHtml({ arrayBuffer: buf })).value
  } else if (kind === 'excel') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    body = wb.SheetNames.map(n => {
      const table = XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' })
      return (wb.SheetNames.length > 1 ? `<div class="sheet">Feuille : ${escapeHtml(n)}</div>` : '') + table
    }).join('')
  } else {
    body = `<pre style="white-space:pre-wrap;font:inherit">${escapeHtml(new TextDecoder().decode(buf))}</pre>`
  }
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${STYLE}</style></head><body>${body}</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
