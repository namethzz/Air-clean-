import { describe, expect, it } from 'vitest';
import { clampCrop, scaleFor, turn, turnedSize, zoomTo } from './crop';

const start = { zoom: 1, x: 0, y: 0, rotation: 0 as const };

describe('crop', () => {
  it('fills the viewport with the short side at zoom 1', () => {
    expect(scaleFor(1200, 800, 300, start)).toBeCloseTo(300 / 800);
    expect(scaleFor(800, 1200, 300, start)).toBeCloseTo(300 / 800);
  });
  it('swaps width and height on a quarter turn', () => {
    expect(turnedSize(1200, 800, 90)).toEqual([800, 1200]);
    expect(turnedSize(1200, 800, 180)).toEqual([1200, 800]);
  });
  it('never leaves an empty edge', () => {
    // 1200×800 at zoom 1 in a 300 box is 450×300: it can slide 75px sideways and not at all up or down.
    expect(clampCrop({ ...start, x: 500, y: -40 }, 1200, 800, 300)).toEqual({ ...start, x: 75, y: 0 });
    expect(clampCrop({ ...start, x: -500, y: 0 }, 1200, 800, 300).x).toBe(-75);
  });
  it('keeps zoom between 1 and 4', () => {
    expect(clampCrop({ ...start, zoom: 0.2 }, 1000, 1000, 300).zoom).toBe(1);
    expect(clampCrop({ ...start, zoom: 9 }, 1000, 1000, 300).zoom).toBe(4);
    expect(clampCrop({ ...start, zoom: Number.NaN }, 1000, 1000, 300).zoom).toBe(1);
  });
  it('zooms about the centre', () => {
    const moved = clampCrop({ ...start, zoom: 2, x: 40, y: 20 }, 1000, 1000, 300);
    const closer = zoomTo(moved, 3, 1000, 1000, 300);
    expect(closer.x).toBeCloseTo(60);
    expect(closer.y).toBeCloseTo(30);
  });
  it('turns a quarter at a time and starts the framing again', () => {
    expect(turn({ zoom: 2, x: 10, y: 5, rotation: 270 })).toEqual({ zoom: 1, x: 0, y: 0, rotation: 0 });
    expect(turn(start).rotation).toBe(90);
  });
});
