/**
 * Square crop for profile photos. The photo is drawn centred in a square viewport, turned by `rotation`,
 * scaled so its short side fills the viewport (`zoom` 1) or more, and moved by `x`/`y` screen pixels.
 * The same transform draws the on-screen preview and the uploaded file, so what you see is what is saved.
 */
export type Rotation = 0 | 90 | 180 | 270;
export interface CropState { zoom: number; x: number; y: number; rotation: Rotation }
export const MAX_ZOOM = 4;

/** Width and height once the photo is turned. */
export function turnedSize(width: number, height: number, rotation: Rotation): [number, number] {
  return rotation % 180 === 0 ? [width, height] : [height, width];
}

/** Screen pixels per photo pixel at this zoom. */
export function scaleFor(width: number, height: number, view: number, state: Pick<CropState, 'zoom' | 'rotation'>): number {
  const [w, h] = turnedSize(width, height, state.rotation);
  return (view / Math.min(w, h)) * state.zoom;
}

/** Keeps zoom in range and the photo covering the whole viewport (no empty edges). */
export function clampCrop(state: CropState, width: number, height: number, view: number): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Number.isFinite(state.zoom) ? state.zoom : 1));
  const scale = scaleFor(width, height, view, { zoom, rotation: state.rotation });
  const [w, h] = turnedSize(width, height, state.rotation);
  const maxX = Math.max(0, (w * scale - view) / 2), maxY = Math.max(0, (h * scale - view) / 2);
  const clamp = (value: number, max: number) => Math.min(max, Math.max(-max, Number.isFinite(value) ? value : 0)) || 0;
  return { zoom, rotation: state.rotation, x: clamp(state.x, maxX), y: clamp(state.y, maxY) };
}

/** Zooms about the viewport centre: the point in the middle stays in the middle. */
export function zoomTo(state: CropState, zoom: number, width: number, height: number, view: number): CropState {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const ratio = next / state.zoom;
  return clampCrop({ ...state, zoom: next, x: state.x * ratio, y: state.y * ratio }, width, height, view);
}

/** A quarter turn clockwise; the photo goes back to filling the viewport. */
export function turn(state: CropState): CropState {
  return { zoom: 1, x: 0, y: 0, rotation: ((state.rotation + 90) % 360) as Rotation };
}

/** Draws the cropped photo into a `size`×`size` square (the preview canvas or the file to upload). */
export function drawCrop(context: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, view: number, size: number, state: CropState): void {
  const scale = scaleFor(width, height, view, state);
  context.save();
  context.clearRect(0, 0, size, size);
  context.imageSmoothingQuality = 'high';
  context.translate(size / 2, size / 2);
  context.scale(size / view, size / view);
  context.translate(state.x, state.y);
  context.rotate((state.rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}
