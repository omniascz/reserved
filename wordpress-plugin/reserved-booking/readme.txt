=== Reserved Booking ===
Contributors: reserved
Tags: booking, reservation, calendar, scheduler, appointments, embed
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Online rezervační widget od Reserved.cz. Vlož do své stránky shortcode nebo Gutenberg block.

== Description ==

**Reserved Booking** je oficiální Wordpress plugin pro službu [Reserved.cz](https://reserved.cz) — moderní rezervační platformu pro salony, kliniky, fitness centra a další obory s rezervacemi.

Plugin přidává:

* **Shortcode** `[reserved-booking slug="muj-salon"]` pro klasický editor
* **Gutenberg block** "Reserved Booking" s vizuálním nastavením
* **Settings page** pod Settings → Reserved Booking
* Podporu pro **3 režimy**: inline iframe, modal popup, tlačítko

Widget se automaticky přizpůsobí podle obsahu (auto-resize), respektuje tenant theme (barvy, font, logo) a funguje bez znalosti HTML.

= Pre-requirements =

Pro použití plugin potřebuješ účet na [reserved.cz](https://reserved.cz). Registrace je zdarma na 14 dní.

== Installation ==

1. Nahraj složku `reserved-booking` do `/wp-content/plugins/`
2. Aktivuj plugin v Plugins menu
3. Použij shortcode `[reserved-booking slug="tvuj-slug"]` na libovolné stránce

== Frequently Asked Questions ==

= Kde najdu svůj slug? =

Slug je identifikátor tvého účtu na Reserved.cz. Najdeš ho v admin panelu na adrese tvuj-slug.reserved.cz.

= Jak změním barvu/písmo widgetu? =

V admin panelu Reserved (Nastavení → Vzhled) si nastavíš primary color, font, logo. Widget je automaticky aplikuje, bez úpravy plugin.

= Můžu vložit více widgetů na jednu stránku? =

Ano, každý shortcode vytvoří samostatný widget se svým ID.

== Screenshots ==

1. Inline widget na stránce
2. Gutenberg block s nastavením
3. Modal popup režim

== Changelog ==

= 1.0.0 =
* První verze. Shortcode, Gutenberg block, settings page.

== Upgrade Notice ==

= 1.0.0 =
První release.
