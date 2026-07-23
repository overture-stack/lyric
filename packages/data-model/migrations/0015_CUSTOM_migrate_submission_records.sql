/**
    Migrates legacy submission JSON payloads into submission_files and submission_records.

    Assumptions:
    - Migration 0014_create_submission_records_table has already run.
    - submissions.data shape:
        inserts: { entity: { batchName, records: [...] } }
        updates: { entity: [...] }
        deletes: { entity: [...] }
    - submissions.errors shape:
        inserts: { entity: [{ index, reason, fieldName, fieldValue }] } 
        updates: { entity: [...] } 
        deletes: { entity: [...] }
    - Each item in data.{inserts|updates|deletes}.{entity}.records[] maps to one 
    row in submission_records.
    - A single record index may have multiple errors; they are aggregated into
    submission_records.errors as a JSON array per file/entity/index.
*/

WITH
-- Step 1: choose submissions that needs migration.
target_submissions AS (
	SELECT
		s.id,
		s.status,
		s.data,
		s.errors
	FROM submissions s
),

-- Step 2a: normalize INSERT buckets to a common shape.
insert_buckets AS (
	SELECT
		ts.id AS submission_id,
		ts.status AS submission_status,
		ts.errors AS submission_errors,
		'INSERT'::text AS action_type,
		'inserts'::text AS error_bucket,
		ins.key AS entity_name,
		format('inserts_%s', COALESCE(NULLIF(ins.value ->> 'batchName', ''), ins.key)) AS file_name,
		CASE
			WHEN jsonb_typeof(ins.value) = 'array' THEN ins.value
			ELSE COALESCE(ins.value -> 'records', '[]'::jsonb)
		END AS records
	FROM target_submissions ts
	CROSS JOIN LATERAL jsonb_each(COALESCE(ts.data -> 'inserts', '{}'::jsonb)) AS ins(key, value)
	WHERE jsonb_typeof(
		CASE
			WHEN jsonb_typeof(ins.value) = 'array' THEN ins.value
			ELSE COALESCE(ins.value -> 'records', '[]'::jsonb)
		END
	) = 'array'
),

-- Step 2b: normalize UPDATE buckets to the same shape.
update_buckets AS (
	SELECT
		ts.id AS submission_id,
		ts.status AS submission_status,
		ts.errors AS submission_errors,
		'UPDATE'::text AS action_type,
		'updates'::text AS error_bucket,
		upd.key AS entity_name,
		format('updates_%s', upd.key) AS file_name,
		CASE
			WHEN jsonb_typeof(upd.value) = 'array' THEN upd.value
			ELSE COALESCE(upd.value -> 'records', '[]'::jsonb)
		END AS records
	FROM target_submissions ts
	CROSS JOIN LATERAL jsonb_each(COALESCE(ts.data -> 'updates', '{}'::jsonb)) AS upd(key, value)
	WHERE jsonb_typeof(
		CASE
			WHEN jsonb_typeof(upd.value) = 'array' THEN upd.value
			ELSE COALESCE(upd.value -> 'records', '[]'::jsonb)
		END
	) = 'array'
),

-- Step 2c: normalize DELETE buckets to the same shape.
delete_buckets AS (
	SELECT
		ts.id AS submission_id,
		ts.status AS submission_status,
		ts.errors AS submission_errors,
		'DELETE'::text AS action_type,
		'deletes'::text AS error_bucket,
		del.key AS entity_name,
		format('deletes_%s', del.key) AS file_name,
		CASE
			WHEN jsonb_typeof(del.value) = 'array' THEN del.value
			ELSE COALESCE(del.value -> 'records', '[]'::jsonb)
		END AS records
	FROM target_submissions ts
	CROSS JOIN LATERAL jsonb_each(COALESCE(ts.data -> 'deletes', '{}'::jsonb)) AS del(key, value)
	WHERE jsonb_typeof(
		CASE
			WHEN jsonb_typeof(del.value) = 'array' THEN del.value
			ELSE COALESCE(del.value -> 'records', '[]'::jsonb)
		END
	) = 'array'
),

-- Step 3: union all action buckets.
source_submission_files AS (
	SELECT * FROM insert_buckets
	UNION ALL
	SELECT * FROM update_buckets
	UNION ALL
	SELECT * FROM delete_buckets
),

-- Step 4: create one submission_files row per action/entity bucket.
inserted_submission_files AS (
	INSERT INTO submission_files (submission_id, file_name, entity_name, file_size)
	SELECT
		submission_id,
		file_name,
		entity_name,
		0 AS file_size
	FROM source_submission_files
	RETURNING id, submission_id, file_name, entity_name
),

-- Step 5: map each normalized bucket to its inserted file_id.
file_map AS (
	SELECT
		ssf.submission_status,
		ssf.submission_errors,
		ssf.action_type,
		ssf.error_bucket,
		ssf.entity_name,
		ssf.records,
		isf.id AS file_id
	FROM source_submission_files ssf
	INNER JOIN inserted_submission_files isf
		ON isf.submission_id = ssf.submission_id
		AND isf.file_name = ssf.file_name
		AND isf.entity_name = ssf.entity_name
),

-- Step 6: explode each file's records array and keep record index.
expanded_records AS (
	SELECT
		fm.file_id,
		fm.submission_status,
		fm.action_type,
		fm.error_bucket,
		fm.entity_name,
		rec.value AS record_data,
		(rec.ordinality - 1)::integer AS record_index
	FROM file_map fm
	CROSS JOIN LATERAL jsonb_array_elements(fm.records) WITH ORDINALITY AS rec(value, ordinality)
),

-- Step 7: explode errors once, keyed by file + record index.
expanded_errors AS (
	SELECT
		fm.file_id,
		fm.error_bucket,
		fm.entity_name,
		(err.value ->> 'index')::integer AS record_index,
		(err.value - 'index') AS error_data
	FROM file_map fm
	CROSS JOIN LATERAL jsonb_array_elements(
		COALESCE(fm.submission_errors -> fm.error_bucket -> fm.entity_name, '[]'::jsonb)
	) AS err(value)
),

-- Step 7b: group all errors for the same record index into a JSON array.
aggregated_errors AS (
	SELECT
		ee.file_id,
		ee.error_bucket,
		ee.entity_name,
		ee.record_index,
		jsonb_agg(ee.error_data) AS error_data
	FROM expanded_errors ee
	GROUP BY ee.file_id, ee.error_bucket, ee.entity_name, ee.record_index
)

-- Step 8: insert records with mapped errors and derived state.
INSERT INTO submission_records (file_id, data, action_type, errors, state)
SELECT
	er.file_id,
	er.record_data AS data,
	er.action_type::submission_record_type,
	ae.error_data,
	CASE
		WHEN er.submission_status IN ('OPEN', 'VALIDATING') THEN 'RECEIVED'::submission_record_state
		WHEN er.submission_status = 'INVALID' OR ae.error_data IS NOT NULL THEN 'INVALID'::submission_record_state
		ELSE 'VALID'::submission_record_state
	END AS state
FROM expanded_records er
LEFT JOIN aggregated_errors ae
	ON ae.file_id = er.file_id
	AND ae.error_bucket = er.error_bucket
	AND ae.entity_name = er.entity_name
	AND ae.record_index = er.record_index;
