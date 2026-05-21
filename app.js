/**
 * POSTERCUT — app.js
 * Divisor de imágenes para pósters A4
 * Canvas API + jsPDF | Sin frameworks
 */

'use strict';

// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
  imageFile: null,
  imageBitmap: null,
  imageWidth: 0,
  imageHeight: 0,
  cols: 2,
  rows: 1,
  mode: 'fit',                // 'fit' | 'cover'
  orientation: 'portrait',   // 'portrait' | 'landscape'
  overlap: 0,
  margin: 5,
  showCutMarks: true,
  showNumbers: true,
  autoOrient: true,
  pageCanvases: [],
  rotating: false,
  rotationDeg: 0,
  // Modo de división
  divisionMode: 'poster',     // 'poster' | 'realsize'
  rsTargetWcm: 50,
  rsTargetHcm: 90,
  rsOrientation: 'portrait',
  rsMargin: 5,
  rsShowCutMarks: true,
  rsShowNumbers: true,
  rsCalcCols: 0,
  rsCalcRows: 0,
};

// Dimensiones A4 en mm y puntos (72 dpi para jsPDF)
const A4 = {
  portrait:  { wMM: 210, hMM: 297 },
  landscape: { wMM: 297, hMM: 210 },
};

// Resolución de render para los canvases de previsualización (px por mm)
const PREVIEW_PPI = 3.5; // ~89 dpi — buen balance calidad/velocidad

// Resolución de render para PDF (px por mm)
const PDF_PPI = 7.5;     // ~190 dpi

// ============================================================
// REFERENCIAS DOM
// ============================================================
const $ = id => document.getElementById(id);

const uploadZone     = $('uploadZone');
const fileInput      = $('fileInput');
const uploadContent  = $('uploadContent');
const uploadPreview  = $('uploadPreview');
const previewImg     = $('previewImg');
const previewInfo    = $('previewInfo');
const uploadBtn      = $('uploadBtn');
const changeImageBtn = $('changeImageBtn');
const validationMsg  = $('validationMsg');

const stepConfig     = $('step-config');
const stepPreview    = $('step-preview');

const formatBtns     = document.querySelectorAll('.format-btn');
const modeFit        = $('modeFit');
const modeCover      = $('modeCover');
const orientPortrait = $('orientPortrait');
const orientLandscape= $('orientLandscape');
const overlapRange   = $('overlapRange');
const overlapVal     = $('overlapVal');
const marginRange    = $('marginRange');
const marginVal      = $('marginVal');
const showCutMarks   = $('showCutMarks');
const showNumbers    = $('showNumbers');
const autoOrient     = $('autoOrient');
const sizeText       = $('sizeText');
const generateBtn    = $('generateBtn');

const posterGrid     = $('posterGrid');
const sheetViewer    = $('sheetViewer');
const sheetViewerTitle = $('sheetViewerTitle');
const closeViewer    = $('closeViewer');
const sheetCanvas    = $('sheetCanvas');
const backBtn        = $('backBtn');
const downloadImagesBtn = $('downloadImagesBtn');
const printPdfBtn    = $('printPdfBtn');
const progressWrap   = $('progressWrap');
const progressLabel  = $('progressLabel');
const progressFill   = $('progressFill');

const processingCanvas = $('processingCanvas');
const themeToggle    = $('themeToggle');

// ============================================================
// TEMA OSCURO / CLARO
// ============================================================
function initTheme() {
  const saved = localStorage.getItem('pc-theme') || 'dark';
  document.body.dataset.theme = saved;
  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  $('themeToggle').querySelector('.theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}

themeToggle.addEventListener('click', () => {
  const current = document.body.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = next;
  localStorage.setItem('pc-theme', next);
  updateThemeIcon(next);
});

// ============================================================
// CARGA DE ARCHIVO (imagen o PDF)
// ============================================================

// PDF.js worker (CDN matching the version loaded in index.html)
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Estado PDF
const pdfState = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
};

// Drag & drop
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

uploadZone.addEventListener('click', e => {
  if (e.target === uploadZone || e.target === uploadContent ||
      e.target.closest('#uploadContent')) {
    fileInput.click();
  }
});
uploadBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});
changeImageBtn.addEventListener('click', e => {
  e.stopPropagation();
  resetImage();
});

async function handleFile(file) {
  const MAX_MB = 50;
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!allowedImages.includes(file.type) && !isPDF) {
    showValidation('Formato no soportado. Usá JPG, PNG, WEBP o PDF.', 'error');
    return;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    showValidation(`El archivo supera los ${MAX_MB} MB.`, 'error');
    return;
  }
  hideValidation();

  state.imageFile   = file;
  state.rotationDeg = 0;

  if (isPDF) {
    await handlePDF(file);
  } else {
    await handleImage(file);
  }
}

// ---- Imagen ----
async function handleImage(file) {
  const url = URL.createObjectURL(file);
  previewImg.src = url;

  try {
    state.imageBitmap = await createImageBitmap(file);
  } catch {
    state.imageBitmap = await loadImageAsBitmap(url);
  }
  state.imageWidth  = state.imageBitmap.width;
  state.imageHeight = state.imageBitmap.height;

  previewInfo.textContent =
    `${state.imageWidth} × ${state.imageHeight} px — ${formatSize(file.size)}`;

  uploadContent.classList.add('hidden');
  uploadPreview.classList.remove('hidden');

  if (state.autoOrient) autoDetectOrientation();
  unlockStep(stepConfig);
  updateSizeEstimate();
  // Si el panel real ya está activo, recalcular
  if (state.divisionMode === 'realsize') calcRealSize();
}

// ---- PDF ----
async function handlePDF(file) {
  if (!window.pdfjsLib) {
    showValidation('PDF.js no está disponible. Recargá la página.', 'error');
    return;
  }

  showValidation('Cargando PDF…', 'success');

  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfState.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    pdfState.totalPages   = pdfState.pdfDoc.numPages;
    pdfState.currentPage  = 1;

    hideValidation();

    if (pdfState.totalPages === 1) {
      // Un solo página: cargar directo sin selector
      await loadPDFPage(pdfState.currentPage);
    } else {
      // Múltiples páginas: mostrar selector
      showPDFSelector();
    }
  } catch (err) {
    console.error(err);
    showValidation('Error al leer el PDF: ' + err.message, 'error');
  }
}

/**
 * Renderiza una página del PDF a un ImageBitmap y la carga como fuente.
 * @param {number} pageNum
 */
async function loadPDFPage(pageNum) {
  const page     = await pdfState.pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });

  // Escalar a ~200 dpi (alta resolución para el procesamiento posterior)
  // A4 tiene ~210mm de ancho = 8.27 pulgadas → 8.27 * 200 = ~1654 px
  const targetWidth = 1654;
  const scale = targetWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });

  const offscreen = document.createElement('canvas');
  offscreen.width  = Math.round(scaledViewport.width);
  offscreen.height = Math.round(scaledViewport.height);
  const ctx = offscreen.getContext('2d');

  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

  // Convertir canvas a ImageBitmap
  state.imageBitmap = await createImageBitmap(offscreen);
  state.imageWidth  = state.imageBitmap.width;
  state.imageHeight = state.imageBitmap.height;

  // Thumbnail para el preview de carga
  const thumbCanvas = document.createElement('canvas');
  const thumbH = 300;
  const thumbW = Math.round(thumbH * (offscreen.width / offscreen.height));
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  thumbCanvas.getContext('2d').drawImage(offscreen, 0, 0, thumbW, thumbH);
  previewImg.src = thumbCanvas.toDataURL();

  previewInfo.textContent =
    `PDF página ${pageNum}/${pdfState.totalPages} — ` +
    `${state.imageWidth} × ${state.imageHeight} px — ${formatSize(state.imageFile.size)}`;

  uploadContent.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  $('pdfPageSelector').classList.add('hidden');

  if (state.autoOrient) autoDetectOrientation();
  unlockStep(stepConfig);
  updateSizeEstimate();
}

// ---- Selector visual de página PDF ----
function showPDFSelector() {
  const sel = $('pdfPageSelector');
  $('pdfPageCount').textContent = `${pdfState.totalPages} páginas encontradas`;
  sel.classList.remove('hidden');
  uploadContent.classList.add('hidden');
  renderPDFThumb(pdfState.currentPage);
}

async function renderPDFThumb(pageNum) {
  $('pdfPageIndicator').textContent = `Página ${pageNum} de ${pdfState.totalPages}`;
  $('pdfPrevBtn').disabled = pageNum <= 1;
  $('pdfNextBtn').disabled = pageNum >= pdfState.totalPages;

  const page     = await pdfState.pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });

  const thumbCanvas = $('pdfThumbCanvas');
  const maxW = Math.min(340, window.innerWidth - 80);
  const scale = maxW / viewport.width;
  const sv    = page.getViewport({ scale });

  thumbCanvas.width  = Math.round(sv.width);
  thumbCanvas.height = Math.round(sv.height);
  await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport: sv }).promise;
}

$('pdfPrevBtn').addEventListener('click', () => {
  if (pdfState.currentPage > 1) {
    pdfState.currentPage--;
    renderPDFThumb(pdfState.currentPage);
  }
});
$('pdfNextBtn').addEventListener('click', () => {
  if (pdfState.currentPage < pdfState.totalPages) {
    pdfState.currentPage++;
    renderPDFThumb(pdfState.currentPage);
  }
});
$('pdfConfirmBtn').addEventListener('click', () => {
  loadPDFPage(pdfState.currentPage);
});

function loadImageAsBitmap(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function resetImage() {
  state.imageFile    = null;
  state.imageBitmap  = null;
  state.rotationDeg  = 0;
  previewImg.src     = '';
  uploadContent.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  $('pdfPageSelector').classList.add('hidden');
  fileInput.value    = '';
  // Reset PDF state
  pdfState.pdfDoc      = null;
  pdfState.currentPage = 1;
  pdfState.totalPages  = 0;
  lockStep(stepConfig);
  lockHideStep(stepPreview);
  posterGrid.innerHTML = '';
  state.pageCanvases = [];
}

function autoDetectOrientation() {
  const isWide = state.imageWidth > state.imageHeight;
  if (isWide) {
    state.orientation = 'landscape';
    setActiveToggle(orientLandscape, [orientPortrait, orientLandscape]);
  } else {
    state.orientation = 'portrait';
    setActiveToggle(orientPortrait, [orientPortrait, orientLandscape]);
  }
}

// ============================================================
// CONFIGURACIÓN
// ============================================================

// Formato (cols × rows)
formatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    formatBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.cols = parseInt(btn.dataset.cols);
    state.rows = parseInt(btn.dataset.rows);
    updateSizeEstimate();
  });
});

// Modo
modeFit.addEventListener('click', () => {
  state.mode = 'fit';
  setActiveToggle(modeFit, [modeFit, modeCover]);
});
modeCover.addEventListener('click', () => {
  state.mode = 'cover';
  setActiveToggle(modeCover, [modeFit, modeCover]);
});

// Orientación
orientPortrait.addEventListener('click', () => {
  state.orientation = 'portrait';
  setActiveToggle(orientPortrait, [orientPortrait, orientLandscape]);
  updateSizeEstimate();
});
orientLandscape.addEventListener('click', () => {
  state.orientation = 'landscape';
  setActiveToggle(orientLandscape, [orientPortrait, orientLandscape]);
  updateSizeEstimate();
});

// Ranges
overlapRange.addEventListener('input', () => {
  state.overlap = parseInt(overlapRange.value);
  overlapVal.textContent = `${state.overlap} px`;
});
marginRange.addEventListener('input', () => {
  state.margin = parseInt(marginRange.value);
  marginVal.textContent = `${state.margin} mm`;
});

// Checkboxes
showCutMarks.addEventListener('change', () => { state.showCutMarks = showCutMarks.checked; });
showNumbers.addEventListener('change',  () => { state.showNumbers  = showNumbers.checked; });
autoOrient.addEventListener('change',   () => {
  state.autoOrient = autoOrient.checked;
  if (state.autoOrient && state.imageBitmap) autoDetectOrientation();
});

function setActiveToggle(active, group) {
  group.forEach(el => el.classList.remove('active'));
  active.classList.add('active');
}

function updateSizeEstimate() {
  if (!state.imageBitmap) return;
  if (state.divisionMode === 'realsize') {
    calcRealSize();
    return;
  }
  const page = A4[state.orientation];
  const wCM  = (page.wMM / 10) * state.cols;
  const hCM  = (page.hMM / 10) * state.rows;
  sizeText.textContent = `Tamaño estimado del póster: ${wCM.toFixed(1)} × ${hCM.toFixed(1)} cm`;
}

// ============================================================
// GENERACIÓN DE HOJAS (Canvas)
// ============================================================

generateBtn.addEventListener('click', generatePreview);

async function generatePreview() {
  if (!state.imageBitmap) return;

  // En modo tamaño real: validar que se haya calculado
  if (state.divisionMode === 'realsize') {
    calcRealSize(); // recalcular con valores actuales
    if (state.rsCalcCols === 0) {
      showValidation('Ingresá las dimensiones deseadas primero.', 'error');
      return;
    }
    // Sincronizar cols/rows y parámetros al state principal para renderAllPages
    state.cols         = state.rsCalcCols;
    state.rows         = state.rsCalcRows;
    state.orientation  = state.rsOrientation;
    state.margin       = state.rsMargin;
    state.mode         = 'cover';   // tamaño real siempre es cover exacto
    state.showCutMarks = state.rsShowCutMarks;
    state.showNumbers  = state.rsShowNumbers;
    state.overlap      = 0;
  }

  generateBtn.disabled = true;
  generateBtn.querySelector('span').textContent = 'Generando…';
  await new Promise(r => setTimeout(r, 50));

  try {
    state.pageCanvases = await renderAllPages(PREVIEW_PPI);
    buildPosterGrid();
    unlockStep(stepPreview);
    stepPreview.classList.remove('hidden');
    stepPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    showValidation('Error al generar la previsualización.', 'error');
  }

  generateBtn.disabled = false;
  generateBtn.querySelector('span').textContent = 'Generar previsualización';
}

/**
 * Renderiza todas las páginas del póster a la resolución dada.
 * @param {number} ppi - píxeles por milímetro
 * @returns {HTMLCanvasElement[]}
 */
async function renderAllPages(ppi) {
  const page  = A4[state.orientation];
  const pW    = Math.round(page.wMM * ppi); // ancho de hoja en px
  const pH    = Math.round(page.hMM * ppi); // alto de hoja en px
  const margin = Math.round(state.margin * ppi); // margen en px

  // Área útil de la hoja (descontando márgenes en ambos lados)
  const usefulW = pW - margin * 2;
  const usefulH = pH - margin * 2;

  // Dimensiones totales del área útil del póster
  const totalW = usefulW * state.cols;
  const totalH = usefulH * state.rows;

  // Calcular recorte/escala de la imagen original
  const { sx, sy, sw, sh } = computeSourceRect(
    state.imageWidth, state.imageHeight,
    totalW, totalH,
    state.mode,
    state.rotationDeg
  );

  const pages = [];

  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const canvas = document.createElement('canvas');
      canvas.width  = pW;
      canvas.height = pH;
      const ctx = canvas.getContext('2d');

      // Fondo blanco (hoja)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pW, pH);

      // Calcular fracción de la imagen que va en esta celda
      // con posible overlap en px de imagen
      const overlapImg = state.overlap; // px en espacio imagen (simplificado)

      const cellSrcX = sx + (sw / state.cols) * col;
      const cellSrcY = sy + (sh / state.rows) * row;
      const cellSrcW = sw / state.cols + (col < state.cols - 1 ? overlapImg : 0);
      const cellSrcH = sh / state.rows + (row < state.rows - 1 ? overlapImg : 0);

      // Destino: área útil de la hoja
      const destX = margin;
      const destY = margin;
      const destW = usefulW + (col < state.cols - 1 ? Math.round(state.overlap * ppi * 0.5) : 0);
      const destH = usefulH + (row < state.rows - 1 ? Math.round(state.overlap * ppi * 0.5) : 0);

      // Dibujar imagen (con posible rotación)
      drawImageSection(ctx, state.imageBitmap, state.rotationDeg,
        cellSrcX, cellSrcY, cellSrcW, cellSrcH,
        destX, destY, destW, destH
      );

      // Marcas de corte
      if (state.showCutMarks) {
        drawCutMarks(ctx, pW, pH, margin);
      }

      // Numeración
      if (state.showNumbers) {
        const label = `${row + 1}-${col + 1}`;
        drawLabel(ctx, label, pW, pH, margin);
      }

      pages.push(canvas);
    }
  }

  return pages;
}

/**
 * Calcula el rect fuente (sx, sy, sw, sh) de la imagen original
 * para cubrir el área totalW x totalH según el modo.
 */
function computeSourceRect(imgW, imgH, totalW, totalH, mode, rotDeg) {
  // Si hay rotación aplicamos dimensiones giradas
  const [effW, effH] = (rotDeg % 180 !== 0) ? [imgH, imgW] : [imgW, imgH];

  const imgAspect   = effW / effH;
  const totalAspect = totalW / totalH;

  let sw, sh;

  if (mode === 'fit') {
    if (imgAspect > totalAspect) {
      sw = effW;
      sh = effW / totalAspect;
    } else {
      sh = effH;
      sw = effH * totalAspect;
    }
  } else {
    // cover
    if (imgAspect > totalAspect) {
      sh = effH;
      sw = effH * totalAspect;
    } else {
      sw = effW;
      sh = effW / totalAspect;
    }
  }

  sw = Math.min(sw, effW);
  sh = Math.min(sh, effH);

  const sx = (effW - sw) / 2;
  const sy = (effH - sh) / 2;

  return { sx, sy, sw, sh };
}

/**
 * Dibuja una sección de la imagen (con rotación) en el canvas destino.
 */
function drawImageSection(ctx, bitmap, rotDeg, sx, sy, sw, sh, dx, dy, dw, dh) {
  ctx.save();

  if (rotDeg === 0) {
    ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
  } else {
    // Crear canvas temporal con imagen rotada
    const tmpCanvas = document.createElement('canvas');
    const isOdd = rotDeg % 180 !== 0;
    tmpCanvas.width  = isOdd ? bitmap.height : bitmap.width;
    tmpCanvas.height = isOdd ? bitmap.width  : bitmap.height;
    const tmpCtx = tmpCanvas.getContext('2d');

    tmpCtx.translate(tmpCanvas.width / 2, tmpCanvas.height / 2);
    tmpCtx.rotate((rotDeg * Math.PI) / 180);
    tmpCtx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    ctx.drawImage(tmpCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  ctx.restore();
}

/**
 * Dibuja marcas de corte en las esquinas.
 */
function drawCutMarks(ctx, pW, pH, margin) {
  const len = Math.min(margin * 0.6, 12);
  const gap = 3;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth   = 0.7;
  ctx.setLineDash([]);

  const corners = [
    [margin, margin],
    [pW - margin, margin],
    [margin, pH - margin],
    [pW - margin, pH - margin],
  ];

  corners.forEach(([cx, cy]) => {
    const dx = cx < pW / 2 ? -1 : 1;
    const dy = cy < pH / 2 ? -1 : 1;

    // Horizontal
    ctx.beginPath();
    ctx.moveTo(cx + dx * gap, cy);
    ctx.lineTo(cx + dx * (gap + len), cy);
    ctx.stroke();

    // Vertical
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * gap);
    ctx.lineTo(cx, cy + dy * (gap + len));
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * Dibuja la etiqueta de numeración en la esquina inferior derecha.
 */
function drawLabel(ctx, label, pW, pH, margin) {
  ctx.save();
  const fs = Math.max(margin * 0.45, 8);
  ctx.font      = `bold ${fs}px monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, pW - margin / 2, pH - margin / 2);
  ctx.restore();
}

// ============================================================
// GRID DE PREVISUALIZACIÓN
// ============================================================

function buildPosterGrid() {
  posterGrid.innerHTML = '';

  // Tamaño visual de cada celda (px) para la grilla
  const page = A4[state.orientation];
  const aspect = page.wMM / page.hMM;

  const maxGridW = Math.min(700, window.innerWidth - 80);
  const cellW = Math.min(
    Math.floor((maxGridW - (state.cols - 1) * 8) / state.cols),
    180
  );
  const cellH = Math.round(cellW / aspect);

  posterGrid.style.gridTemplateColumns = `repeat(${state.cols}, ${cellW}px)`;
  posterGrid.style.gridTemplateRows    = `repeat(${state.rows}, ${cellH}px)`;

  state.pageCanvases.forEach((pageCanvas, i) => {
    const cell  = document.createElement('div');
    cell.className = 'grid-cell';
    cell.style.width  = cellW + 'px';
    cell.style.height = cellH + 'px';

    // Mini canvas para la celda (reescalado)
    const miniCanvas = document.createElement('canvas');
    miniCanvas.width  = cellW;
    miniCanvas.height = cellH;
    const mCtx = miniCanvas.getContext('2d');
    mCtx.drawImage(pageCanvas, 0, 0, cellW, cellH);

    const row = Math.floor(i / state.cols) + 1;
    const col = (i % state.cols) + 1;

    const label = document.createElement('div');
    label.className = 'grid-cell-label';
    label.textContent = `${row}-${col}`;

    cell.appendChild(miniCanvas);
    cell.appendChild(label);
    cell.addEventListener('click', () => openSheetViewer(i));

    posterGrid.appendChild(cell);
  });
}

// ============================================================
// VISOR DE HOJA INDIVIDUAL
// ============================================================

function openSheetViewer(index) {
  const totalSheets = state.cols * state.rows;
  const row = Math.floor(index / state.cols) + 1;
  const col = (index % state.cols) + 1;

  sheetViewerTitle.textContent = `Hoja ${index + 1} de ${totalSheets} — Fila ${row}, Columna ${col}`;

  const src = state.pageCanvases[index];
  // Escalar para que entre en pantalla
  const maxH = Math.min(window.innerHeight * 0.6, 600);
  const aspect = src.width / src.height;
  const dispH = maxH;
  const dispW = Math.round(dispH * aspect);

  sheetCanvas.width  = dispW;
  sheetCanvas.height = dispH;
  const ctx = sheetCanvas.getContext('2d');
  ctx.drawImage(src, 0, 0, dispW, dispH);

  sheetViewer.classList.remove('hidden');
  sheetViewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

closeViewer.addEventListener('click', () => sheetViewer.classList.add('hidden'));

// ============================================================
// NAVEGACIÓN
// ============================================================

backBtn.addEventListener('click', () => {
  stepPreview.classList.add('hidden');
  lockHideStep(stepPreview);
  stepConfig.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ============================================================
// DESCARGA DE IMÁGENES INDIVIDUALES
// ============================================================

downloadImagesBtn.addEventListener('click', async () => {
  downloadImagesBtn.disabled = true;
  downloadImagesBtn.textContent = 'Descargando…';

  // Re-render a resolución PDF para máxima calidad
  const hiPages = await renderAllPages(PDF_PPI);

  hiPages.forEach((canvas, i) => {
    const row = Math.floor(i / state.cols) + 1;
    const col = (i % state.cols) + 1;
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `poster_${row}-${col}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.92);
  });

  downloadImagesBtn.disabled = false;
  downloadImagesBtn.textContent = '📥 Descargar imágenes';
});

// ============================================================
// GENERACIÓN DE PDF
// ============================================================

printPdfBtn.addEventListener('click', generatePDF);

async function generatePDF() {
  printPdfBtn.disabled = true;
  printPdfBtn.textContent = '⏳ Preparando…';

  showProgress(0, 'Iniciando generación del PDF…');

  try {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) throw new Error('jsPDF no está disponible.');

    const page     = A4[state.orientation];
    const pdfOrient = state.orientation === 'landscape' ? 'l' : 'p';

    const doc = new jsPDF({
      orientation: pdfOrient,
      unit: 'mm',
      format: 'a4',
    });

    const total = state.cols * state.rows;

    // Render de alta resolución
    showProgress(5, 'Renderizando hojas en alta calidad…');
    const hiPages = await renderAllPages(PDF_PPI);

    for (let i = 0; i < hiPages.length; i++) {
      const progress = 5 + Math.round(((i + 1) / total) * 90);
      showProgress(progress, `Procesando hoja ${i + 1} de ${total}…`);

      if (i > 0) doc.addPage([page.wMM, page.hMM], pdfOrient);

      // Convertir canvas a JPEG data URL
      const imgData = hiPages[i].toDataURL('image/jpeg', 0.92);

      // Agregar al PDF — ocupa toda la hoja
      doc.addImage(imgData, 'JPEG', 0, 0, page.wMM, page.hMM);

      // Dar tiempo al motor para no bloquear
      await new Promise(r => setTimeout(r, 10));
    }

    showProgress(98, 'Guardando PDF…');
    await new Promise(r => setTimeout(r, 80));

    doc.save('poster_postercut.pdf');
    showProgress(100, '✅ PDF generado con éxito.');

    setTimeout(hideProgress, 2500);

  } catch (err) {
    console.error(err);
    showProgress(0, '❌ Error al generar el PDF: ' + err.message);
    setTimeout(hideProgress, 3000);
  }

  printPdfBtn.disabled = false;
  printPdfBtn.textContent = '🖨️ Imprimir / PDF';
}

// ============================================================
// PROGRESO
// ============================================================

function showProgress(percent, label) {
  progressWrap.classList.remove('hidden');
  progressLabel.textContent = label;
  progressFill.style.width  = percent + '%';
}

function hideProgress() {
  progressWrap.classList.add('hidden');
  progressFill.style.width = '0%';
}

// ============================================================
// HELPERS
// ============================================================

function unlockStep(section) {
  section.classList.remove('locked');
}

function lockStep(section) {
  section.classList.add('locked');
}

function lockHideStep(section) {
  section.classList.add('locked');
  section.classList.add('hidden');
}

function showValidation(msg, type) {
  validationMsg.textContent = msg;
  validationMsg.className   = `validation-msg ${type}`;
  validationMsg.classList.remove('hidden');
}

function hideValidation() {
  validationMsg.classList.add('hidden');
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================
// BOTÓN DE ROTACIÓN (agregado al DOM dinámicamente)
// ============================================================

function addRotateButton() {
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm';
  btn.id        = 'rotateBtn';
  btn.title     = 'Rotar imagen 90°';
  btn.innerHTML = '↻ Rotar';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    rotateImage();
  });
  uploadPreview.insertBefore(btn, changeImageBtn);
}

function rotateImage() {
  state.rotationDeg = (state.rotationDeg + 90) % 360;

  // Redibuja el thumbnail de previsualización
  if (state.imageBitmap) {
    const tmp    = document.createElement('canvas');
    const isOdd  = state.rotationDeg % 180 !== 0;
    tmp.width    = isOdd ? state.imageBitmap.height : state.imageBitmap.width;
    tmp.height   = isOdd ? state.imageBitmap.width  : state.imageBitmap.height;
    const tCtx   = tmp.getContext('2d');
    tCtx.translate(tmp.width / 2, tmp.height / 2);
    tCtx.rotate((state.rotationDeg * Math.PI) / 180);
    tCtx.drawImage(state.imageBitmap, -state.imageBitmap.width / 2, -state.imageBitmap.height / 2);
    previewImg.src = tmp.toDataURL();
  }
  updateSizeEstimate();
}

// ============================================================
// MODO TABS — PÓSTER / TAMAÑO REAL
// ============================================================

const tabPoster     = $('tabPoster');
const tabRealSize   = $('tabRealSize');
const panelPoster   = $('panelPoster');
const panelRealSize = $('panelRealSize');

tabPoster.addEventListener('click', () => switchDivisionMode('poster'));
tabRealSize.addEventListener('click', () => switchDivisionMode('realsize'));

function switchDivisionMode(mode) {
  state.divisionMode = mode;
  if (mode === 'poster') {
    tabPoster.classList.add('active');
    tabRealSize.classList.remove('active');
    panelPoster.classList.remove('hidden');
    panelRealSize.classList.add('hidden');
    updateSizeEstimate();
  } else {
    tabRealSize.classList.add('active');
    tabPoster.classList.remove('active');
    panelRealSize.classList.remove('hidden');
    panelPoster.classList.add('hidden');
    // Calcular automáticamente al cambiar al panel
    if (state.imageBitmap) calcRealSize();
  }
}

// ============================================================
// TAMAÑO REAL — Lógica de cálculo
// ============================================================

// DOM refs modo real
const realWInput       = $('realW');
const realHInput       = $('realH');
const rsOrientPortrait = $('rsOrientPortrait');
const rsOrientLandscape= $('rsOrientLandscape');
const rsMarginRange    = $('rsMarginRange');
const rsMarginVal      = $('rsMarginVal');
const rsResultCard     = $('rsResultCard');
const rsShowCutMarksEl = $('rsShowCutMarks');
const rsShowNumbersEl  = $('rsShowNumbers');

// Listeners del panel real
realWInput.addEventListener('input', () => {
  state.rsTargetWcm = parseFloat(realWInput.value) || 50;
  if (state.imageBitmap) calcRealSize();
});
realHInput.addEventListener('input', () => {
  state.rsTargetHcm = parseFloat(realHInput.value) || 90;
  if (state.imageBitmap) calcRealSize();
});

rsOrientPortrait.addEventListener('click', () => {
  state.rsOrientation = 'portrait';
  setActiveToggle(rsOrientPortrait, [rsOrientPortrait, rsOrientLandscape]);
  if (state.imageBitmap) calcRealSize();
});
rsOrientLandscape.addEventListener('click', () => {
  state.rsOrientation = 'landscape';
  setActiveToggle(rsOrientLandscape, [rsOrientPortrait, rsOrientLandscape]);
  if (state.imageBitmap) calcRealSize();
});

rsMarginRange.addEventListener('input', () => {
  state.rsMargin = parseInt(rsMarginRange.value);
  rsMarginVal.textContent = state.rsMargin + ' mm';
  if (state.imageBitmap) calcRealSize();
});

rsShowCutMarksEl.addEventListener('change', () => { state.rsShowCutMarks = rsShowCutMarksEl.checked; });
rsShowNumbersEl.addEventListener('change',  () => { state.rsShowNumbers  = rsShowNumbersEl.checked; });

/**
 * Calcula cols y rows para que la imagen quede al tamaño físico pedido.
 *
 * Lógica:
 *   - Área útil por hoja = (A4 - márgenes×2) en mm
 *   - cols = ceil(targetW_mm / usefulW_mm)
 *   - rows = ceil(targetH_mm / usefulH_mm)
 *   - Tamaño real final = cols × usefulW  ×  rows × usefulH   (siempre >= al pedido)
 */
function calcRealSize() {
  const page     = A4[state.rsOrientation];
  const marginMM = state.rsMargin;
  const usefulW  = page.wMM - marginMM * 2;  // mm útiles por hoja (ancho)
  const usefulH  = page.hMM - marginMM * 2;  // mm útiles por hoja (alto)

  const targetWmm = state.rsTargetWcm * 10;
  const targetHmm = state.rsTargetHcm * 10;

  const cols = Math.max(1, Math.ceil(targetWmm / usefulW));
  const rows = Math.max(1, Math.ceil(targetHmm / usefulH));

  // Tamaño real que quedará (siempre >= al pedido por el ceil)
  const realWmm = cols * usefulW;
  const realHmm = rows * usefulH;
  const realWcm = (realWmm / 10).toFixed(1);
  const realHcm = (realHmm / 10).toFixed(1);

  // Cuánto sobra respecto al pedido
  const extraW = (realWmm - targetWmm).toFixed(0);
  const extraH = (realHmm - targetHmm).toFixed(0);

  state.rsCalcCols = cols;
  state.rsCalcRows = rows;

  // Actualizar DOM del resultado
  $('rsColsVal').textContent   = cols;
  $('rsRowsVal').textContent   = rows;
  $('rsSheetsVal').textContent = cols * rows;
  $('rsExactSize').textContent = `${realWcm} × ${realHcm} cm`;

  let subText = `${cols} col × ${rows} fil — ${cols * rows} hojas A4`;
  if (parseFloat(extraW) > 0 || parseFloat(extraH) > 0) {
    subText += ` · Se recortarán ${extraW} mm a lo ancho y ${extraH} mm a lo alto`;
  }
  $('rsResultSub').textContent = subText;

  // Mostrar el card
  rsResultCard.classList.remove('hidden');

  // Actualizar badge de tamaño
  sizeText.textContent = `Tamaño final del póster: ${realWcm} × ${realHcm} cm · ${cols * rows} hojas`;

  // Dibujar preview visual
  drawRealSizePreview(cols, rows, realWcm, realHcm, targetWmm, targetHmm, realWmm, realHmm);
}

/**
 * Dibuja el preview proporcional del póster con:
 *  - fondo con la imagen (si hay)
 *  - líneas punteadas de cada hoja A4
 *  - borde de acento marcando el tamaño exacto pedido
 *  - etiqueta con las dimensiones
 */
function drawRealSizePreview(cols, rows, realWcm, realHcm, targetWmm, targetHmm, realWmm, realHmm) {
  const MAX_W = Math.min(480, window.innerWidth - 80);
  const MAX_H = 280;

  const aspect = realWmm / realHmm;
  let dispW, dispH;
  if (aspect >= MAX_W / MAX_H) {
    dispW = MAX_W;
    dispH = Math.round(MAX_W / aspect);
  } else {
    dispH = MAX_H;
    dispW = Math.round(MAX_H * aspect);
  }

  const inner = $('rsPosterInner');
  inner.style.width  = dispW + 'px';
  inner.style.height = dispH + 'px';

  // Imagen de fondo
  let bg = inner.querySelector('.rs-poster-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'rs-poster-bg';
    inner.insertBefore(bg, inner.firstChild);
  }
  if (state.imageBitmap) {
    // Usar el thumbnail del preview
    bg.style.backgroundImage = `url(${previewImg.src})`;
    bg.style.opacity = '0.55';
  }

  // Grilla de hojas
  const grid = $('rsPosterGrid');
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
  grid.innerHTML = '';
  for (let i = 0; i < cols * rows; i++) {
    const cell = document.createElement('div');
    cell.className = 'rs-grid-cell';
    grid.appendChild(cell);
  }

  // Borde que marca el tamaño real pedido (proporcional)
  const borderW = Math.round((targetWmm / realWmm) * dispW);
  const borderH = Math.round((targetHmm / realHmm) * dispH);
  const borderL = Math.round((dispW - borderW) / 2);
  const borderT = Math.round((dispH - borderH) / 2);

  const border = $('rsPosterBorder');
  border.style.width  = borderW + 'px';
  border.style.height = borderH + 'px';
  border.style.left   = borderL + 'px';
  border.style.top    = borderT + 'px';

  // Etiqueta encima del borde
  const lbl = $('rsPosterLabel');
  lbl.textContent = `${state.rsTargetWcm} × ${state.rsTargetHcm} cm`;
  lbl.style.left = borderL + 'px';
  lbl.style.top  = Math.max(0, borderT - 22) + 'px';
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

function init() {
  initTheme();
  addRotateButton();

  // Estado inicial de los rangos
  overlapVal.textContent = `${state.overlap} px`;
  marginVal.textContent  = `${state.margin} mm`;

  // Ya están en 'locked' por CSS default para stepConfig
  // stepPreview empieza locked + hidden
  stepPreview.classList.add('locked', 'hidden');

  console.log('PosterCut listo ✦');
}

init();
