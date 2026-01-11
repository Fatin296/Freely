/**
 * Freely - Popup Logic
 * Handles screenshot capture in three modes:
 * 1. Visible Tab - Current viewport
 * 2. Full Page - Entire scrollable page (Robust Scroll & Stitch)
 * 3. Custom Area - User-selected region
 * Privacy: All captures are user-triggered and processed locally
 */

// DOM elements
const captureVisibleBtn = document.getElementById('captureVisible');
const captureFullPageBtn = document.getElementById('captureFullPage');
const captureCustomBtn = document.getElementById('captureCustom');
const statusMessage = document.getElementById('statusMessage');

/**
 * Show status message to user
 */
function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  
  // Hide non-loading messages after 3 seconds
  if (type !== 'loading') {
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 3000);
  }
}

/**
 * Disable buttons during processing to prevent double-clicks
 */
function disableButtons() {
  [captureVisibleBtn, captureFullPageBtn, captureCustomBtn].forEach(btn => {
    btn.classList.add('loading');
    btn.disabled = true;
  });
}

/**
 * Enable buttons
 */
function enableButtons() {
  [captureVisibleBtn, captureFullPageBtn, captureCustomBtn].forEach(btn => {
    btn.classList.remove('loading');
    btn.disabled = false;
  });
}

/**
 * 1. VISIBLE TAB CAPTURE
 */
async function captureVisible() {
  try {
    disableButtons();
    showStatus('Capturing visible area...', 'loading');
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    // Capture visible tab as high-quality PNG
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });
    
    // Send to editor
    await openEditor(dataUrl, 'visible');
    
    showStatus('✓ Opening editor...', 'success');
    
    // Close popup after brief delay
    setTimeout(() => window.close(), 500);
    
  } catch (error) {
    console.error('Capture visible error:', error);
    showStatus('❌ Failed to capture. Please try again.', 'error');
    enableButtons();
  }
}

/**
 * 2. FULL PAGE CAPTURE
 * Logic: Scroll page in chunks -> Capture visible part -> Stitch together
 */
async function captureFullPage() {
  try {
    disableButtons();
    showStatus('Capturing full page...', 'loading');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

    // 1. Get Page Dimensions via Script Injection
    const [dimResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        windowHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      })
    });

    if (!dimResult || !dimResult.result) throw new Error('Failed to get page dimensions');

    const { width, height, windowHeight, devicePixelRatio } = dimResult.result;
    
    // 2. Scroll and Capture Loop
    const captures = [];
    let currentScroll = 0;
    
    while (currentScroll < height) {
      let y = currentScroll;
      
      // Handle the bottom edge case:
      // If the next scroll goes past the bottom, snap to the exact bottom.
      if (currentScroll + windowHeight > height) {
        y = height - windowHeight;
        if (y < 0) y = 0; // Safety for extremely short pages
        currentScroll = height; // Mark as done after this capture
      } else {
        currentScroll += windowHeight;
      }

      // Execute Scroll
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (scrollToY) => window.scrollTo(0, scrollToY),
        args: [y]
      });

      // Wait 1000ms for:
      // 1. Page to render/stabilize after scroll
      // 2. Avoiding Chrome's "MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND" error
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Capture this slice
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      captures.push({ y: y, dataUrl });
    }

    // 3. Reset Scroll to Top
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.scrollTo(0, 0)
    });

    showStatus('Processing image...', 'loading');

    // 4. Stitch Images Together
    const finalUrl = await stitchImages(captures, width, height, devicePixelRatio);
    
    // 5. Open Editor
    await openEditor(finalUrl, 'fullpage');
    
    showStatus('✓ Opening editor...', 'success');
    setTimeout(() => window.close(), 500);
    
  } catch (error) {
    console.error('Capture full page error:', error);
    showStatus('❌ Failed to capture full page.', 'error');
    enableButtons();
  }
}

/**
 * Helper: Stitch multiple captured slices into one long image
 */
function stitchImages(captures, totalWidth, totalHeight, ratio) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = totalWidth * ratio;
    canvas.height = totalHeight * ratio;
    const ctx = canvas.getContext('2d');

    let loadedCount = 0;
    captures.forEach(cap => {
      const img = new Image();
      img.onload = () => {
        // Draw slice at correct Y position (scaled by pixel ratio)
        ctx.drawImage(img, 0, cap.y * ratio);
        loadedCount++;
        if (loadedCount === captures.length) {
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = cap.dataUrl;
    });
  });
}

/**
 * 3. CUSTOM AREA CAPTURE
 */
async function captureCustom() {
  try {
    disableButtons();
    showStatus('Select area to capture...', 'loading');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    
    // Inject overlay script into page
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: initCustomSelection
    });
    
    // Close popup so user can interact with the page overlay
    window.close();
    
  } catch (error) {
    console.error('Capture custom error:', error);
    showStatus('❌ Failed to start custom capture.', 'error');
    enableButtons();
  }
}

/**
 * Content Script: Initialize custom area selection overlay
 * This runs inside the web page context
 */
function initCustomSelection() {
  // Prevent multiple injections
  if (document.getElementById('freely-selection-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'freely-selection-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.5); z-index: 2147483647; cursor: crosshair;
  `;
  
  const selection = document.createElement('div');
  selection.id = 'freely-selection-box';
  selection.style.cssText = `
    position: fixed; border: 2px dashed #667eea; background: rgba(102, 126, 234, 0.1);
    display: none; z-index: 2147483648; pointer-events: none;
  `;
  
  document.body.appendChild(overlay);
  document.body.appendChild(selection);
  
  let startX, startY, isDrawing = false;
  
  overlay.addEventListener('mousedown', (e) => {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    selection.style.display = 'block';
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';
  });
  
  overlay.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);
    
    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
  });
  
  overlay.addEventListener('mouseup', async (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const rect = selection.getBoundingClientRect();
    
    // Clean up UI immediately
    overlay.remove();
    selection.remove();
    
    // Slight delay to ensure UI is fully removed before background captures
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'areaSelected',
        area: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        },
        devicePixelRatio: window.devicePixelRatio
      });
    }, 100);
  });
  
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      selection.remove();
    }
  });
  
  overlay.focus();
}

/**
 * Helper to send open request to background script
 */
async function openEditor(dataUrl, mode) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'openEditor',
      screenshotData: dataUrl,
      captureMode: mode
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// Attach Event Listeners
captureVisibleBtn.addEventListener('click', captureVisible);
captureFullPageBtn.addEventListener('click', captureFullPage);
captureCustomBtn.addEventListener('click', captureCustom);

console.log('Freely popup loaded');
