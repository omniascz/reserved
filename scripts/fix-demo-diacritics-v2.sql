-- Re-fix mangled Czech characters by matching on ID position
-- (sortOrder + creation order), since the LIKE patterns can't match
-- bytes that aren't valid UTF-8.

BEGIN;

-- Use service names with ASCII-only LIKE pattern fragments that ARE valid
WITH ids AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM services
   WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget')
)
UPDATE services s
   SET name = CASE i.rn
         WHEN 1 THEN 'Dámský střih'
         WHEN 2 THEN 'Pánský střih'
         WHEN 3 THEN 'Barva + foukaná'
       END,
       description = CASE i.rn
         WHEN 1 THEN 'Klasický střih s mytím a foukanou'
         WHEN 2 THEN 'Pánský střih + úprava vousů'
         WHEN 3 THEN 'Barvení vlasů + foukaná'
       END
  FROM ids i
 WHERE s.id = i.id
   AND i.rn IN (1, 2, 3);

UPDATE employees
   SET first_name = 'Jana',
       last_name = 'Nováková',
       title = 'Senior stylistka'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget')
   AND first_name = 'Jana';

COMMIT;

SELECT name FROM services WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget') ORDER BY created_at;
SELECT first_name, last_name FROM employees WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget') ORDER BY created_at;
