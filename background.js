/**
 * Freely - Background Service Worker
 * Handles extension lifecycle and capture events
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('Freely extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // 1. Handle Direct Open Editor (Visible / Full Page)
  if (message.action === 'openEditor') {
    saveAndOpen(message.screenshotData, message.captureMode);
    return true;
  }
  
  // 2. Handle Custom Area Selection (from Content Script)
  if (message.action === 'areaSelected') {
    // Capture the visible tab first
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      // Save full image + crop coordinates; Editor will handle the cropping
      chrome.storage.local.set({
        tempScreenshot: dataUrl,
        captureMode: 'custom',
        cropData: {
          area: message.area,
          devicePixelRatio: message.devicePixelRatio
        },
        timestamp: Date.now()
      }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
      });
    });
    return true; // Async response
  }
});

function saveAndOpen(dataUrl, mode) {
  chrome.storage.local.set({
    tempScreenshot: dataUrl,
    captureMode: mode || 'visible',
    timestamp: Date.now()
  }, () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  });
}