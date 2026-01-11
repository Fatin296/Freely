/**
 * Freely - Popup Logic
 * Handles screenshot capture in three modes:
 * 1. Visible Tab - Current viewport
 * 2. Full Page - Entire scrollable page (Robust Scroll & Stitch)
 * 3. Custom Area - "Spotlight" Highlight & Crop
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
 * Disable buttons during processing
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
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 });
    await openEditor(dataUrl, 'visible');
    
    showStatus('✓ Opening editor...', 'success');
    setTimeout(() => window.close(), 500);
    
  } catch (error) {
    console.error('Capture visible error:', error);
    showStatus('❌ Failed to capture.', 'error');
    enableButtons();
  }
}

/**
 * 2. FULL PAGE CAPTURE (Robust Logic)
 */
async function captureFullPage() {
  try {
    disableButtons();
    showStatus('Capturing full page...', 'loading');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

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
    
    const captures = [];
    let currentScroll = 0;
    
    while (currentScroll < height) {
      let y = currentScroll;
      if (currentScroll + windowHeight > height) {
        y = height - windowHeight;
        if (y < 0) y = 0;
        currentScroll = height;
      } else {
        currentScroll += windowHeight;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (scrollToY) => window.scrollTo(0, scrollToY),
        args: [y]
      });

      // 1000ms delay for stability & quota safety
      await new Promise(resolve => setTimeout(resolve, 1000));

      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      captures.push({ y: y, dataUrl });
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.scrollTo(0, 0)
    });

    showStatus('Processing image...', 'loading');
    const finalUrl = await stitchImages(captures, width, height, devicePixelRatio);
    await openEditor(finalUrl, 'fullpage');
    
    showStatus('✓ Opening editor...', 'success');
    setTimeout(() => window.close(), 500);
    
  } catch (error) {
    console.error('Capture full page error:', error);
    showStatus('❌ Failed to capture full page.', 'error');
    enableButtons();
  }
}

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
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: initCustomSelection
    });
    
    window.close();
    
  } catch (error) {
    console.error('Capture custom error:', error);
    showStatus('❌ Failed to start custom capture.', 'error');
    enableButtons();
  }
}

/**
 * Content Script: Initialize custom area selection overlay
 * FIXED: Uses "box-shadow" spotlight effect
 */
function initCustomSelection() {
  if (document.getElementById('freely-selection-overlay')) return;

  // 1. Dark Overlay (Initial state)
  const overlay = document.createElement('div');
  overlay.id = 'freely-selection-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.5); 
    z-index: 2147483647; 
    cursor: crosshair;
  `;
  
  // 2. Selection Box (The "Spotlight")
  // Uses a massive box-shadow to dim everything OUTSIDE the selection
  const selection = document.createElement('div');
  selection.id = 'freely-selection-box';
  selection.style.cssText = `
    position: fixed; 
    border: 2px solid #fff; 
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5); 
    background: transparent;
    display: none; 
    z-index: 2147483648; 
    pointer-events: none;
  `;
  
  document.body.appendChild(overlay);
  document.body.appendChild(selection);
  
  let startX, startY, isDrawing = false;
  
  overlay.addEventListener('mousedown', (e) => {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // Clear the main overlay so the selection box shadow handles the dimming
    overlay.style.backgroundColor = 'transparent';
    
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
    
    overlay.remove();
    selection.remove();
    
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
