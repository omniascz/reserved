<?php
/**
 * Plugin Name:       Reserved Booking
 * Plugin URI:        https://reserved.cz/wordpress
 * Description:       Vlož Reserved rezervační widget na svůj Wordpress web. Shortcode + Gutenberg block.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Reserved s.r.o.
 * Author URI:        https://reserved.cz
 * License:           MIT
 * Text Domain:       reserved-booking
 *
 * Použití:
 *   1. Shortcode v editoru:
 *      [reserved-booking slug="muj-salon"]
 *      [reserved-booking slug="muj-salon" lang="en" mode="modal" button="Rezervovat"]
 *
 *   2. Gutenberg blok: hledej "Reserved Booking" v block inserteru
 *
 *   3. PHP volání v šabloně:
 *      <?php echo do_shortcode('[reserved-booking slug="muj-salon"]'); ?>
 */

if (!defined('ABSPATH')) {
    exit; // Direct access blocked
}

define('RESERVED_BOOKING_VERSION', '1.0.0');
define('RESERVED_BOOKING_DEFAULT_WIDGET_URL', 'https://widget.reserved.cz');

/**
 * Vrátí widget base URL. Lze přepsat přes wp_options nebo filtr.
 */
function reserved_booking_get_widget_url() {
    $url = get_option('reserved_booking_widget_url', RESERVED_BOOKING_DEFAULT_WIDGET_URL);
    return apply_filters('reserved_booking_widget_url', rtrim($url, '/'));
}

/**
 * Shortcode handler.
 *
 * Atributy:
 *   slug       (required) tenant slug
 *   lang       cs|en (default cs)
 *   mode       inline|modal|button (default inline)
 *   button     text tlačítka (default 'Rezervovat')
 *   button_color  hex barva tlačítka (default #3b82f6)
 *   max_width  max šířka v px (default 600)
 *   height     výchozí výška (default 600)
 */
function reserved_booking_shortcode($atts) {
    $atts = shortcode_atts([
        'slug'         => '',
        'lang'         => 'cs',
        'mode'         => 'inline',
        'button'       => 'Rezervovat',
        'button_color' => '#3b82f6',
        'max_width'    => '600',
        'height'       => '600',
    ], $atts, 'reserved-booking');

    $slug = sanitize_key($atts['slug']);
    if (empty($slug)) {
        return '<div style="padding:12px;background:#fee;border:1px solid #fcc;border-radius:8px;">'
            . __('Reserved Booking: chybí atribut slug. Příklad: [reserved-booking slug="muj-salon"]', 'reserved-booking')
            . '</div>';
    }

    $widget_url = reserved_booking_get_widget_url();
    $lang = in_array($atts['lang'], ['cs', 'en'], true) ? $atts['lang'] : 'cs';
    $mode = in_array($atts['mode'], ['inline', 'modal', 'button'], true) ? $atts['mode'] : 'inline';
    $button = esc_attr($atts['button']);
    $button_color = preg_match('/^#[0-9a-fA-F]{6}$/', $atts['button_color']) ? $atts['button_color'] : '#3b82f6';
    $max_width = absint($atts['max_width']);
    $height = absint($atts['height']);

    // Generujeme unikátní ID pro tento embed (umožní více widgetů na stránce)
    $widget_id = 'reserved-widget-' . wp_generate_uuid4();

    $script_url = esc_url($widget_url . '/embed.js');

    $data_attrs = sprintf(
        'data-slug="%s" data-lang="%s" data-mode="%s" data-button-text="%s" data-button-color="%s" data-max-width="%d" data-height="%d" data-container="#%s"',
        esc_attr($slug),
        esc_attr($lang),
        esc_attr($mode),
        $button,
        esc_attr($button_color),
        $max_width,
        $height,
        esc_attr($widget_id)
    );

    return sprintf(
        '<div id="%s"></div><script src="%s" %s defer></script>',
        esc_attr($widget_id),
        $script_url,
        $data_attrs
    );
}
add_shortcode('reserved-booking', 'reserved_booking_shortcode');

/**
 * Registrace Gutenberg blocku.
 */
function reserved_booking_register_block() {
    if (!function_exists('register_block_type')) {
        return;
    }

    wp_register_script(
        'reserved-booking-block',
        plugins_url('block.js', __FILE__),
        ['wp-blocks', 'wp-element', 'wp-i18n', 'wp-block-editor', 'wp-components'],
        RESERVED_BOOKING_VERSION,
        true
    );

    register_block_type('reserved/booking', [
        'editor_script'   => 'reserved-booking-block',
        'render_callback' => 'reserved_booking_render_block',
        'attributes'      => [
            'slug'        => ['type' => 'string', 'default' => ''],
            'lang'        => ['type' => 'string', 'default' => 'cs'],
            'mode'        => ['type' => 'string', 'default' => 'inline'],
            'buttonText'  => ['type' => 'string', 'default' => 'Rezervovat'],
            'buttonColor' => ['type' => 'string', 'default' => '#3b82f6'],
        ],
    ]);
}
add_action('init', 'reserved_booking_register_block');

/**
 * Render callback — voláno z Gutenbergu pro server-side render.
 */
function reserved_booking_render_block($attributes) {
    $atts = [
        'slug'         => $attributes['slug'] ?? '',
        'lang'         => $attributes['lang'] ?? 'cs',
        'mode'         => $attributes['mode'] ?? 'inline',
        'button'       => $attributes['buttonText'] ?? 'Rezervovat',
        'button_color' => $attributes['buttonColor'] ?? '#3b82f6',
    ];
    return reserved_booking_shortcode($atts);
}

/**
 * Settings page pod Settings → Reserved Booking.
 */
function reserved_booking_add_settings_page() {
    add_options_page(
        __('Reserved Booking', 'reserved-booking'),
        __('Reserved Booking', 'reserved-booking'),
        'manage_options',
        'reserved-booking',
        'reserved_booking_render_settings_page'
    );
}
add_action('admin_menu', 'reserved_booking_add_settings_page');

function reserved_booking_register_settings() {
    register_setting('reserved_booking', 'reserved_booking_widget_url', [
        'type'              => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default'           => RESERVED_BOOKING_DEFAULT_WIDGET_URL,
    ]);
}
add_action('admin_init', 'reserved_booking_register_settings');

function reserved_booking_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1><?php esc_html_e('Reserved Booking — nastavení', 'reserved-booking'); ?></h1>

        <form method="post" action="options.php">
            <?php settings_fields('reserved_booking'); ?>
            <table class="form-table">
                <tr>
                    <th scope="row">
                        <label for="reserved_booking_widget_url">
                            <?php esc_html_e('URL widgetu', 'reserved-booking'); ?>
                        </label>
                    </th>
                    <td>
                        <input
                            type="url"
                            id="reserved_booking_widget_url"
                            name="reserved_booking_widget_url"
                            value="<?php echo esc_attr(get_option('reserved_booking_widget_url', RESERVED_BOOKING_DEFAULT_WIDGET_URL)); ?>"
                            class="regular-text"
                        />
                        <p class="description">
                            <?php esc_html_e('Default: https://widget.reserved.cz. Pokud máš vlastní doménu, zadej ji.', 'reserved-booking'); ?>
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>

        <hr/>

        <h2><?php esc_html_e('Jak vložit widget', 'reserved-booking'); ?></h2>

        <h3>1. <?php esc_html_e('Shortcode (klasický editor / TinyMCE)', 'reserved-booking'); ?></h3>
        <p><?php esc_html_e('Vlož do stránky / příspěvku:', 'reserved-booking'); ?></p>
        <pre style="background:#f6f7f7;padding:12px;border-radius:4px;">[reserved-booking slug="muj-salon"]</pre>

        <h3>2. <?php esc_html_e('S parametry', 'reserved-booking'); ?></h3>
        <pre style="background:#f6f7f7;padding:12px;border-radius:4px;">[reserved-booking slug="muj-salon" lang="en" mode="modal" button="Book now" button_color="#FF6B6B"]</pre>

        <h3>3. <?php esc_html_e('Gutenberg block', 'reserved-booking'); ?></h3>
        <p><?php esc_html_e('V block inserteru hledej "Reserved Booking".', 'reserved-booking'); ?></p>

        <h3>4. <?php esc_html_e('PHP v šabloně', 'reserved-booking'); ?></h3>
        <pre style="background:#f6f7f7;padding:12px;border-radius:4px;">&lt;?php echo do_shortcode('[reserved-booking slug="muj-salon"]'); ?&gt;</pre>

        <hr/>

        <h2><?php esc_html_e('Atributy', 'reserved-booking'); ?></h2>
        <table class="widefat striped">
            <thead>
                <tr><th><?php esc_html_e('Atribut', 'reserved-booking'); ?></th><th><?php esc_html_e('Default', 'reserved-booking'); ?></th><th><?php esc_html_e('Popis', 'reserved-booking'); ?></th></tr>
            </thead>
            <tbody>
                <tr><td><code>slug</code></td><td>—</td><td><?php esc_html_e('Tvůj tenant slug (povinné)', 'reserved-booking'); ?></td></tr>
                <tr><td><code>lang</code></td><td><code>cs</code></td><td><?php esc_html_e('Jazyk widgetu (cs / en)', 'reserved-booking'); ?></td></tr>
                <tr><td><code>mode</code></td><td><code>inline</code></td><td><?php esc_html_e('inline / modal / button', 'reserved-booking'); ?></td></tr>
                <tr><td><code>button</code></td><td><code>Rezervovat</code></td><td><?php esc_html_e('Text tlačítka (jen pro modal/button)', 'reserved-booking'); ?></td></tr>
                <tr><td><code>button_color</code></td><td><code>#3b82f6</code></td><td><?php esc_html_e('Barva tlačítka', 'reserved-booking'); ?></td></tr>
                <tr><td><code>max_width</code></td><td><code>600</code></td><td><?php esc_html_e('Max šířka widgetu v px', 'reserved-booking'); ?></td></tr>
            </tbody>
        </table>
    </div>
    <?php
}
