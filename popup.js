/**
 * Freely - Popup Logic
 * Handles capture modes: Visible, Full Page, Custom
 */

const captureVisibleBtn = document.getElementById('captureVisible');
const captureFullPageBtn = document.getElementById('captureFullPage');
const captureCustomBtn = document.getElementById('captureCustom');
const statusMessage = document.getElementById('statusMessage');

function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// --- 1. VISIBLE TAB CAPTURE ---
async function captureVisible() {
  try {
    showStatus('Capturing...', 'loading');
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    await openEditor(dataUrl, 'visible');
    window.close();
  } catch (error) {
    console.error(error);
    showStatus('Failed to capture visible tab.', 'error');
  }
}

// --- 2. FULL PAGE CAPTURE ---
async function captureFullPage() {
  const tab = await getCurrentTab();
  if (!tab) return showStatus('No active tab.', 'error');

  showStatus('Scrolling & capturing...', 'loading');

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.scrollTo(0, 0);
        return {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          windowHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        };
      }
    }).then(async (results) => {
      const { width, height, windowHeight, devicePixelRatio } = results[0].result;
      const captures = [];
      let currentScroll = 0;

      while (currentScroll < height) {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        captures.push({ y: currentScroll, img: dataUrl });

        currentScroll += windowHeight;
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (y) => window.scrollTo(0, y),
          args: [currentScroll]
        });

        await new Promise(r => setTimeout(r, 200));
      }

      showStatus('Processing image...', 'loading');
      const finalUrl = await stitchImages(captures, width, height, devicePixelRatio);
      
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.scrollTo(0, 0)
      });

      await openEditor(finalUrl, 'fullpage');
      window.close();
    });
  } catch (err) {
    console.error(err);
    showStatus('Full page capture failed.', 'error');
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
      img.src = cap.img;
    });
  });
}

// --- 3. CUSTOM AREA CAPTURE ---
async function captureCustom() {
  const tab = await getCurrentTab();
  if (!tab) return;

  try {
    showStatus('Select area on page...', 'loading');
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectSelectionOverlay
    });

    // We close the popup shortly after injection so it doesn't block the view
    // The background script listens for the 'areaSelected' message
    setTimeout(() => window.close(), 500);

  } catch (err) {
    console.error(err);
    showStatus('Custom capture failed.', 'error');
  }
}

function injectSelectionOverlay() {
  if (document.getElementById('freely-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'freely-overlay';
  overlay.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.3);`;
  
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;border:2px dashed #FFF;box-shadow:0 0 0 9999px rgba(0,0,0,0.5);display:none;pointer-events:none;`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let startX, startY, isDown = false;

  const onMouseDown = (e) => {
    isDown = true;
    startX = e.clientX;
    startY = e.clientY;
    box.style.display = 'block';
    box.style.left = startX + 'px';
    box.style.top = startY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
  };

  const onMouseMove = (e) => {
    if (!isDown) return;
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    box.style.width = width + 'px';
    box.style.height = height + 'px';
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  };

  const onMouseUp = (e) => {
    if (!isDown) return;
    isDown = false;
    
    const rect = box.getBoundingClientRect();
    
    // 1. REMOVE OVERLAY IMMEDIATELY
    document.body.removeChild(overlay);
    
    // 2. WAIT FOR REPAINT (Fixes white border issue)
    // We give the browser a moment to render the page cleanly before sending the message
    if (rect.width > 5 && rect.height > 5) {
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'areaSelected',
          area: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          devicePixelRatio: window.devicePixelRatio
        });
      }, 100); 
    }
  };

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
}

function openEditor(dataUrl, mode) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'openEditor',
      screenshotData: dataUrl,
      captureMode: mode
    }, resolve);
  });
}

// Listeners
captureVisibleBtn.addEventListener('click', captureVisible);
captureFullPageBtn.addEventListener('click', captureFullPage);
captureCustomBtn.addEventListener('click', captureCustom);