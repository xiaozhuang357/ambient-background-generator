export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  /** RGBA，按行存储。 */
  readonly data: Uint8ClampedArray;
}

export type MeshColors = readonly [string, string, string, string];

export interface AmbientAnalysis {
  /** 主色，格式为 #RRGGBB。 */
  readonly dominantColor: string;
  /** 左上、右上、左下、右下四个 Mesh 角点色。 */
  readonly meshColors: MeshColors;
  /** WCAG 相对亮度，范围 0–1。 */
  readonly averageLuminance: number;
  /** 黑色可读性遮罩的 alpha，范围 54–120。 */
  readonly scrimAlpha: number;
}

export interface AmbientRenderOptions {
  readonly width: number;
  readonly height: number;
}

export interface AmbientRenderResult {
  readonly canvas: HTMLCanvasElement;
  readonly analysis: AmbientAnalysis;
}

export type AmbientImageSource =
  | Blob
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas;

