-- ============================================================
-- Storage / Inventory — run in Supabase SQL Editor → New query
-- ============================================================

-- Stock items (e.g. "14k Gold", "18k Gold", "Silver", "Wax", "Dental stone")
create table if not exists stock_items (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  name          text not null,
  grams         double precision not null default 0,
  low_threshold double precision not null default 0,
  created_at    timestamptz default now(),
  unique (studio_id, name)
);

-- Movement log (book-ins and usage), for history + audit
create table if not exists stock_movements (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  change_grams  double precision not null,            -- positive = booked in, negative = used
  reason        text,                                  -- 'book-in' | 'usage' | 'adjustment'
  order_id      uuid references orders(id) on delete set null,
  created_at    timestamptz default now()
);

-- Flag so a completed order isn't double-counted
alter table orders
  add column if not exists materials_recorded boolean not null default false;

-- RLS
alter table stock_items     enable row level security;
alter table stock_movements enable row level security;

create policy "stock items studio access" on stock_items for all
  using (studio_id = my_studio_id() or my_role() = 'admin');

create policy "stock movements studio access" on stock_movements for all
  using (studio_id = my_studio_id() or my_role() = 'admin');
