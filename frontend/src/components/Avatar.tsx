import { useEffect, useState } from 'react';
import { isApiConfigured, profilePhotoUrl } from '../lib/api';
import { initialsOf } from '../lib/initials';

/**
 * The inside of an avatar circle: the person's photo, or their initials when there is none or it fails to load.
 * The surrounding element keeps its own size, colour and shape; `.av-img` fills it.
 */
export default function Avatar({ name, photoId }: { name: string; photoId?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoId]);
  if (!photoId || failed || !isApiConfigured()) return <>{initialsOf(name)}</>;
  return <img className="av-img" src={profilePhotoUrl(photoId)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)}/>;
}
