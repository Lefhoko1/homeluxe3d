-- =============================================================================
-- Roles, permissions, and a record of who did what
--
-- "Use roles and permissions rather than hardcoded admin checks" (rule 7),
-- "make roles/permissions database-driven" (rule 34), "admin actions must be
-- auditable" (rule 23).
--
-- Today there is one bit: `profiles.role = 'platform_admin'`, and everything
-- either has it or does not. That was right for one operator and is wrong for
-- the seven roles the specification describes, because it cannot express the
-- thing those roles exist for -- somebody who may approve a product but not
-- publish a scene, or process assets but not change prices.
--
-- THE OLD CHECK KEEPS WORKING. `is_platform_admin()` is reimplemented in
-- terms of the new model with the legacy column as a fallback, so all 43
-- existing policies carry on unchanged and nobody is locked out by this
-- migration. Policies move to `has_permission()` one at a time, as the
-- screens that need them are built -- not in a big bang that would leave the
-- system unusable if one predicate is wrong.
--
-- Run after 0008.
-- =============================================================================

-- =============================================================================
-- 1. PERMISSIONS
--
-- A permission is a verb on a noun. Naming them `noun.verb` keeps them
-- sortable and greppable, and means a screen can ask for exactly what it
-- needs rather than for a role.
-- =============================================================================
create table if not exists permissions (
  code        text primary key,
  description text not null,
  category    text not null default 'general'
);

insert into permissions (code, description, category) values
  ('shop.read',        'See shops and their details',                'shops'),
  ('shop.manage',      'Create and edit shops, and their members',   'shops'),
  ('product.read',     'See products, including drafts',             'catalogue'),
  ('product.manage',   'Create, edit and withdraw products',         'catalogue'),
  ('product.approve',  'Approve a product for public display',       'catalogue'),
  ('material.manage',  'Create and edit materials',                  'catalogue'),
  ('asset.upload',     'Upload asset files',                         'assets'),
  ('asset.process',    'Run and re-run asset processing',            'assets'),
  ('asset.approve',    'Mark an asset ready for use',                'assets'),
  ('house.read',       'See houses, rooms and slots',                'house'),
  ('house.manage',     'Create and edit slots and rooms',            'house'),
  ('placement.manage', 'Put products and materials into slots',      'house'),
  ('campaign.manage',  'Create and edit campaigns',                  'commercial'),
  ('scene.publish',    'Publish a scene version to the public',      'commercial'),
  ('scene.rollback',   'Restore a previous published scene',         'commercial'),
  ('analytics.read',   'See performance and interaction data',       'commercial'),
  ('audit.read',       'Read the audit log',                         'platform'),
  ('platform.manage',  'Settings, feature flags, roles',             'platform')
on conflict (code) do update set
  description = excluded.description, category = excluded.category;

-- =============================================================================
-- 2. ROLES
-- =============================================================================
create table if not exists roles (
  code        text primary key,
  name        text not null,
  description text,
  -- Platform roles apply everywhere; shop roles only within a shop the user
  -- belongs to. The distinction matters because a SHOP_MANAGER holding
  -- 'product.manage' must not be able to edit another shop's products, and
  -- that is enforced by the shop scoping already in place, not by the role.
  scope       text not null default 'platform'
              check (scope in ('platform', 'shop')),
  sort_order  integer not null default 100
);

insert into roles (code, name, scope, sort_order, description) values
  ('super_admin',     'Super Admin',      'platform', 10,
   'Everything, including roles and platform settings.'),
  ('admin',           'Administrator',    'platform', 20,
   'Day-to-day running of the platform. Not roles or settings.'),
  ('content_manager', 'Content Manager',  'platform', 30,
   'The catalogue and the house: products, materials, slots, placements.'),
  ('asset_manager',   'Asset Manager',    'platform', 40,
   'Uploads and processing. Does not decide what is sold or where.'),
  ('reviewer',        'Reviewer',         'platform', 50,
   'Approves products and assets. Changes nothing else.'),
  ('shop_manager',    'Shop Manager',     'shop',     60,
   'Full control of one shop: its products, assets and campaigns.'),
  ('shop_editor',     'Shop Editor',      'shop',     70,
   'Edits one shop''s products. Cannot publish or manage members.')
on conflict (code) do update set
  name = excluded.name, scope = excluded.scope,
  description = excluded.description, sort_order = excluded.sort_order;

create table if not exists role_permissions (
  role_code       text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- Super admin holds everything, by construction rather than by list -- a new
-- permission must never need remembering to grant here.
insert into role_permissions (role_code, permission_code)
select 'super_admin', code from permissions
on conflict do nothing;

insert into role_permissions (role_code, permission_code) values
  ('admin', 'shop.read'), ('admin', 'shop.manage'),
  ('admin', 'product.read'), ('admin', 'product.manage'), ('admin', 'product.approve'),
  ('admin', 'material.manage'),
  ('admin', 'asset.upload'), ('admin', 'asset.process'), ('admin', 'asset.approve'),
  ('admin', 'house.read'), ('admin', 'house.manage'), ('admin', 'placement.manage'),
  ('admin', 'campaign.manage'), ('admin', 'scene.publish'), ('admin', 'scene.rollback'),
  ('admin', 'analytics.read'), ('admin', 'audit.read'),

  ('content_manager', 'shop.read'),
  ('content_manager', 'product.read'), ('content_manager', 'product.manage'),
  ('content_manager', 'material.manage'),
  ('content_manager', 'house.read'), ('content_manager', 'house.manage'),
  ('content_manager', 'placement.manage'), ('content_manager', 'campaign.manage'),
  ('content_manager', 'analytics.read'),

  ('asset_manager', 'product.read'),
  ('asset_manager', 'asset.upload'), ('asset_manager', 'asset.process'),
  ('asset_manager', 'material.manage'), ('asset_manager', 'house.read'),

  ('reviewer', 'shop.read'), ('reviewer', 'product.read'),
  ('reviewer', 'product.approve'), ('reviewer', 'asset.approve'),
  ('reviewer', 'house.read'), ('reviewer', 'analytics.read'),

  ('shop_manager', 'shop.read'), ('shop_manager', 'product.read'),
  ('shop_manager', 'product.manage'), ('shop_manager', 'asset.upload'),
  ('shop_manager', 'campaign.manage'), ('shop_manager', 'analytics.read'),

  ('shop_editor', 'shop.read'), ('shop_editor', 'product.read'),
  ('shop_editor', 'product.manage'), ('shop_editor', 'asset.upload')
on conflict do nothing;

-- =============================================================================
-- 3. WHO HOLDS WHICH ROLE
--
-- A separate table rather than a column, because one person can be both a
-- platform reviewer and a manager of their own shop, and a column cannot say
-- that.
-- =============================================================================
create table if not exists profile_roles (
  profile_id uuid not null references profiles(id) on delete cascade,
  role_code  text not null references roles(code) on delete cascade,
  granted_by uuid references profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, role_code)
);

-- Carry the existing admins across, so nobody loses access to a system they
-- had access to a minute ago.
insert into profile_roles (profile_id, role_code)
select id, 'super_admin' from profiles where role = 'platform_admin'
on conflict do nothing;

-- =============================================================================
-- 4. ASKING THE QUESTION
-- =============================================================================
create or replace function public.has_permission(p_code text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from profile_roles pr
      join role_permissions rp on rp.role_code = pr.role_code
     where pr.profile_id = auth.uid()
       and rp.permission_code = p_code
  );
$$;

comment on function public.has_permission is
  'The check every new policy should use. Ask for the permission you need, '
  'not for a role that happens to have it today.';

-- Reimplemented, not replaced. Every existing policy calls this, and the
-- legacy column stays as a fallback so an operator promoted the old way is
-- still an operator.
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles pr
     where pr.profile_id = auth.uid()
       and pr.role_code in ('super_admin', 'admin')
  ) or exists (
    select 1 from profiles p
     where p.id = auth.uid() and p.role = 'platform_admin'
  );
$$;

-- =============================================================================
-- 5. AUDIT LOG
--
-- Append-only by policy: there is no update or delete policy on this table at
-- all, so even a super admin cannot quietly edit history through PostgREST.
-- =============================================================================
create table if not exists audit_logs (
  id          bigserial primary key,
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  -- What it looked like before and after. Nullable: a create has no before,
  -- a delete has no after.
  before      jsonb,
  after       jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id, at desc);
create index if not exists audit_logs_actor_idx on audit_logs (actor_id, at desc);

comment on table audit_logs is
  'Append-only. No update or delete policy exists, deliberately: a log an '
  'administrator can edit is not a log.';

create or replace function public.record_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language sql security definer set search_path = public
as $$
  insert into audit_logs (actor_id, action, entity_type, entity_id, before, after, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_metadata)
  returning id;
$$;

-- =============================================================================
-- 6. SECURITY
-- =============================================================================
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table profile_roles enable row level security;
alter table audit_logs enable row level security;

drop policy if exists permissions_read on permissions;
create policy permissions_read on permissions for select using (auth.uid() is not null);

drop policy if exists roles_read on roles;
create policy roles_read on roles for select using (auth.uid() is not null);

drop policy if exists role_permissions_read on role_permissions;
create policy role_permissions_read on role_permissions for select using (auth.uid() is not null);

drop policy if exists roles_write on roles;
create policy roles_write on roles for all
  using (public.has_permission('platform.manage'))
  with check (public.has_permission('platform.manage'));

drop policy if exists role_permissions_write on role_permissions;
create policy role_permissions_write on role_permissions for all
  using (public.has_permission('platform.manage'))
  with check (public.has_permission('platform.manage'));

-- A person may see their own roles; granting them needs platform.manage.
drop policy if exists profile_roles_read on profile_roles;
create policy profile_roles_read on profile_roles
  for select using (profile_id = auth.uid() or public.has_permission('platform.manage'));

drop policy if exists profile_roles_write on profile_roles;
create policy profile_roles_write on profile_roles for all
  using (public.has_permission('platform.manage'))
  with check (public.has_permission('platform.manage'));

drop policy if exists audit_logs_read on audit_logs;
create policy audit_logs_read on audit_logs
  for select using (public.has_permission('audit.read'));
-- No insert policy: writes go through record_audit(), which is security
-- definer. No update or delete policy, ever.
