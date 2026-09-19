import './style.css';
import { generateAmbientBackground } from './ambient';
import type { AmbientAnalysis } from './ambient';

interface OutputPreset {
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly shortLabel: string;
}

const OUTPUT_PRESETS: Record<string, OutputPreset> = {
  portrait: {
    width: 1080,
    height: 1920,
    label: '竖屏 · 1080 × 1920',
    shortLabel: '1080×1920',
  },
  square: {
    width: 1080,
    height: 1080,
    label: '方形 · 1080 × 1080',
    shortLabel: '1080×1080',
  },
  landscape: {
    width: 1920,
    height: 1080,
    label: '横屏 · 1920 × 1080',
    shortLabel: '1920×1080',
  },
};

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SUPPORTED_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 根节点');

app.innerHTML = `
  <main class="ambient-shell" id="ambient-shell">
    <div class="initial-wash" aria-hidden="true"></div>
    <div class="background-stack" id="background-stack" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>

    <header class="top-bar">
      <button class="wordmark" id="wordmark" type="button" aria-label="选择图片">
        <span class="wordmark-dot" aria-hidden="true"></span>
        <span>Ambient</span>
      </button>

      <button
        class="settings-trigger glass-control"
        id="settings-trigger"
        type="button"
        aria-label="打开导出设置"
        aria-controls="settings-panel"
        aria-expanded="false"
        disabled
      >
        <span></span><span></span><span></span>
      </button>
    </header>

    <section class="experience" aria-live="polite">
      <div class="welcome" id="welcome">
        <label class="upload-trigger" for="file-input">
          <span class="upload-orb" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 16V5m0 0L8 9m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
          </span>
          <strong>选择一张图片</strong>
          <small>让颜色自然铺满整个空间</small>
        </label>
      </div>

      <div class="artwork-view" id="artwork-view" hidden>
        <button class="artwork-button" id="artwork-button" type="button" aria-label="更换图片">
          <span class="artwork-frame">
            <img id="artwork-image" alt="当前图片" />
          </span>
          <span class="replace-hint">点按图片以更换</span>
        </button>
      </div>
    </section>

    <div class="processing-pill" id="processing-pill" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>正在感受图片的颜色</span>
    </div>

    <aside class="settings-panel" id="settings-panel" aria-hidden="true">
      <div class="settings-heading">
        <div>
          <span class="panel-kicker">EXPORT</span>
          <h2>导出背景</h2>
        </div>
        <span class="privacy-badge">仅本地处理</span>
      </div>

      <fieldset class="resolution-list">
        <legend>分辨率</legend>
        <label>
          <input type="radio" name="resolution" value="portrait" checked />
          <span class="ratio-icon portrait" aria-hidden="true"></span>
          <span><strong>竖屏</strong><small>1080 × 1920</small></span>
          <i aria-hidden="true"></i>
        </label>
        <label>
          <input type="radio" name="resolution" value="square" />
          <span class="ratio-icon square" aria-hidden="true"></span>
          <span><strong>方形</strong><small>1080 × 1080</small></span>
          <i aria-hidden="true"></i>
        </label>
        <label>
          <input type="radio" name="resolution" value="landscape" />
          <span class="ratio-icon landscape" aria-hidden="true"></span>
          <span><strong>横屏</strong><small>1920 × 1080</small></span>
          <i aria-hidden="true"></i>
        </label>
      </fieldset>

      <button class="download-button" id="download-button" type="button">
        <span>下载 PNG</span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" />
        </svg>
      </button>
      <button class="replace-button" id="replace-button" type="button">选择其他图片</button>

      <div class="color-note">
        <div class="palette-dots" id="palette-dots" aria-label="提取到的颜色"></div>
        <div class="file-note">
          <strong id="file-name"></strong>
          <span id="file-meta"></span>
        </div>
      </div>
    </aside>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>

    <div class="drop-overlay" id="drop-overlay" aria-hidden="true">
      <div>
        <span>＋</span>
        <strong>松开以感受这张图片</strong>
      </div>
    </div>

    <input
      class="visually-hidden"
      id="file-input"
      type="file"
      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
    />
  </main>
`;

const shell = requiredElement<HTMLElement>('#ambient-shell');
const fileInput = requiredElement<HTMLInputElement>('#file-input');
const wordmark = requiredElement<HTMLButtonElement>('#wordmark');
const settingsTrigger = requiredElement<HTMLButtonElement>('#settings-trigger');
const settingsPanel = requiredElement<HTMLElement>('#settings-panel');
const backgroundStack = requiredElement<HTMLDivElement>('#background-stack');
const welcome = requiredElement<HTMLDivElement>('#welcome');
const artworkView = requiredElement<HTMLDivElement>('#artwork-view');
const artworkButton = requiredElement<HTMLButtonElement>('#artwork-button');
const artworkImage = requiredElement<HTMLImageElement>('#artwork-image');
const downloadButton = requiredElement<HTMLButtonElement>('#download-button');
const replaceButton = requiredElement<HTMLButtonElement>('#replace-button');
const paletteDots = requiredElement<HTMLDivElement>('#palette-dots');
const fileName = requiredElement<HTMLElement>('#file-name');
const fileMeta = requiredElement<HTMLElement>('#file-meta');
const toast = requiredElement<HTMLDivElement>('#toast');

let selectedFile: File | null = null;
let artworkObjectUrl: string | null = null;
let activeBackgroundLayer: HTMLDivElement | null = null;
let selectionVersion = 0;
let previewRun = 0;
let toastTimer = 0;
let resizeTimer = 0;
const downloadCache = new Map<string, Blob>();

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void selectFile(file);
});

wordmark.addEventListener('click', openFileChooser);
artworkButton.addEventListener('click', openFileChooser);
replaceButton.addEventListener('click', () => {
  setSettingsOpen(false);
  openFileChooser();
});

settingsTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  setSettingsOpen(!settingsPanel.classList.contains('is-open'));
});

settingsPanel.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', () => setSettingsOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSettingsOpen(false);
});

document.querySelectorAll<HTMLInputElement>('input[name="resolution"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    showToast(`将导出 ${currentPreset().label}`);
  });
});

downloadButton.addEventListener('click', () => void downloadSelectedBackground());

let dragDepth = 0;
window.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  shell.classList.add('is-dragging');
});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) shell.classList.remove('is-dragging');
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  shell.classList.remove('is-dragging');
  const file = event.dataTransfer?.files[0];
  if (file) void selectFile(file);
});

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!selectedFile || shell.classList.contains('is-processing')) return;
    void renderAmbientPreview(selectedFile, selectionVersion);
  }, 180);
});

window.addEventListener('beforeunload', () => {
  if (artworkObjectUrl) URL.revokeObjectURL(artworkObjectUrl);
});

async function selectFile(file: File): Promise<void> {
  if (!isSupportedImage(file)) {
    showToast('请选择 PNG、JPEG 或 WebP 图片', 'error');
    return;
  }

  const version = ++selectionVersion;
  const candidateUrl = URL.createObjectURL(file);
  shell.classList.add('is-processing');
  settingsTrigger.disabled = true;
  setSettingsOpen(false);

  try {
    const candidateImage = new Image();
    candidateImage.src = candidateUrl;
    await candidateImage.decode();

    const result = await renderAmbientPreview(file, version);
    if (version !== selectionVersion || !result) {
      URL.revokeObjectURL(candidateUrl);
      return;
    }

    const previousUrl = artworkObjectUrl;
    selectedFile = file;
    artworkObjectUrl = candidateUrl;
    downloadCache.clear();
    artworkImage.src = candidateUrl;
    artworkImage.alt = file.name;
    fileName.textContent = file.name;
    fileMeta.textContent = `${candidateImage.naturalWidth} × ${candidateImage.naturalHeight} · ${formatBytes(file.size)}`;
    renderPalette(result.analysis);

    welcome.hidden = true;
    artworkView.hidden = false;
    settingsTrigger.disabled = false;
    shell.classList.add('has-image');
    requestAnimationFrame(() => artworkView.classList.add('is-visible'));

    if (previousUrl) URL.revokeObjectURL(previousUrl);
  } catch (error) {
    URL.revokeObjectURL(candidateUrl);
    if (version !== selectionVersion) return;
    settingsTrigger.disabled = selectedFile === null;
    showToast(error instanceof Error ? error.message : '无法处理这张图片', 'error');
  } finally {
    if (version === selectionVersion) shell.classList.remove('is-processing');
  }
}

async function renderAmbientPreview(
  source: File,
  version: number,
): Promise<{ analysis: AmbientAnalysis } | null> {
  const run = ++previewRun;
  const result = await generateAmbientBackground(source, viewportPreviewSize());
  if (run !== previewRun || version !== selectionVersion) return null;
  installBackground(result.canvas);
  return { analysis: result.analysis };
}

function installBackground(canvas: HTMLCanvasElement): void {
  const layer = document.createElement('div');
  layer.className = 'background-layer';
  canvas.setAttribute('aria-hidden', 'true');
  layer.append(canvas);
  backgroundStack.append(layer);

  requestAnimationFrame(() => layer.classList.add('is-visible'));
  const previousLayer = activeBackgroundLayer;
  activeBackgroundLayer = layer;

  if (previousLayer) {
    previousLayer.classList.add('is-leaving');
    window.setTimeout(() => previousLayer.remove(), 1200);
  }
}

async function downloadSelectedBackground(): Promise<void> {
  if (!selectedFile) return;
  const file = selectedFile;
  const version = selectionVersion;
  const presetKey = selectedResolutionKey();
  const preset = currentPreset();

  setDownloadWorking(true);
  try {
    let blob = downloadCache.get(presetKey);
    if (!blob) {
      const result = await generateAmbientBackground(file, preset);
      if (version !== selectionVersion || file !== selectedFile) return;
      blob = await canvasToBlob(result.canvas);
      downloadCache.set(presetKey, blob);
    }

    if (version !== selectionVersion || file !== selectedFile) return;
    triggerDownload(blob, `${fileStem(file.name)}-ambient-${preset.shortLabel}.png`);
    showToast(`${preset.label} 已准备下载`);
    setSettingsOpen(false);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导出失败，请重试', 'error');
  } finally {
    if (version === selectionVersion) setDownloadWorking(false);
  }
}

function renderPalette(analysis: AmbientAnalysis): void {
  const colors = [analysis.dominantColor, ...analysis.meshColors];
  paletteDots.replaceChildren(...colors.map((color, index) => {
    const dot = document.createElement('span');
    dot.style.backgroundColor = color;
    dot.title = index === 0 ? `主色 ${color}` : `氛围色 ${index} ${color}`;
    return dot;
  }));
}

function setSettingsOpen(open: boolean): void {
  const canOpen = !settingsTrigger.disabled;
  const next = open && canOpen;
  settingsPanel.classList.toggle('is-open', next);
  settingsPanel.setAttribute('aria-hidden', String(!next));
  settingsTrigger.setAttribute('aria-expanded', String(next));
}

function setDownloadWorking(working: boolean): void {
  downloadButton.disabled = working;
  downloadButton.classList.toggle('is-working', working);
  const label = downloadButton.querySelector('span');
  if (label) label.textContent = working ? '正在生成…' : '下载 PNG';
}

function selectedResolutionKey(): string {
  return document.querySelector<HTMLInputElement>('input[name="resolution"]:checked')?.value ?? 'portrait';
}

function currentPreset(): OutputPreset {
  return OUTPUT_PRESETS[selectedResolutionKey()] ?? OUTPUT_PRESETS.portrait;
}

function viewportPreviewSize(): { width: number; height: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  let width = Math.max(1, Math.round(window.innerWidth * ratio));
  let height = Math.max(1, Math.round(window.innerHeight * ratio));
  const longest = Math.max(width, height);
  if (longest > 1920) {
    const scale = 1920 / longest;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  return { width, height };
}

function showToast(message: string, state: 'default' | 'error' = 'default'): void {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.state = state;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

function openFileChooser(): void {
  fileInput.click();
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('浏览器无法生成 PNG'));
    }, 'image/png');
  });
}

function isSupportedImage(file: File): boolean {
  return SUPPORTED_TYPES.has(file.type) || (file.type === '' && SUPPORTED_EXTENSIONS.test(file.name));
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'image';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`缺少界面元素 ${selector}`);
  return element;
}
