-- Rode no SQL Editor do Supabase
create table if not exists rooms(
  code text primary key, max_participants int not null check (max_participants between 2 and 200),
  created_at timestamptz default now());
create table if not exists members(
  id uuid primary key, room_code text not null references rooms(code) on delete cascade,
  name text not null, avatar text, joined_at timestamptz default now(), last_seen timestamptz default now());
create table if not exists messages(
  id bigint generated always as identity primary key, room_code text not null references rooms(code) on delete cascade,
  member_id uuid not null, name text not null, body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz default now());
create index if not exists messages_room_idx on messages(room_code, created_at);

alter table rooms enable row level security;
alter table members enable row level security;
alter table messages enable row level security;
create policy "read rooms" on rooms for select using (true);
create policy "read members" on members for select using (true);
create policy "read messages" on messages for select using (true);
-- Sem policies de insert/update/delete: toda escrita passa pelas funções abaixo.

create or replace function create_room(p_max int) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  if p_max < 2 or p_max > 50 then raise exception 'INVALID_LIMIT'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from rooms where code = c);
  end loop;
  insert into rooms(code, max_participants) values (c, p_max);
  return c;
end $$;

create or replace function join_room(p_code text, p_member uuid, p_name text, p_avatar text) returns json
language plpgsql security definer set search_path=public as $$
declare r rooms; n int;
begin
  select * into r from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  delete from members where room_code = r.code and last_seen < now() - interval '2 minutes' and id <> p_member;
  if not exists (select 1 from members where id = p_member and room_code = r.code) then
    select count(*) into n from members where room_code = r.code;
    if n >= r.max_participants then raise exception 'ROOM_FULL'; end if;
  end if;
  insert into members(id, room_code, name, avatar) values (p_member, r.code, left(trim(p_name), 24), p_avatar)
  on conflict (id) do update set name = excluded.name, avatar = excluded.avatar, last_seen = now(), room_code = excluded.room_code;
  return json_build_object('code', r.code, 'max', r.max_participants);
end $$;

create or replace function send_message(p_code text, p_member uuid, p_body text) returns void
language plpgsql security definer set search_path=public as $$
declare m members;
begin
  select * into m from members where id = p_member and room_code = p_code;
  if not found then raise exception 'NOT_MEMBER'; end if;
  insert into messages(room_code, member_id, name, body) values (p_code, p_member, m.name, left(trim(p_body), 2000));
  update members set last_seen = now() where id = p_member;
end $$;

create or replace function leave_room(p_member uuid) returns void
language sql security definer set search_path=public as $$ delete from members where id = p_member; $$;

grant execute on function create_room(int), join_room(text,uuid,text,text), send_message(text,uuid,text), leave_room(uuid) to anon;
alter publication supabase_realtime add table messages, members;
