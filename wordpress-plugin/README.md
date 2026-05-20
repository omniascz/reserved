# Reserved Booking — Wordpress Plugin

Oficiální Wordpress plugin pro [Reserved.cz](https://reserved.cz). Vlož rezervační widget do svého Wordpress webu jednoduše.

## Funkce

- **Shortcode** `[reserved-booking slug="..."]`
- **Gutenberg block** "Reserved Booking"
- 3 režimy: inline iframe, modal popup, tlačítko
- Auto-resize iframe (žádný scroll uvnitř)
- Settings page pro custom widget URL (pro tenants s vlastní doménou)
- Localizable (česky, anglicky)

## Instalace (dev)

```bash
# Zip plugin
cd wordpress-plugin
zip -r reserved-booking.zip reserved-booking/

# V WP adminu: Plugins → Add New → Upload Plugin → reserved-booking.zip
```

## Distribuce

1. **Manuální download** — ZIP soubor z reserved.cz/wordpress
2. **WP Plugin Directory** (budoucí) — submit přes wordpress.org/plugins/developers/add/

## Použití

Shortcode v editoru:

```
[reserved-booking slug="muj-salon"]
[reserved-booking slug="muj-salon" lang="en" mode="modal"]
[reserved-booking slug="muj-salon" mode="button" button="Objednat termín" button_color="#FF6B6B"]
```

PHP v šabloně:

```php
<?php echo do_shortcode('[reserved-booking slug="muj-salon"]'); ?>
```

Gutenberg: hledej "Reserved Booking" v block inserteru.

## Vývoj

Plugin nevyžaduje build — čistý PHP + JS. Plugin používá `embed.js` SDK z widget.reserved.cz.

## Soubory

- `reserved-booking.php` — hlavní plugin file (PHP)
- `block.js` — Gutenberg block registration (JS)
- `readme.txt` — Wordpress plugin readme (WP convention)
