-- Keep presence queries fast as verix2_installations/verix2_sessions grow.
-- The admin analytics function filters both tables by last_seen for the
-- "online now" and active-window counters.

create index if not exists verix2_installations_last_seen_idx
  on public.verix2_installations (last_seen desc);

create index if not exists verix2_sessions_last_seen_idx
  on public.verix2_sessions (last_seen desc);
