import { describe, expect, it } from 'vitest';
import {
  blueOf,
  greenOf,
  hslToRgb,
  hueDistance,
  luminance,
  redOf,
  rgbToHsl,
} from './colorMath';

describe('color math', () => {
  it('round-trips representative RGB colors through HSL', () => {
    const colors = [
      0xff0000,
      0xffff00,
      0x00ff00,
      0x00ffff,
      0x0000ff,
      0xff00ff,
      0x123456,
      0xb4601f,
      0x6e6e6e,
      0x010101,
      0xfefefe,
    ];

    colors.forEach((color) => {
      const hsl = rgbToHsl(color);
      const result = hslToRgb(hsl.hue, hsl.saturation, hsl.lightness);
      expect(Math.abs(redOf(result) - redOf(color))).toBeLessThanOrEqual(1);
      expect(Math.abs(greenOf(result) - greenOf(color))).toBeLessThanOrEqual(1);
      expect(Math.abs(blueOf(result) - blueOf(color))).toBeLessThanOrEqual(1);
    });
  });

  it('uses WCAG relative luminance', () => {
    expect(luminance(0x000000)).toBeCloseTo(0, 8);
    expect(luminance(0xffffff)).toBeCloseTo(1, 3);
    expect(luminance(0x00ff00)).toBeGreaterThan(luminance(0x0000ff));
  });

  it('measures the shortest distance around the hue wheel', () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(30, 190)).toBe(160);
  });
});

