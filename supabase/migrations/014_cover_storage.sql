-- Run once in Supabase → SQL Editor (after 013). Safe to re-run.

-- Covers and disc photos the owner adds from a link (a shop's product page or
-- an image). The server re-encodes them as JPEG and stores them here, at
-- <user id>/<instance id>-<hash>-<w>x<h>[.thumb].jpg. Public to read, like
-- the artwork on Discogs and Spotify; only the server (secret key) writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
