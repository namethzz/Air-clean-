/**
 * Two letters for an avatar. Latin names take the first letter of the first and last name ("Nameth Wongmongkol" → "NW");
 * Thai names take the start of the first name, skipping a leading vowel sign so "เอกชัย" reads "อก" rather than "เอ".
 */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(part => part && part !== '-');
  if (!parts.length) return 'ช';
  if (/^[A-Za-z]/.test(parts[0])) {
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
    return letters.toUpperCase();
  }
  const consonants = parts[0].replace(/^[เ-ไ]/, '');
  return consonants.slice(0, 2) || parts[0].slice(0, 2);
}
