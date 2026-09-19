export interface HslColor {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function packRgb(red: number, green: number, blue: number): number {
  return (
    (clamp(Math.round(red), 0, 255) << 16)
    | (clamp(Math.round(green), 0, 255) << 8)
    | clamp(Math.round(blue), 0, 255)
  ) >>> 0;
}

export function redOf(rgb: number): number {
  return (rgb >>> 16) & 0xff;
}

export function greenOf(rgb: number): number {
  return (rgb >>> 8) & 0xff;
}

export function blueOf(rgb: number): number {
  return rgb & 0xff;
}

export function rgbToHex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
}

export function rgbToHsl(rgb: number): HslColor {
  const red = redOf(rgb);
  const green = greenOf(rgb);
  const blue = blueOf(rgb);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const maximumFloat = maximum / 255;
  const minimumFloat = minimum / 255;
  const lightness = (maximum + minimum) / 510;

  if (maximum === minimum) {
    return { hue: 0, saturation: 0, lightness };
  }

  const delta = (maximum - minimum) / 255;
  const saturation = lightness > 0.5
    ? delta / (2 - maximumFloat - minimumFloat)
    : delta / (maximumFloat + minimumFloat);

  const redFloat = red / 255;
  const greenFloat = green / 255;
  const blueFloat = blue / 255;
  let hue: number;
  if (maximum === red) {
    hue = ((greenFloat - blueFloat) / delta) % 6;
  } else if (maximum === green) {
    hue = (blueFloat - redFloat) / delta + 2;
  } else {
    hue = (redFloat - greenFloat) / delta + 4;
  }
  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  return {
    hue,
    saturation: clamp(saturation, 0, 1),
    lightness: clamp(lightness, 0, 1),
  };
}

export function hslToRgb(hue: number, saturation: number, lightness: number): number {
  const normalizedHue = ((((hue % 360) + 360) % 360) / 360);
  const safeSaturation = clamp(saturation, 0, 1);
  const safeLightness = clamp(lightness, 0, 1);

  if (safeSaturation <= 0) {
    const channel = Math.round(safeLightness * 255);
    return packRgb(channel, channel, channel);
  }

  const q = safeLightness < 0.5
    ? safeLightness * (1 + safeSaturation)
    : safeLightness + safeSaturation - safeLightness * safeSaturation;
  const p = 2 * safeLightness - q;
  return packRgb(
    hueChannel(p, q, normalizedHue + 1 / 3) * 255,
    hueChannel(p, q, normalizedHue) * 255,
    hueChannel(p, q, normalizedHue - 1 / 3) * 255,
  );
}

export function luminance(rgb: number): number {
  return (
    0.2126 * linearChannel(redOf(rgb))
    + 0.7152 * linearChannel(greenOf(rgb))
    + 0.0722 * linearChannel(blueOf(rgb))
  );
}

export function hueDistance(first: number, second: number): number {
  const distance = Math.abs(first - second) % 360;
  return distance > 180 ? 360 - distance : distance;
}

export function blendRgb(first: number, second: number, amount: number): number {
  const ratio = clamp(amount, 0, 1);
  return packRgb(
    redOf(first) + (redOf(second) - redOf(first)) * ratio,
    greenOf(first) + (greenOf(second) - greenOf(first)) * ratio,
    blueOf(first) + (blueOf(second) - blueOf(first)) * ratio,
  );
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function hueChannel(p: number, q: number, input: number): number {
  let value = input;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

