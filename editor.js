/**
 * Freely - Editor Main Logic
 * Version: Final Merged
 * Features: Select/Move Fix, Step & Pen Tools, Custom Cropping, Mockups
 */

class FreelyEditor {
  constructor() {
    this.mainCanvas = document.getElementById('mainCanvas');
    this.overlayCanvas = document.getElementById('overlayCanvas');
    
    // Optimization for frequent reading (blur/dragging)
    this.mainCtx = this.mainCanvas.getContext('2d', { willReadFrequently: true });
    this.overlayCtx = this.overlayCanvas.getContext('2d', { willReadFrequently: true });
    this.container = document.getElementById('canvasContainer');
    
    // State
    this.screenshot = null;
    this.mockupEnabled = false;
    this.mockupType = 'macos'; 
    this.mockupTheme = 'light';
    this.currentTool = 'select';
    
    this.annotations = []; 
    this.history = [[]]; 
    this.historyIndex = 0;
    
    // Interaction State
    this.selectedAnnotation = null;
    this.isDrawing = false;
    this.isDragging = false;
    this.stepCount = 1; 
    
    // Dragging Coordinates
    this.startX = 0;
    this.startY = 0;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialItemState = null;
    
    this.currentColor = '#FF5F57';
    this.currentSize = 3;
    
    // Mockup generator
    this.mockupGen = new MockupGenerator();
    
    // Initialize
    this.init();
  }

  async init() {
    try {
      await this.loadScreenshot();
      this.setupEventListeners();
      this.setupKeyboardShortcuts();
      this.updateCursor();
      document.getElementById('loadingOverlay').style.display = 'none';
    } catch (error) {
      console.error('Initialization error:', error);
      if(document.getElementById('toast')) this.showToast('Failed to load screenshot', 'error');
    }
  }

  getMockupKey() {
    if (this.mockupType === 'macos') return 'macOS';
    if (this.mockupType === 'windows') return 'windows';
    return this.mockupType;
  }

  getMockupConfig() {
    const key = this.getMockupKey();
    return this.mockupGen.config[key] || { titleBarHeight: 0 };
  }

  // LOGIC RESTORED: Custom Area Cropping
  async loadScreenshot() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['tempScreenshot', 'captureMode', 'cropData'], (result) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!result.tempScreenshot) return reject(new Error('No screenshot data found'));
        
        const img = new Image();
        img.onload = async () => {
          // If custom mode, crop the image
          if (result.captureMode === 'custom' && result.cropData) {
            try {
              this.screenshot = await this.cropImage(img, result.cropData);
            } catch (e) {
              console.error("Crop failed, using full image", e);
              this.screenshot = img;
            }
          } else {
            this.screenshot = img;
          }
          
          this.setupCanvas();
          this.render();
          chrome.storage.local.remove(['tempScreenshot', 'captureMode', 'cropData']);
          resolve();
        };
        img.onerror = reject;
        img.src = result.tempScreenshot;
      });
    });
  }

  cropImage(sourceImg, cropData) {
    return new Promise((resolve) => {
      const { area, devicePixelRatio } = cropData;
      const ratio = devicePixelRatio || 1;
      
      const canvas = document.createElement('canvas');
      canvas.width = area.width * ratio;
      canvas.height = area.height * ratio;
      const ctx = canvas.getContext('2d');
      
      ctx.drawImage(
        sourceImg,
        area.x * ratio, area.y * ratio, area.width * ratio, area.height * ratio,
        0, 0, area.width * ratio, area.height * ratio
      );
      
      const cropped = new Image();
      cropped.onload = () => resolve(cropped);
      cropped.src = canvas.toDataURL('image/png');
    });
  }

  setupCanvas() {
    if (!this.screenshot) return;
    const config = this.getMockupConfig();
    const titleBarHeight = this.mockupEnabled ? config.titleBarHeight : 0;
    
    this.mainCanvas.width = this.screenshot.width;
    this.mainCanvas.height = this.screenshot.height + titleBarHeight;
    this.overlayCanvas.width = this.mainCanvas.width;
    this.overlayCanvas.height = this.mainCanvas.height;
    
    if (this.mainCanvas.width === 0) this.mainCanvas.width = 1;
    if (this.mainCanvas.height === 0) this.mainCanvas.height = 1;

    this.mainCanvas.style.maxWidth = '90vw';
    this.mainCanvas.style.maxHeight = 'calc(90vh - 60px)';
    this.overlayCanvas.style.maxWidth = '90vw';
    this.overlayCanvas.style.maxHeight = 'calc(90vh - 60px)';
  }

  render() {
    if (!this.mainCtx || !this.screenshot) return;
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
    
    if (this.mockupEnabled) {
      this.mockupGen.applyToCanvas(
        this.mainCanvas,
        this.screenshot,
        this.getMockupKey(),
        this.mockupTheme
      );
    } else {
      this.mainCtx.drawImage(this.screenshot, 0, 0);
    }
    
    this.annotations.forEach(ann => this.drawAnnotation(ann, this.mainCtx));
    this.updateOverlay();
  }

  // LOGIC RESTORED: Step and Pen tools
  drawAnnotation(annotation, ctx) {
    ctx.save();
    switch (annotation.type) {
      case 'arrow': this.drawArrow(ctx, annotation); break;
      case 'box': this.drawBox(ctx, annotation); break;
      case 'text': this.drawText(ctx, annotation); break;
      case 'blur': this.drawBlur(ctx, annotation); break;
      case 'step': this.drawStep(ctx, annotation); break;
      case 'pen': this.drawPen(ctx, annotation); break;
    }
    ctx.restore();
  }

  drawStep(ctx, step) {
    const { x, y, number, color, size } = step;
    const radius = 12 + (size * 1.5);
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${radius * 1.2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), x, y + (radius * 0.1));
  }

  drawPen(ctx, pen) {
    if (pen.points.length < 2) return;
    const { points, color, size } = pen;
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.stroke();
  }

  drawArrow(ctx, arrow) {
    const { x1, y1, x2, y2, color, thickness } = arrow;
    if (x1 === x2 && y1 === y2) return;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = Math.max(thickness * 5, 18);

    ctx.beginPath();
    ctx.lineWidth = thickness;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - headLength * 0.2 * Math.cos(angle), y2 - headLength * 0.2 * Math.sin(angle));
    ctx.stroke();
    
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.lineJoin = 'miter'; 
    ctx.miterLimit = 10;
    ctx.moveTo(x2, y2);
    
    const arrowAngle = Math.PI / 7;
    ctx.lineTo(x2 - headLength * Math.cos(angle - arrowAngle), y2 - headLength * Math.sin(angle - arrowAngle));
    ctx.lineTo(x2 - headLength * Math.cos(angle + arrowAngle), y2 - headLength * Math.sin(angle + arrowAngle));
    ctx.closePath();
    ctx.fill();
  }

  drawBox(ctx, box) {
    const { x, y, width, height, color, thickness, filled } = box;
    if (width <= 0 || height <= 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineJoin = 'round';
    if (filled) {
      ctx.fillStyle = color + '30';
      ctx.fillRect(x, y, width, height);
    }
    ctx.strokeRect(x, y, width, height);
  }

  drawText(ctx, textObj) {
    const { x, y, text, color, size } = textObj;
    if (!text) return;
    ctx.fillStyle = color;
    ctx.font = `${size * 6 + 12}px Arial`; 
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  drawBlur(ctx, blur) {
    const { x, y, width, height, intensity } = blur;
    if (width <= 0 || height <= 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.filter = `blur(${intensity}px)`;
    
    const config = this.getMockupConfig();
    const titleBarHeight = this.mockupEnabled ? config.titleBarHeight : 0;
    
    ctx.drawImage(this.screenshot, 0, titleBarHeight);
    ctx.restore();
    
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  }

  updateOverlay() {
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    if (this.selectedAnnotation) {
      let bounds = this.getAnnotationBounds(this.selectedAnnotation);
      this.overlayCtx.strokeStyle = '#667eea';
      this.overlayCtx.lineWidth = 2;
      this.overlayCtx.setLineDash([5, 5]);
      this.overlayCtx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4);
      this.overlayCtx.setLineDash([]);
    }
  }

  getAnnotationBounds(annotation) {
    switch (annotation.type) {
      case 'step':
        const r = 12 + (annotation.size * 1.5);
        return { x: annotation.x - r, y: annotation.y - r, width: r*2, height: r*2 };
      case 'pen':
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        annotation.points.forEach(p => {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      case 'arrow':
        return {
          x: Math.min(annotation.x1, annotation.x2), y: Math.min(annotation.y1, annotation.y2),
          width: Math.abs(annotation.x2 - annotation.x1), height: Math.abs(annotation.y2 - annotation.y1)
        };
      case 'box':
      case 'blur':
        return { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height };
      case 'text':
        const fontSize = annotation.size * 6 + 12;
        return { x: annotation.x, y: annotation.y, width: annotation.text.length * (fontSize * 0.6), height: fontSize };
      default: return { x: 0, y: 0, width: 0, height: 0 };
    }
  }

  // --- EVENTS & INTERACTION (FIXED: SELECT/MOVE LOGIC) ---

  setupEventListeners() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentTool = btn.dataset.tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedAnnotation = null;
        this.updateCursor();
        this.render();
      });
    });
    
    document.getElementById('mockupToggle').addEventListener('change', (e) => { this.mockupEnabled = e.target.checked; this.setupCanvas(); this.render(); });
    document.getElementById('mockupType').addEventListener('change', (e) => { this.mockupType = e.target.value; if(this.mockupEnabled){this.setupCanvas(); this.render();} });
    document.getElementById('mockupTheme').addEventListener('change', (e) => { this.mockupTheme = e.target.value; if(this.mockupEnabled) this.render(); });
    document.getElementById('colorPicker').addEventListener('change', (e) => { this.currentColor = e.target.value; if(this.selectedAnnotation){this.selectedAnnotation.color=this.currentColor; this.saveToHistory(); this.render();} });
    document.getElementById('sizeSlider').addEventListener('input', (e) => { this.currentSize = parseInt(e.target.value); if(this.selectedAnnotation){this.selectedAnnotation.size=this.currentSize;this.selectedAnnotation.thickness=this.currentSize;this.saveToHistory();this.render();} document.getElementById('sizeValue').textContent=this.currentSize; });
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('redoBtn').addEventListener('click', () => this.redo());
    document.getElementById('copyBtn').addEventListener('click', () => this.copyToClipboard());
    document.getElementById('downloadBtn').addEventListener('click', () => this.download());
    document.getElementById('deleteSelected')?.addEventListener('click', () => { if(this.selectedAnnotation) this.deleteAnnotation(this.selectedAnnotation); });
    
    this.mainCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e)); 
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }

  updateCursor() {
    this.container.classList.remove('select-mode', 'arrow-mode', 'box-mode', 'text-mode', 'blur-mode', 'step-mode', 'pen-mode');
    this.container.classList.add(`${this.currentTool}-mode`);
  }

  getMousePos(e) {
    const rect = this.mainCanvas.getBoundingClientRect();
    const scaleX = this.mainCanvas.width / rect.width;
    const scaleY = this.mainCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  handleMouseDown(e) {
    if(e.target !== this.mainCanvas && e.target !== this.overlayCanvas) return;
    const pos = this.getMousePos(e);
    this.startX = pos.x;
    this.startY = pos.y;
    this.isDrawing = true;
    
    // FIX: Enhanced Selection Logic
    if (this.currentTool === 'select') {
      const item = this.getAnnotationAt(this.startX, this.startY);
      if (item) {
        this.selectedAnnotation = item;
        this.isDragging = true;
        this.dragStartX = this.startX;
        this.dragStartY = this.startY;
        this.initialItemState = JSON.parse(JSON.stringify(item));
        this.render(); 
      } else {
        this.selectedAnnotation = null;
        this.render();
      }
    } else if (this.currentTool === 'step') {
      this.addAnnotation({
        type: 'step', x: this.startX, y: this.startY,
        number: this.stepCount++, color: this.currentColor, size: this.currentSize
      });
      this.isDrawing = false; 
    } else if (this.currentTool === 'pen') {
      this.currentPenPath = {
        type: 'pen', points: [{x: this.startX, y: this.startY}],
        color: this.currentColor, size: this.currentSize
      };
    } else if (this.currentTool === 'text') {
      setTimeout(() => {
        const text = prompt('Enter text:');
        if (text) {
          this.addAnnotation({
            type: 'text', x: this.startX, y: this.startY,
            text: text, color: this.currentColor, size: this.currentSize
          });
        }
        this.isDrawing = false;
      }, 10);
    }
  }

  handleMouseMove(e) {
    if (!this.isDrawing) return;
    const pos = this.getMousePos(e);
    const currentX = pos.x;
    const currentY = pos.y;
    
    // FIX: Dragging Logic
    if (this.currentTool === 'select' && this.isDragging && this.selectedAnnotation) {
      const dx = currentX - this.dragStartX;
      const dy = currentY - this.dragStartY;
      const item = this.selectedAnnotation;
      const initial = this.initialItemState;
      
      if (item.type === 'arrow') {
        item.x1 = initial.x1 + dx; item.y1 = initial.y1 + dy;
        item.x2 = initial.x2 + dx; item.y2 = initial.y2 + dy;
      } else if (item.type === 'pen') {
        item.points = initial.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      } else {
        // Box, Blur, Step, Text
        item.x = initial.x + dx; item.y = initial.y + dy;
      }
      this.render();
      return;
    }

    // Pen Drawing
    if (this.currentTool === 'pen') {
      this.currentPenPath.points.push({x: currentX, y: currentY});
      this.render();
      this.drawPen(this.mainCtx, this.currentPenPath);
      return;
    }
    
    // Shape Previews
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    if (this.currentTool === 'arrow') {
      this.drawArrow(this.overlayCtx, { x1: this.startX, y1: this.startY, x2: currentX, y2: currentY, color: this.currentColor, thickness: this.currentSize });
    } else if (this.currentTool === 'box') {
      this.drawBox(this.overlayCtx, { x: Math.min(this.startX, currentX), y: Math.min(this.startY, currentY), width: Math.abs(currentX - this.startX), height: Math.abs(currentY - this.startY), color: this.currentColor, thickness: this.currentSize, filled: false });
    } else if (this.currentTool === 'blur') {
      this.overlayCtx.fillStyle = 'rgba(100, 100, 255, 0.2)';
      this.overlayCtx.fillRect(Math.min(this.startX, currentX), Math.min(this.startY, currentY), Math.abs(currentX - this.startX), Math.abs(currentY - this.startY));
    }
  }

  handleMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    
    // FIX: Stop dragging and save
    if (this.isDragging) {
      this.isDragging = false;
      this.saveToHistory();
      return;
    }

    if (this.currentTool === 'pen') {
      if (this.currentPenPath.points.length > 2) {
        this.addAnnotation(this.currentPenPath);
      }
      this.currentPenPath = null;
      return;
    }
    
    if (this.currentTool === 'select' || this.currentTool === 'step') return;
    
    const pos = this.getMousePos(e);
    const endX = pos.x;
    const endY = pos.y;
    
    if (Math.abs(endX - this.startX) < 3 && Math.abs(endY - this.startY) < 3) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        return;
    }

    if (this.currentTool === 'arrow') {
      this.addAnnotation({ type: 'arrow', x1: this.startX, y1: this.startY, x2: endX, y2: endY, color: this.currentColor, thickness: this.currentSize });
    } else if (this.currentTool === 'box') {
      this.addAnnotation({ type: 'box', x: Math.min(this.startX, endX), y: Math.min(this.startY, endY), width: Math.abs(endX - this.startX), height: Math.abs(endY - this.startY), color: this.currentColor, thickness: this.currentSize, filled: false });
    } else if (this.currentTool === 'blur') {
      this.addAnnotation({ type: 'blur', x: Math.min(this.startX, endX), y: Math.min(this.startY, endY), width: Math.abs(endX - this.startX), height: Math.abs(endY - this.startY), intensity: this.currentSize * 2 });
    }
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }

  getAnnotationAt(x, y) {
    // FIX: Added tolerance (padding) for easier selection
    const padding = 15; 
    for (let i = this.annotations.length - 1; i >= 0; i--) {
      const annotation = this.annotations[i];
      const bounds = this.getAnnotationBounds(annotation);
      if (x >= bounds.x - padding && x <= bounds.x + bounds.width + padding &&
          y >= bounds.y - padding && y <= bounds.y + bounds.height + padding) {
        return annotation;
      }
    }
    return null;
  }

  // --- DATA MANAGEMENT ---
  addAnnotation(annotation) { this.annotations.push(annotation); this.saveToHistory(); this.render(); }
  
  deleteAnnotation(annotation) {
    const index = this.annotations.indexOf(annotation);
    if (index > -1) { this.annotations.splice(index, 1); this.selectedAnnotation = null; this.saveToHistory(); this.render(); }
  }

  saveToHistory() {
    if (this.historyIndex < this.history.length - 1) this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(JSON.parse(JSON.stringify(this.annotations)));
    this.historyIndex++;
    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.annotations = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.selectedAnnotation = null;
      this.render();
      this.updateUndoRedoButtons();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.annotations = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.selectedAnnotation = null;
      this.render();
      this.updateUndoRedoButtons();
    }
  }
  
  updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = this.historyIndex <= 0;
    document.getElementById('redoBtn').disabled = this.historyIndex >= this.history.length - 1;
  }

  async copyToClipboard() {
    try {
      this.selectedAnnotation = null; 
      this.render();
      const blob = await new Promise(resolve => this.mainCanvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.showToast('✓ Copied to clipboard!', 'success');
    } catch (error) { this.showToast('Failed to copy', 'error'); }
  }

  download() {
    try {
      this.selectedAnnotation = null; 
      this.render();
      const link = document.createElement('a');
      link.download = `freely-${Date.now()}.png`;
      link.href = this.mainCanvas.toDataURL('image/png');
      link.click();
      this.showToast('✓ Downloaded!', 'success');
    } catch (error) { this.showToast('Failed to download', 'error'); }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) { e.preventDefault(); this.redo(); }
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.target.tagName !== 'INPUT') {
        switch (e.key.toLowerCase()) {
          case 'v': document.getElementById('selectTool')?.click(); break;
          case 'a': document.getElementById('arrowTool')?.click(); break;
          case 'b': document.getElementById('boxTool')?.click(); break;
          case 't': document.getElementById('textTool')?.click(); break;
          case 'u': document.getElementById('blurTool')?.click(); break;
          case 's': document.getElementById('stepTool')?.click(); break;
          case 'p': document.getElementById('penTool')?.click(); break;
          case 'delete': case 'backspace': if (this.selectedAnnotation) this.deleteAnnotation(this.selectedAnnotation); break;
        }
      }
      if (e.ctrlKey && e.key === 'c') { e.preventDefault(); this.copyToClipboard(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); this.download(); }
    });
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if(toast) { toast.textContent = message; toast.className = `toast ${type} show`; setTimeout(() => toast.classList.remove('show'), 3000); }
  }
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => new FreelyEditor()); }
else { new FreelyEditor(); }
