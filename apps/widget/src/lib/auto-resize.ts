// Sprint 8.1: Auto-resize iframe — widget posílá svou výšku rodičovskému oknu.
//
// Parent (web tenanta) musí naslouchat na message:
//   window.addEventListener('message', (e) => {
//     if (e.data?.type === 'reserved:resize') {
//       iframe.style.height = e.data.height + 'px';
//     }
//   });
//
// Náš embed snippet (z admin UI) tohle dělá automaticky.

export function initAutoResize(): () => void {
  if (typeof window === 'undefined' || window.parent === window) {
    // Není v iframu, nic neděláme.
    return () => undefined;
  }

  function sendHeight(): void {
    const height = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
    );
    window.parent.postMessage({ type: 'reserved:resize', height }, '*');
  }

  // První odeslání po načtení
  sendHeight();

  // Po každé změně velikosti DOM
  const observer = new ResizeObserver(() => sendHeight());
  observer.observe(document.body);

  // Také při window resize (orientace, zoom)
  const onResize = (): void => sendHeight();
  window.addEventListener('resize', onResize);

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', onResize);
  };
}
