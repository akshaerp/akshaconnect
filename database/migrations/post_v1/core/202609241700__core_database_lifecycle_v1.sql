-- AkshaConnect database lifecycle foundation V1
-- No BEGIN/COMMIT here. The Mumbai deployment runner owns the transaction
-- and writes the migration ledger atomically with this file.

DO $$
DECLARE
    v_baseline_exists boolean;
    v_migrations_exists boolean;
    v_seed_runs_exists boolean;
BEGIN
    IF current_database() <> 'akshaconnect'
       AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
        RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
    END IF;

    IF to_regclass('public.ac_workspace') IS NULL
       OR to_regclass('public.ac_identity') IS NULL
       OR to_regclass('public.ac_workspace_member') IS NULL
       OR to_regclass('public.ac_session') IS NULL THEN
        RAISE EXCEPTION 'Required AkshaConnect foundation tables are missing';
    END IF;

    v_baseline_exists := to_regclass('public.ac_db_baseline') IS NOT NULL;
    v_migrations_exists := to_regclass('public.ac_db_migrations') IS NOT NULL;
    v_seed_runs_exists := to_regclass('public.ac_db_seed_runs') IS NOT NULL;

    IF v_baseline_exists OR v_migrations_exists OR v_seed_runs_exists THEN
        RAISE EXCEPTION
            'Lifecycle foundation is already present or partially present: baseline=%, migrations=%, seed_runs=%',
            v_baseline_exists, v_migrations_exists, v_seed_runs_exists;
    END IF;
END
$$;

CREATE TABLE public.ac_db_baseline (
    baseline_id BIGSERIAL PRIMARY KEY,
    baseline_code VARCHAR(80) NOT NULL UNIQUE,
    baseline_name VARCHAR(160) NOT NULL,
    baseline_version VARCHAR(40) NOT NULL,
    established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.ac_db_migrations (
    migration_id BIGSERIAL PRIMARY KEY,
    module_code VARCHAR(40) NOT NULL,
    migration_type VARCHAR(40) NOT NULL,
    migration_file TEXT NOT NULL UNIQUE,
    migration_sha256 CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_ac_db_migrations_status CHECK (status IN ('SUCCESS', 'FAILED')),
    CONSTRAINT ck_ac_db_migrations_sha CHECK (migration_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX ix_ac_db_migrations_module_status
    ON public.ac_db_migrations(module_code, status, applied_at DESC);

CREATE TABLE public.ac_db_seed_runs (
    seed_run_id BIGSERIAL PRIMARY KEY,
    seed_code VARCHAR(120) NOT NULL UNIQUE,
    seed_file TEXT NOT NULL,
    seed_sha256 CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_ac_db_seed_runs_status CHECK (status IN ('SUCCESS', 'FAILED')),
    CONSTRAINT ck_ac_db_seed_runs_sha CHECK (seed_sha256 ~ '^[0-9a-f]{64}$')
);

INSERT INTO public.ac_db_baseline (
    baseline_code,
    baseline_name,
    baseline_version,
    metadata_json
)
VALUES (
    'AKSHACONNECT_DB_BASELINE_V1',
    'AkshaConnect Standalone Production Baseline',
    'P1-V8A-LEGACY-SSO-BRIDGE',
    jsonb_build_object(
        'established_by',
        'database/migrations/post_v1/core/202609241700__core_database_lifecycle_v1.sql',
        'purpose',
        'Immutable lifecycle marker for forward-only AkshaConnect migrations'
    )
);

DO $$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count
    FROM public.ac_db_baseline
    WHERE baseline_code = 'AKSHACONNECT_DB_BASELINE_V1';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one AKSHACONNECT_DB_BASELINE_V1 marker, found %', v_count;
    END IF;
END
$$;
