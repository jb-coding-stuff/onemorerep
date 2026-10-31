-- Multi-user: every row belongs to an account (auth.users). Row Level Security
-- lets each signed-in user see and change only their own rows; plans marked
-- `shared` are readable by every signed-in user.
--
-- Existing rows keep user_id = null (invisible to everyone) until they are
-- assigned to the owner's account once it exists (see the end of this file).

-- 1. Owner column, filled automatically from the signed-in user.
alter table workout_log       add column user_id uuid references auth.users on delete cascade default auth.uid();
alter table progression_state add column user_id uuid references auth.users on delete cascade default auth.uid();
alter table program           add column user_id uuid references auth.users on delete cascade default auth.uid();
alter table program_pack      add column user_id uuid references auth.users on delete cascade default auth.uid();
alter table exercise_catalog  add column user_id uuid references auth.users on delete cascade default auth.uid();
alter table exercise_library  add column user_id uuid references auth.users on delete cascade default auth.uid();

-- 2. Keys are per user (two people can both have "leg_press").
--    workout_log keeps client_id (a UUID per workout) as its key.
alter table progression_state drop constraint progression_state_pkey,
  add constraint progression_state_user_key unique (user_id, exercise_id);
alter table program drop constraint program_pkey,
  add constraint program_user_key unique (user_id, id);
alter table program_pack drop constraint program_pack_pkey,
  add constraint program_pack_user_key unique (user_id, pack_id);
alter table exercise_catalog drop constraint exercise_catalog_pkey,
  add constraint exercise_catalog_user_key unique (user_id, canonical_id);
alter table exercise_library drop constraint exercise_library_pkey,
  add constraint exercise_library_user_key unique (user_id, exercise_id);
create index workout_log_user_idx on workout_log (user_id);

-- 3. Shareable plans.
alter table program_pack add column shared boolean not null default false;
alter table program_pack add column owner_name text;
alter table program_pack add column catalog jsonb; -- exercise names travel with a shared plan

-- 4. Row Level Security: own rows only (plus shared plans to read).
drop policy single_user_all on workout_log;
drop policy single_user_all on progression_state;
drop policy single_user_all on program;
drop policy single_user_all on program_pack;
drop policy single_user_all on exercise_catalog;
drop policy single_user_all on exercise_library;

create policy own_rows on workout_log       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on progression_state for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on program           for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on program_pack      for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on exercise_catalog  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on exercise_library  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shared_plans_read on program_pack for select to authenticated using (shared);

-- 5. After the owner has signed up (run once, with their auth user id):
--    rows the app already re-uploaded under the account win; the rest move over.
--
-- do $$ declare me uuid := '<owner user id>'; begin
--   delete from progression_state o where user_id is null and exists (select 1 from progression_state n where n.user_id = me and n.exercise_id = o.exercise_id);
--   delete from exercise_catalog  o where user_id is null and exists (select 1 from exercise_catalog  n where n.user_id = me and n.canonical_id = o.canonical_id);
--   delete from exercise_library  o where user_id is null and exists (select 1 from exercise_library  n where n.user_id = me and n.exercise_id = o.exercise_id);
--   delete from program_pack      o where user_id is null and exists (select 1 from program_pack      n where n.user_id = me and n.pack_id = o.pack_id);
--   delete from program           o where user_id is null and exists (select 1 from program           n where n.user_id = me and n.id = o.id);
--   update workout_log set user_id = me where user_id is null;
--   update progression_state set user_id = me where user_id is null;
--   update program set user_id = me where user_id is null;
--   update program_pack set user_id = me where user_id is null;
--   update exercise_catalog set user_id = me where user_id is null;
--   update exercise_library set user_id = me where user_id is null;
-- end $$;
-- alter table workout_log alter column user_id set not null;  -- and the same for the other five tables
