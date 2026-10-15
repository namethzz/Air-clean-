/** Fills [data-contact] with the address set in VITE_CONTACT_EMAIL at build time; the fallback text stays otherwise. */
const contact = ((import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? '').trim();
if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
  document.querySelectorAll<HTMLElement>('[data-contact]').forEach(element => {
    const link = document.createElement('a');
    link.href = 'mailto:' + contact;
    link.textContent = contact;
    element.replaceChildren(link);
  });
}
