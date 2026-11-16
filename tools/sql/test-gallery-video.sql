-- Gallery videos: generated columns on gallery_items + user-media bucket limits. Run by tools/test-social-sql.sh after schema.sql.
\set ON_ERROR_STOP 1
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
insert into public.gallery_items (id, user_id, day, data) values
  ('v1', '11111111-1111-1111-1111-111111111111', '2026-11-12', '{"id":"v1","kind":"video","duration":42.5,"remote":{"thumb":"u/gallery/v1/thumb.webp","disp":"u/gallery/v1/disp.webp"},"localOnly":true}'),
  ('p1', '11111111-1111-1111-1111-111111111111', '2026-11-12', '{"id":"p1","remote":{"orig":"u/gallery/p1/orig.jpg","disp":"u/gallery/p1/disp.webp"}}'),
  ('v2', '11111111-1111-1111-1111-111111111111', '2026-11-13', '{"id":"v2","kind":"video","duration":"oops"}')
on conflict do nothing;
do $$
declare r record; n int = 0;
begin
  select * into r from public.gallery_items where id = 'v1';
  if r.media_type <> 'video' or r.duration_s <> 42.5 or r.poster_path <> 'u/gallery/v1/disp.webp' or r.local_only is not true then raise exception 'FAIL v1 %', row_to_json(r); end if;
  raise notice 'ok video row: media_type, duration_s, poster_path, local_only';
  select * into r from public.gallery_items where id = 'p1';
  if r.media_type <> 'photo' or r.duration_s is not null or r.poster_path is not null or r.local_only then raise exception 'FAIL p1 %', row_to_json(r); end if;
  raise notice 'ok photo row (old rows without kind = photo, no poster)';
  select * into r from public.gallery_items where id = 'v2';
  if r.duration_s is not null then raise exception 'FAIL v2 bad duration must be null'; end if;
  raise notice 'ok non-numeric duration does not break the insert';
  begin
    update public.gallery_items set media_type = 'photo' where id = 'v1';
    raise exception 'FAIL generated column writable';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok generated columns are read-only';
  end;
  select * into r from storage.buckets where id = 'user-media';
  if r.public or r.file_size_limit <> 52428800 or not (r.allowed_mime_types @> array['video/mp4','video/quicktime','video/webm','image/jpeg']) then raise exception 'FAIL bucket %', row_to_json(r); end if;
  raise notice 'ok user-media bucket: private, 50 MB, videos allowed';
end $$;
delete from public.gallery_items where id in ('v1','p1','v2');
