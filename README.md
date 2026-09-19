# 图片氛围背景生成器

一个完全在浏览器本地运行的图片氛围背景生成器。选择一张照片后，网页会提取主色并生成带有静态 Mesh、饱和模糊图和动态可读性遮罩的背景。生成结果会铺满整个浏览器，原图则以居中封面形式呈现。

## 功能

- 拖放或选择 PNG、JPEG、WebP
- 沉浸式全屏预览，切换图片时平滑过渡
- 在右上角导出菜单中选择竖屏、方形、横屏三种尺寸
- 在导出菜单中展示主色与四个 Mesh 角点色
- 下载对应尺寸的 PNG
- 图片不离开浏览器，不请求后端接口

## 本地运行

要求 Node.js 20.19 或以上。

```bash
npm install
npm run dev
```

浏览器打开终端给出的本地地址即可。生产构建与测试：

```bash
npm test
npm run build
npm run preview
```

## 算法

图片会并行派生为两个低分辨率缓冲：

```text
图片
  ├─ 152px 保比例缓冲
  │    └─ 中心正方形采样
  │         └─ 六区域 HSL 分桶 → 主色 / 平均亮度 / Mesh 色 / 遮罩
  └─ 256px 保比例缓冲
       └─ 饱和度 1.8 → alpha 加权 box blur [17, 17, 18]
```

最终背景从下到上的层序为：

1. 语义底色 `#5E6F63`
2. 四角静态 Mesh，Alpha `0.55`
3. 模糊图片，居中裁切铺满，Alpha `0.92`
4. 根据平均 WCAG 亮度计算的黑色遮罩

取色只忽略 Alpha 小于 `190` 的样本；纯黑、纯白和高光仍参与分桶与亮度计算。四个 Mesh 颜色按左上、右上、左下、右下排列，相对主色色相偏移分别为 `-22°`、`+28°`、`+52°`、`-58°`。

## 作为模块使用

高层浏览器接口位于 `src/ambient/index.ts`：

```ts
import {
  analyzeAmbientImage,
  generateAmbientBackground,
} from './src/ambient';

const analysis = await analyzeAmbientImage(file);

const result = await generateAmbientBackground(file, {
  width: 1080,
  height: 1920,
});

document.body.append(result.canvas);
console.log(result.analysis.dominantColor);
```

### `analyzeAmbientImage(source)`

接受 `Blob`、`File`、`ImageBitmap`、`HTMLImageElement`、`HTMLCanvasElement` 或 `OffscreenCanvas`，返回：

```ts
interface AmbientAnalysis {
  dominantColor: string;
  meshColors: readonly [string, string, string, string];
  averageLuminance: number;
  scrimAlpha: number;
}
```

### `generateAmbientBackground(source, options)`

返回生成后的 Canvas 和同一份分析结果：

```ts
interface AmbientRenderResult {
  canvas: HTMLCanvasElement;
  analysis: AmbientAnalysis;
}
```

传入外部网页中的 `HTMLImageElement` 时，图片仍需满足浏览器 Canvas 的同源/CORS 规则；直接传入用户选择的 `File` 不受此限制。

## 项目结构

```text
src/
  ambient/
    browser.ts          图片解码、Canvas 派生与最终合成
    palette.ts          六区域取色与遮罩计算
    imageProcessing.ts  饱和、模糊、Mesh 和几何
    colorMath.ts        RGB/HSL 与 WCAG 亮度
    index.ts            对外接口
  main.ts               演示网页交互
  style.css             演示网页样式
```

测试素材均由代码生成，不包含第三方照片。

## 隐私

网页没有上传、分析或遥测接口。图片解码、取色、合成和下载全部在当前浏览器标签页中完成。

## 许可证

当前仓库暂未附加开源许可证。公开发布前请由仓库所有者选择适当的许可证。
