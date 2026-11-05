import { supabase } from './supabase'
import type { Exercise, ExerciseFile, Session } from './types'

/** Copie une session (en brouillon, nouveau code) avec ses exercices et documents. */
export async function duplicateSession(src: Session): Promise<string> {
  const { data: created, error } = await supabase
    .from('sessions')
    .insert({ name: `${src.name} (copie)`, session_date: src.session_date, location: src.location })
    .select('id')
    .single()
  if (error) throw error
  const newId: string = created.id

  const { data: exercises, error: e1 } = await supabase.from('exercises').select('*').eq('session_id', src.id).order('position')
  if (e1) throw e1
  const { data: files, error: e2 } = await supabase.from('exercise_files').select('*').eq('session_id', src.id)
  if (e2) throw e2

  for (const ex of exercises as Exercise[]) {
    const { data: newEx, error: e3 } = await supabase
      .from('exercises')
      .insert({ session_id: newId, position: ex.position, title: ex.title, instructions: ex.instructions })
      .select('id')
      .single()
    if (e3) throw e3
    for (const f of (files as ExerciseFile[]).filter(f => f.exercise_id === ex.id)) {
      const path = `${newId}/${newEx.id}/${f.storage_path.split('/').pop()}`
      const { error: e4 } = await supabase.storage.from('documents').copy(f.storage_path, path)
      if (e4) throw e4
      const { error: e5 } = await supabase.from('exercise_files').insert({
        exercise_id: newEx.id, session_id: newId, file_name: f.file_name, storage_path: path, mime_type: f.mime_type, size_bytes: f.size_bytes,
      })
      if (e5) throw e5
    }
  }
  return newId
}

/** Supprime une session et tous ses fichiers (documents et réponses). */
export async function deleteSession(id: string): Promise<void> {
  const [{ data: docs }, { data: resp }] = await Promise.all([
    supabase.from('exercise_files').select('storage_path').eq('session_id', id),
    supabase.from('response_files').select('storage_path').eq('session_id', id),
  ])
  const docPaths = (docs ?? []).map(d => d.storage_path as string)
  const respPaths = (resp ?? []).map(d => d.storage_path as string)
  if (docPaths.length) await supabase.storage.from('documents').remove(docPaths)
  if (respPaths.length) await supabase.storage.from('responses').remove(respPaths)
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}
