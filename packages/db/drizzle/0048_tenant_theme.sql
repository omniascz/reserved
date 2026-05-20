-- Sprint 8.1: Embed-ready widget — tenant theme
--
-- Pridava sloupec `theme` jsonb pro brand customizaci widgetu:
--   {
--     "primaryColor": "#FF6B6B",       // hex #RRGGBB
--     "borderRadius": "md",            // 'none' | 'sm' | 'md' | 'lg' | 'xl'
--     "logoUrl": "https://...",        // volitelne logo v hlavicce widgetu
--     "fontFamily": "system"           // 'system' | 'serif' | 'sans'
--   }
--
-- Default je {} (widget pouzije Reserved default).

ALTER TABLE tenants
  ADD COLUMN theme jsonb NOT NULL DEFAULT '{}'::jsonb;
