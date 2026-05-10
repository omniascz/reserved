-- Fix mangled Czech characters in demo-widget tenant data.
-- Re-write strings with proper UTF-8.

UPDATE tenants
   SET name = 'Salon Demo Widget'
 WHERE slug = 'demo-widget';

UPDATE service_categories
   SET name = 'Vlasy'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget');

UPDATE services
   SET name = 'Dámský střih',
       description = 'Klasický střih s mytím a foukanou'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget')
   AND name LIKE 'D%mský%';

UPDATE services
   SET name = 'Pánský střih',
       description = 'Pánský střih + úprava vousů'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget')
   AND name LIKE 'P%nský%';

UPDATE services
   SET name = 'Barva + foukaná',
       description = 'Barvení vlasů + foukaná'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget')
   AND name LIKE 'Barva%';

UPDATE employees
   SET first_name = 'Jana',
       last_name = 'Nováková',
       title = 'Senior stylistka'
 WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-widget')
   AND first_name = 'Jana';

SELECT 'OK — diacritics fixed' AS result;
