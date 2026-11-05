-- ============================================================================
-- LiveTP — schéma complet de la V1
-- À coller UNE FOIS dans Supabase : SQL Editor > New query > Run.
-- Le script peut être relancé sans danger (il ne supprime aucune donnée).
-- ============================================================================

-- ─── Tables ─────────────────────────────────────────────────────────────────

-- Formateurs (rempli par claim_trainer, voir « Comptes formateur »).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  session_date date,
  location text,
  access_code text not null unique,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  -- Position de l'exercice affiché aux participants (0 = aucun).
  current_position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  position int not null,
  title text not null,
  instructions text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists exercises_session_idx on public.exercises (session_id, position);

-- Documents de travail joints à un exercice (fichiers dans le bucket "documents").
create table if not exists public.exercise_files (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (session_id, email)
);
create index if not exists participants_user_idx on public.participants (user_id);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  content text not null default '',
  status text not null default 'started' check (status in ('started', 'submitted')),
  validation text not null default 'pending' check (validation in ('pending', 'ok', 'to_improve')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (exercise_id, participant_id)
);
create index if not exists responses_session_idx on public.responses (session_id);

-- Fichiers rendus par les participants (bucket "responses").
create table if not exists public.response_files (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- ─── Fonctions utilitaires ──────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Participant (de la session donnée) correspondant à l'utilisateur connecté.
create or replace function public.my_participant_id(p_session uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.participants where session_id = p_session and user_id = auth.uid();
$$;

-- ─── Sécurité : RLS ─────────────────────────────────────────────────────────
-- Règle générale : le formateur voit et modifie tout ; un participant ne voit
-- que sa session, les exercices déjà ouverts et SES réponses. Toutes les
-- écritures des participants passent par les fonctions plus bas.

alter table public.admins enable row level security;
alter table public.sessions enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_files enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;
alter table public.response_files enable row level security;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select using (user_id = auth.uid());

drop policy if exists sessions_admin on public.sessions;
create policy sessions_admin on public.sessions for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists sessions_participant on public.sessions;
create policy sessions_participant on public.sessions for select
  using (public.my_participant_id(id) is not null);

drop policy if exists exercises_admin on public.exercises;
create policy exercises_admin on public.exercises for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists exercises_participant on public.exercises;
create policy exercises_participant on public.exercises for select using (
  public.my_participant_id(session_id) is not null
  and exists (
    select 1 from public.sessions s
    where s.id = session_id and s.status <> 'draft' and position <= s.current_position
  )
);

drop policy if exists exercise_files_admin on public.exercise_files;
create policy exercise_files_admin on public.exercise_files for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists exercise_files_participant on public.exercise_files;
create policy exercise_files_participant on public.exercise_files for select using (
  exists (select 1 from public.exercises e where e.id = exercise_id)  -- filtré par la règle des exercices
);

drop policy if exists participants_admin on public.participants;
create policy participants_admin on public.participants for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists participants_self on public.participants;
create policy participants_self on public.participants for select using (user_id = auth.uid());

drop policy if exists responses_admin on public.responses;
create policy responses_admin on public.responses for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists responses_self on public.responses;
create policy responses_self on public.responses for select
  using (participant_id = public.my_participant_id(session_id));

drop policy if exists response_files_admin on public.response_files;
create policy response_files_admin on public.response_files for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists response_files_self on public.response_files;
create policy response_files_self on public.response_files for select
  using (participant_id = public.my_participant_id(session_id));

-- ─── Fonctions appelées par les participants ────────────────────────────────

-- Infos minimales d'une session à partir de son code (avant inscription).
create or replace function public.session_by_code(p_code text)
returns table (id uuid, name text, status text)
language sql stable security definer set search_path = public as $$
  select id, name, status from public.sessions where access_code = upper(trim(p_code));
$$;

-- Inscription (ou reprise avec le même e-mail) dans une session.
create or replace function public.join_session(p_code text, p_first text, p_last text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions;
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into v_session from public.sessions where access_code = upper(trim(p_code));
  if not found then raise exception 'Code de session inconnu'; end if;
  if v_session.status = 'completed' then raise exception 'Cette séance est terminée'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide'; end if;
  if length(trim(p_first)) = 0 or length(trim(p_last)) = 0 then raise exception 'Prénom et nom obligatoires'; end if;

  insert into public.participants (session_id, user_id, first_name, last_name, email)
  values (v_session.id, auth.uid(), trim(p_first), trim(p_last), v_email)
  on conflict (session_id, email) do update
    set user_id = excluded.user_id, first_name = excluded.first_name, last_name = excluded.last_name
  returning id into v_id;
  return v_id;
end;
$$;

-- Reprise (après déconnexion ou sur un autre appareil) avec le seul e-mail.
create or replace function public.resume_session(p_code text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into v_session from public.sessions where access_code = upper(trim(p_code));
  if not found then raise exception 'Code de session inconnu'; end if;
  if v_session.status = 'completed' then raise exception 'Cette séance est terminée'; end if;
  update public.participants set user_id = auth.uid()
   where session_id = v_session.id and email = lower(trim(p_email))
  returning id into v_id;
  if v_id is null then raise exception 'Aucune inscription avec cet e-mail pour cette séance'; end if;
  return v_id;
end;
$$;
revoke execute on function public.resume_session(text, text) from public, anon;
grant execute on function public.resume_session(text, text) to authenticated;

-- Clic sur « C'est clair, je démarre ».
create or replace function public.start_exercise(p_exercise uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ex public.exercises;
  v_part uuid;
begin
  select * into v_ex from public.exercises where id = p_exercise;
  if not found then raise exception 'Exercice introuvable'; end if;
  if not exists (select 1 from public.sessions s where s.id = v_ex.session_id
                 and s.status = 'active' and v_ex.position <= s.current_position) then
    raise exception 'Exercice non ouvert';
  end if;
  v_part := public.my_participant_id(v_ex.session_id);
  if v_part is null then raise exception 'Non inscrit à cette séance'; end if;
  insert into public.responses (exercise_id, participant_id, session_id)
  values (p_exercise, v_part, v_ex.session_id)
  on conflict (exercise_id, participant_id) do nothing;
end;
$$;

-- Enregistrement du texte ; p_submit = true rend la réponse (verrouillage).
create or replace function public.save_response(p_exercise uuid, p_content text, p_submit boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_resp public.responses;
begin
  select r.* into v_resp from public.responses r
  join public.sessions s on s.id = r.session_id
  where r.exercise_id = p_exercise and r.participant_id = public.my_participant_id(r.session_id);
  if not found then raise exception 'Exercice non démarré'; end if;
  if v_resp.status = 'submitted' then raise exception 'Réponse déjà rendue'; end if;
  if (select status from public.sessions where id = v_resp.session_id) <> 'active' then
    raise exception 'La séance n''est pas en cours';
  end if;
  update public.responses
     set content = coalesce(p_content, ''),
         status = case when p_submit then 'submitted' else status end,
         submitted_at = case when p_submit then now() else submitted_at end
   where id = v_resp.id;
end;
$$;

-- Déclare un fichier déjà envoyé dans le stockage.
create or replace function public.add_response_file(p_exercise uuid, p_path text, p_name text, p_mime text, p_size bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_resp public.responses;
begin
  select r.* into v_resp from public.responses r
  where r.exercise_id = p_exercise and r.participant_id = public.my_participant_id(r.session_id);
  if not found then raise exception 'Exercice non démarré'; end if;
  if v_resp.status = 'submitted' then raise exception 'Réponse déjà rendue'; end if;
  if split_part(p_path, '/', 2) <> v_resp.participant_id::text then raise exception 'Chemin invalide'; end if;
  if (select count(*) from public.response_files where response_id = v_resp.id) >= 5 then
    raise exception '5 fichiers au maximum';
  end if;
  insert into public.response_files (response_id, participant_id, session_id, file_name, storage_path, mime_type, size_bytes)
  values (v_resp.id, v_resp.participant_id, v_resp.session_id, p_name, p_path, p_mime, p_size);
end;
$$;

create or replace function public.remove_response_file(p_file uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  delete from public.response_files f
   using public.responses r
   where f.id = p_file and r.id = f.response_id and r.status <> 'submitted'
     and f.participant_id = public.my_participant_id(f.session_id)
  returning f.storage_path into v_path;
  if v_path is null then raise exception 'Suppression impossible'; end if;
  return v_path;
end;
$$;

-- ─── Comptes formateur ──────────────────────────────────────────────────────
-- Adresses autorisées à devenir formateur. Une personne qui crée un compte
-- avec l'une de ces adresses (e-mail confirmé) devient formateur à sa
-- première connexion. La première adresse s'ajoute depuis le SQL Editor :
--   insert into public.trainer_invites (email) values ('votre@email.fr');

create table if not exists public.trainer_invites (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.trainer_invites enable row level security;
drop policy if exists trainer_invites_admin on public.trainer_invites;
create policy trainer_invites_admin on public.trainer_invites for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.claim_trainer()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user auth.users;
begin
  select * into v_user from auth.users where id = auth.uid();
  if not found or coalesce(v_user.is_anonymous, false) or v_user.email_confirmed_at is null then
    return false;
  end if;
  if not exists (select 1 from public.trainer_invites where email = lower(v_user.email)) then
    return false;
  end if;
  insert into public.admins (user_id) values (v_user.id) on conflict do nothing;
  return true;
end;
$$;
revoke execute on function public.claim_trainer() from public, anon;
grant execute on function public.claim_trainer() to authenticated;

-- Code d'accès à 8 caractères, sans caractères ambigus (0/O, 1/I/L).
create or replace function public.new_access_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions where access_code = code);
  end loop;
  return code;
end;
$$;
alter table public.sessions alter column access_code set default public.new_access_code();

-- Les fonctions participant ne sont utilisables que par un utilisateur connecté.
revoke execute on function public.join_session(text, text, text, text) from public, anon;
revoke execute on function public.start_exercise(uuid) from public, anon;
revoke execute on function public.save_response(uuid, text, boolean) from public, anon;
revoke execute on function public.add_response_file(uuid, text, text, text, bigint) from public, anon;
revoke execute on function public.remove_response_file(uuid) from public, anon;
grant execute on function public.join_session(text, text, text, text) to authenticated;
grant execute on function public.start_exercise(uuid) to authenticated;
grant execute on function public.save_response(uuid, text, boolean) to authenticated;
grant execute on function public.add_response_file(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.remove_response_file(uuid) to authenticated;

-- ─── Stockage des fichiers ──────────────────────────────────────────────────
-- documents : <session>/<exercice>/<fichier>   (déposés par le formateur)
-- responses : <session>/<participant>/<exercice>/<fichier>   (rendus)
-- Limite : 50 Mo par fichier (limite de l'offre gratuite Supabase).

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800),
       ('responses', 'responses', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit, public = false;

drop policy if exists livetp_admin_all on storage.objects;
create policy livetp_admin_all on storage.objects for all
  using (bucket_id in ('documents', 'responses') and public.is_admin())
  with check (bucket_id in ('documents', 'responses') and public.is_admin());

drop policy if exists livetp_documents_read on storage.objects;
create policy livetp_documents_read on storage.objects for select using (
  bucket_id = 'documents'
  and exists (select 1 from public.exercise_files f where f.storage_path = name)
);

drop policy if exists livetp_responses_own on storage.objects;
create policy livetp_responses_own on storage.objects for select using (
  bucket_id = 'responses'
  and public.my_participant_id(((storage.foldername(name))[1])::uuid)::text = (storage.foldername(name))[2]
);
drop policy if exists livetp_responses_insert on storage.objects;
create policy livetp_responses_insert on storage.objects for insert with check (
  bucket_id = 'responses'
  and public.my_participant_id(((storage.foldername(name))[1])::uuid)::text = (storage.foldername(name))[2]
);
drop policy if exists livetp_responses_delete on storage.objects;
create policy livetp_responses_delete on storage.objects for delete using (
  bucket_id = 'responses'
  and public.my_participant_id(((storage.foldername(name))[1])::uuid)::text = (storage.foldername(name))[2]
);

-- ─── Durcissement (alertes du contrôle de sécurité Supabase) ────────────────
-- session_by_code reste volontairement accessible sans connexion.
alter function public.new_access_code() set search_path = public;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_participant_id(uuid) from public, anon;
revoke execute on function public.new_access_code() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_participant_id(uuid) to authenticated;
grant execute on function public.new_access_code() to authenticated;
