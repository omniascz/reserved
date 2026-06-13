/*!
 * Reserved Embed SDK v1
 *
 * 1-liner embed:
 *   <script src="https://widget.reserved.cz/embed.js" data-slug="salon-petra" defer></script>
 *
 * Auto-injects iframe na pozici tagu, handluje auto-resize, supportuje
 * tlacitka, modaly a více widgetů na jedne strance.
 *
 * Atributy:
 *   data-slug          tenant slug (povinné)
 *   data-lang          'cs' | 'en' (default 'cs')
 *   data-view          'booking' (default, průvodce) | 'timetable' (rozvrh lekcí)
 *   data-mode          'inline' (default) | 'button' | 'modal'
 *   data-button-text   text tlačítka pro mode=button/modal (default 'Rezervovat')
 *   data-button-color  barva tlačítka (default tenant theme nebo #3b82f6)
 *   data-container     CSS selector kam vložit iframe (default = vedle <script>)
 *   data-max-width     max šířka iframe v px (default 600)
 *   data-height        výchozí výška před auto-resize (default 600)
 *
 * Příklady:
 *   <script src=".../embed.js" data-slug="petra-salon"></script>
 *   <script src=".../embed.js" data-slug="petra-salon" data-mode="modal" data-button-text="Objednat"></script>
 *   <script src=".../embed.js" data-slug="petra-salon" data-container="#booking"></script>
 */
(function () {
  'use strict';

  // Odvozeni base URL z tohoto skriptu (kde je hostovan, tam je i widget)
  var thisScript = document.currentScript;
  if (!thisScript) {
    // Fallback pro starsi browser nebo dynamic load
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('/embed.js') !== -1) {
        thisScript = scripts[i];
        break;
      }
    }
  }
  if (!thisScript) {
    console.error('[Reserved] embed.js: cannot determine script element');
    return;
  }

  var WIDGET_BASE = thisScript.src.replace(/\/embed\.js.*$/, '');

  var slug = thisScript.getAttribute('data-slug');
  if (!slug) {
    console.error('[Reserved] embed.js: missing data-slug attribute');
    return;
  }

  var lang = thisScript.getAttribute('data-lang') || 'cs';
  var mode = thisScript.getAttribute('data-mode') || 'inline';
  var buttonText = thisScript.getAttribute('data-button-text') || 'Rezervovat';
  var buttonColor = thisScript.getAttribute('data-button-color') || '#3b82f6';
  var containerSelector = thisScript.getAttribute('data-container');
  var maxWidth = parseInt(thisScript.getAttribute('data-max-width') || '600', 10);
  var initialHeight = parseInt(thisScript.getAttribute('data-height') || '600', 10);
  // data-view: 'booking' (default, průvodce rezervací) | 'timetable' (rozvrh lekcí)
  var view = thisScript.getAttribute('data-view') || 'booking';

  var path = '/' + encodeURIComponent(slug) + (view === 'timetable' ? '/timetable' : '');
  var widgetUrl = WIDGET_BASE + path + (lang === 'en' ? '?lang=en' : '');

  // Unikátní ID pro tento embed (umožní více widgetů na jedné stránce)
  var widgetId = 'rw-' + Math.random().toString(36).slice(2, 9);

  function createIframe() {
    var iframe = document.createElement('iframe');
    iframe.id = widgetId;
    iframe.src = widgetUrl;
    iframe.style.width = '100%';
    iframe.style.maxWidth = maxWidth + 'px';
    iframe.style.height = initialHeight + 'px';
    iframe.style.border = '0';
    iframe.style.display = 'block';
    iframe.title = 'Online rezervace';
    iframe.setAttribute('loading', 'lazy');
    return iframe;
  }

  function injectInline() {
    var iframe = createIframe();
    var target = containerSelector ? document.querySelector(containerSelector) : thisScript.parentNode;
    if (!target) {
      console.error('[Reserved] embed.js: container not found: ' + containerSelector);
      return;
    }
    if (containerSelector) {
      target.innerHTML = '';
      target.appendChild(iframe);
    } else {
      thisScript.parentNode.insertBefore(iframe, thisScript);
    }
  }

  function injectButton() {
    var btn = document.createElement('a');
    btn.href = widgetUrl;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = buttonText;
    btn.style.cssText =
      'display:inline-block;background:' +
      buttonColor +
      ';color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:system-ui,sans-serif;';
    var target = containerSelector ? document.querySelector(containerSelector) : thisScript.parentNode;
    if (target === thisScript.parentNode) {
      target.insertBefore(btn, thisScript);
    } else {
      target.innerHTML = '';
      target.appendChild(btn);
    }
  }

  function injectModal() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = buttonText;
    btn.style.cssText =
      'display:inline-block;background:' +
      buttonColor +
      ';color:#fff;padding:12px 24px;border-radius:8px;border:0;cursor:pointer;font-weight:600;font-family:system-ui,sans-serif;';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal();
    });

    var target = containerSelector ? document.querySelector(containerSelector) : thisScript.parentNode;
    if (target === thisScript.parentNode) {
      target.insertBefore(btn, thisScript);
    } else {
      target.innerHTML = '';
      target.appendChild(btn);
    }
  }

  function openModal() {
    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.id = widgetId + '-backdrop';
    backdrop.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999998;display:flex;align-items:center;justify-content:center;padding:20px;';

    // Modal box
    var modal = document.createElement('div');
    modal.style.cssText =
      'background:#fff;border-radius:12px;max-width:' +
      maxWidth +
      'px;width:100%;max-height:90vh;overflow:hidden;position:relative;z-index:999999;';

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Zavřít');
    closeBtn.style.cssText =
      'position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:50%;background:#fff;border:1px solid #e5e7eb;cursor:pointer;font-size:20px;z-index:2;';
    closeBtn.addEventListener('click', closeModal);
    modal.appendChild(closeBtn);

    // Iframe
    var iframe = createIframe();
    iframe.style.maxWidth = '100%';
    iframe.style.height = '90vh';
    modal.appendChild(iframe);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });

    document.addEventListener('keydown', escListener);
  }

  function escListener(e) {
    if (e.key === 'Escape') closeModal();
  }

  function closeModal() {
    var backdrop = document.getElementById(widgetId + '-backdrop');
    if (backdrop) backdrop.remove();
    document.removeEventListener('keydown', escListener);
  }

  // Auto-resize listener (globalní, pro vsechny widgety na strance)
  // Inicializovan jen jednou aby více widgetů zacelilo
  if (!window.__reservedEmbedResizeBound) {
    window.__reservedEmbedResizeBound = true;
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'reserved:resize') return;
      // Najdi vsechny Reserved iframes a aktualizuj výšku
      var iframes = document.querySelectorAll('iframe[id^="rw-"]');
      iframes.forEach(function (frame) {
        if (frame.contentWindow === e.source) {
          frame.style.height = e.data.height + 'px';
        }
      });
    });
  }

  // Spustit dle mode
  if (mode === 'button') {
    injectButton();
  } else if (mode === 'modal') {
    injectModal();
  } else {
    injectInline();
  }
})();
