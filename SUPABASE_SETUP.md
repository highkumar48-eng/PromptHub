# PromptHub + Supabase

Use Supabase as the only production data source. The old local SQLite/D1 preview is retained only while the UI migration is in progress; it must not be used as a second production database.

## Runtime configuration

Set these hosting secrets, never commit them:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The publishable key can appear in browser code. RLS policies protect rows. Do not use or publish a service-role/secret key.

## First administrator

1. Create your account through the future `/admin/login` page.
2. In Supabase Dashboard → Authentication → Users, copy your user UUID.
3. In SQL Editor, run once:

```sql
insert into public.app_roles (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin')
on conflict (user_id) do update set role = 'admin';
```

There is deliberately no public route that can create an admin role.
