-- ============================================================
-- Grillz Studio SaaS — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Studios (one per paying customer)
create table if not exists studios (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  city                   text not null default '',
  owner_id               uuid references auth.users(id) on delete cascade,
  webhook_send_url       text,
  webhook_poll_url       text,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  subscription_status    text check (subscription_status in ('trialing','active','past_due','canceled')),
  created_at             timestamptz default now()
);

-- User profiles (extends auth.users)
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'studio_owner' check (role in ('admin','studio_owner')),
  studio_id   uuid references studios(id) on delete set null,
  created_at  timestamptz default now()
);

-- Materials per studio
create table if not exists materials (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  name       text not null,
  color      text not null default '#D4AF6A',
  created_at timestamptz default now(),
  unique (studio_id, name)
);

-- Orders
create table if not exists orders (
  id                   uuid primary key default gen_random_uuid(),
  studio_id            uuid not null references studios(id) on delete cascade,
  order_number         text not null,
  customer_name        text not null,
  customer_phone       text,
  customer_email       text,
  grillz_type          text not null,
  material             text not null,
  price                integer not null default 0,
  column_index         integer not null default 0 check (column_index between 0 and 7),
  impression_link_sent boolean not null default false,
  impression_date      text,
  fitting_link_sent    boolean not null default false,
  fitting_date         text,
  notes                text[] not null default '{}',
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  unique (studio_id, order_number)
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at before update on orders
  for each row execute function update_updated_at();

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'studio_owner')
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table studios   enable row level security;
alter table profiles  enable row level security;
alter table materials enable row level security;
alter table orders    enable row level security;

-- helpers
create or replace function my_studio_id() returns uuid language sql security definer as $$
  select studio_id from profiles where id = auth.uid();
$$;

create or replace function my_role() returns text language sql security definer as $$
  select role from profiles where id = auth.uid();
$$;

-- studios: owner sees own, admin sees all
create policy "studio owner access" on studios for all
  using (owner_id = auth.uid() or my_role() = 'admin');

-- profiles: own profile, admin sees all
create policy "profile self access" on profiles for all
  using (id = auth.uid() or my_role() = 'admin');

-- materials: own studio only, admin sees all
create policy "material studio access" on materials for all
  using (studio_id = my_studio_id() or my_role() = 'admin');

-- orders: own studio only, admin sees all
create policy "order studio access" on orders for all
  using (studio_id = my_studio_id() or my_role() = 'admin');

-- ============================================================
-- Seed: default admin account
-- (create the auth user manually in Supabase → Auth → Users first,
--  then update the role here)
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@yourdomain.com';
-- ============================================================
