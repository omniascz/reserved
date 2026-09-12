/**
 * Reserved Booking — Gutenberg block.
 * Registrace bloku "reserved/booking" s editorem v sidebar.
 */
(function (blocks, element, i18n, blockEditor, components) {
  var el = element.createElement;
  var __ = i18n.__;
  var InspectorControls = blockEditor.InspectorControls;
  var PanelBody = components.PanelBody;
  var TextControl = components.TextControl;
  var SelectControl = components.SelectControl;

  blocks.registerBlockType('reserved/booking', {
    title: __('Reserved Booking', 'reserved-booking'),
    description: __('Online rezervační widget od Reserved.cz', 'reserved-booking'),
    icon: 'calendar-alt',
    category: 'widgets',
    keywords: ['booking', 'rezervace', 'reserved', 'kalendar'],
    attributes: {
      slug: { type: 'string', default: '' },
      lang: { type: 'string', default: 'cs' },
      mode: { type: 'string', default: 'inline' },
      buttonText: { type: 'string', default: 'Rezervovat' },
      buttonColor: { type: 'string', default: '#3b82f6' },
    },

    edit: function (props) {
      var attrs = props.attributes;
      var setAttr = function (key) {
        return function (value) {
          var update = {};
          update[key] = value;
          props.setAttributes(update);
        };
      };

      return el(
        'div',
        { className: props.className },
        el(
          InspectorControls,
          {},
          el(
            PanelBody,
            { title: __('Nastavení widgetu', 'reserved-booking'), initialOpen: true },
            el(TextControl, {
              label: __('Tenant slug', 'reserved-booking'),
              value: attrs.slug,
              onChange: setAttr('slug'),
              help: __('Identifikátor salonu, např. "muj-salon"', 'reserved-booking'),
            }),
            el(SelectControl, {
              label: __('Jazyk', 'reserved-booking'),
              value: attrs.lang,
              options: [
                { label: 'Čeština', value: 'cs' },
                { label: 'English', value: 'en' },
              ],
              onChange: setAttr('lang'),
            }),
            el(SelectControl, {
              label: __('Režim zobrazení', 'reserved-booking'),
              value: attrs.mode,
              options: [
                { label: __('Inline (přímo na stránce)', 'reserved-booking'), value: 'inline' },
                { label: __('Modal (popup po kliku)', 'reserved-booking'), value: 'modal' },
                { label: __('Tlačítko (nové okno)', 'reserved-booking'), value: 'button' },
              ],
              onChange: setAttr('mode'),
            }),
            (attrs.mode === 'modal' || attrs.mode === 'button') &&
              el(TextControl, {
                label: __('Text tlačítka', 'reserved-booking'),
                value: attrs.buttonText,
                onChange: setAttr('buttonText'),
              }),
            (attrs.mode === 'modal' || attrs.mode === 'button') &&
              el(TextControl, {
                label: __('Barva tlačítka (hex)', 'reserved-booking'),
                value: attrs.buttonColor,
                onChange: setAttr('buttonColor'),
                help: __('Např. #3b82f6', 'reserved-booking'),
              }),
          ),
        ),
        // Preview v editoru
        el(
          'div',
          {
            style: {
              padding: '24px',
              background: '#f6f7f7',
              border: '2px dashed #ccd',
              borderRadius: '8px',
              textAlign: 'center',
            },
          },
          el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '📅'),
          el(
            'div',
            { style: { fontWeight: 'bold', marginBottom: '4px' } },
            __('Reserved Booking', 'reserved-booking'),
          ),
          attrs.slug
            ? el(
                'div',
                { style: { fontSize: '13px', color: '#666' } },
                __('Slug: ', 'reserved-booking') + attrs.slug + ' · ' + attrs.mode,
              )
            : el(
                'div',
                { style: { fontSize: '13px', color: '#c00' } },
                __('⚠️ Nastav slug v pravém panelu', 'reserved-booking'),
              ),
        ),
      );
    },

    save: function () {
      // Server-side render — vrátíme null, PHP render_callback se postará.
      return null;
    },
  });
})(window.wp.blocks, window.wp.element, window.wp.i18n, window.wp.blockEditor, window.wp.components);
