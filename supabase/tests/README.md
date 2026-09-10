# 021 test harness

`021_atomic_adds.sql` cannot be exercised against Supabase from a dev machine —
the project exposes no Postgres credentials, and the read-only MCP has no way to
run DDL. It runs instead against any local Postgres, on a minimal harness that
recreates only what the functions touch: the five tables, the `set_updated_at`
trigger from 001, an `auth.uid()` stub reading `test.uid`, and the three
Supabase roles.

```bash
psql -d postgres -c 'create database atomic_test'
psql -d atomic_test -f supabase/tests/021_harness.sql
psql -d atomic_test -f supabase/021_atomic_adds.sql
psql -d atomic_test -f supabase/tests/021_atomic_adds_test.sql
psql -d postgres -c 'drop database atomic_test'
```

Every line of output ends in PASS or FAIL. The ones that matter are T2, T7 and
T9: each drives an add that fails after the catalog row would have been written,
then asserts no such row exists. Those are the whole reason the migration
exists.

T5a is not an assertion about the code. It records that the first version of the
T5 test was wrong — `set_updated_at` overwrites any explicit `updated_at` on
UPDATE, so a baseline written that way never existed and the test reported a
failure that was not there. T5b measures before and after instead, and T5c
confirms the trigger is live so T5b cannot pass vacuously.
