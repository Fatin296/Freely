/**
 * Freely - Mockup Generator
 * Generates professional browser window mockups
 */

class MockupGenerator {
  constructor() {
    this.config = {
      macOS: {
        titleBarHeight: 42,
        buttonSize: 12,
        buttonSpacing: 8,
        buttonLeftMargin: 20,
        cornerRadius: 12,
        shadows: true
      },
      windows: {
        titleBarHeight: 40,
        buttonWidth: 46,
        buttonHeight: 30,
        cornerRadius: 8,
        shadows: true
      }
    };
    
    this.colors = {
      macOS: {
        light: {
          titleBar: '#F3F3F3',
          border: '#D1D1D1',
          closeBtn: '#FF5F56',
          minimizeBtn: '#FFBD2E',
          maximizeBtn: '#27C93F',
          shadow: 'rgba(0, 0, 0, 0.2)'
        },
        dark: {
          titleBar: '#2D2D2D',
          border: '#000000',
          closeBtn: '#FF5F56',
          minimizeBtn: '#FFBD2E',
          maximizeBtn: '#27C93F',
          shadow: 'rgba(0, 0, 0, 0.4)'
        }
      },
      windows: {
        light: {
          titleBar: '#FFFFFF',
          border: '#D1D1D1',
          iconColor: '#000000',
          closeHover: '#E81123',
          shadow: 'rgba(0, 0, 0, 0.15)'
        },
        dark: {
          titleBar: '#202020',
          border: '#404040',
          iconColor: '#FFFFFF',
          closeHover: '#E81123',
          shadow: 'rgba(0, 0, 0, 0.4)'
        }
      }
    };
  }

  applyToCanvas(targetCanvas, screenshot, type = 'macOS', theme = 'light') {
    const normalizedType = type === 'macos' ? 'macOS' : type;
    const config = this.config[normalizedType] || this.config['macOS'];
    const colors = this.colors[normalizedType][theme];
    const ctx = targetCanvas.getContext('2d');
    
    const titleBarHeight = config.titleBarHeight;
    
    // Draw Window Frame
    if (normalizedType === 'macOS') {
      this.drawMacOSWindow(ctx, 0, 0, targetCanvas.width, targetCanvas.height, titleBarHeight, colors, config);
    } else {
      this.drawWindowsWindow(ctx, 0, 0, targetCanvas.width, targetCanvas.height, titleBarHeight, colors, config);
    }
    
    // Draw Screenshot Content (Clipped)
    ctx.save();
    ctx.beginPath();
    
    const radius = config.cornerRadius;
    const x = 0, y = titleBarHeight, w = targetCanvas.width, h = targetCanvas.height - titleBarHeight;
    
    // Bottom rounded corners clipping path
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.closePath();
    ctx.clip();
    
    ctx.drawImage(screenshot, 0, titleBarHeight);
    ctx.restore();
  }

  drawMacOSWindow(ctx, x, y, width, height, titleBarHeight, colors, config) {
    const radius = config.cornerRadius;
    ctx.fillStyle = colors.titleBar;
    
    // Window background
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();

    // Traffic Lights
    const startX = x + config.buttonLeftMargin;
    const buttonY = y + (titleBarHeight / 2);
    const spacing = config.buttonSize + config.buttonSpacing;
    
    this.drawCircle(ctx, startX, buttonY, config.buttonSize / 2, colors.closeBtn);
    this.drawCircle(ctx, startX + spacing, buttonY, config.buttonSize / 2, colors.minimizeBtn);
    this.drawCircle(ctx, startX + (spacing * 2), buttonY, config.buttonSize / 2, colors.maximizeBtn);
  }

  drawWindowsWindow(ctx, x, y, width, height, titleBarHeight, colors, config) {
    const radius = config.cornerRadius;
    
    // Window Background (Windows 11 style has top rounded corners only usually, but we'll round all slightly)
    ctx.fillStyle = colors.titleBar;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    
    // Add a subtle border for Windows
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Controls Area
    const btnW = config.buttonWidth;
    const btnH = config.buttonHeight; // slightly smaller than titlebar to look centered
    const controlY = y; 
    
    ctx.strokeStyle = colors.iconColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Minimize (-)
    const minX = width - (btnW * 3);
    ctx.moveTo(minX + 18, controlY + 20);
    ctx.lineTo(minX + 28, controlY + 20);
    
    // Maximize (Square)
    const maxX = width - (btnW * 2);
    ctx.rect(maxX + 18, controlY + 12, 10, 10);
    
    // Close (X)
    const closeX = width - btnW;
    ctx.moveTo(closeX + 18, controlY + 12);
    ctx.lineTo(closeX + 28, controlY + 22);
    ctx.moveTo(closeX + 28, controlY + 12);
    ctx.lineTo(closeX + 18, controlY + 22);
    
    ctx.stroke();
  }

  drawCircle(ctx, x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}