/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Tool, ToolSettings } from '../types/index.tsx';

/**
 * 🧙‍♂️ useDraw Hook
 * The core drawing logic for the canvas. It returns a draw function that
 * knows how to handle different tools (brush, eraser, fill).
 */
export const useDraw = (activeTool: Tool, toolSettings: ToolSettings) => {
  
  /**
   * IPO: Flood Fill Algorithm
   * @param {CanvasRenderingContext2D} ctx - The context of the layer to fill.
   * @param {number} startX - The starting X coordinate.
   * @param {number} startY - The starting Y coordinate.
   * @param {string} fillColor - The hex color string to fill with.
   */
  const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string) => {
    const canvas = ctx.canvas;
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const hexToRgba = (hex: string) => {
        let r = 0, g = 0, b = 0, a = 255;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
        return { r, g, b, a };
    };

    const fillRgba = hexToRgba(fillColor);
    const startIndex = (startY * width + startX) * 4;
    const startR = data[startIndex];
    const startG = data[startIndex + 1];
    const startB = data[startIndex + 2];
    const startA = data[startIndex + 3];

    if (startR === fillRgba.r && startG === fillRgba.g && startB === fillRgba.b && startA === fillRgba.a) {
        return; // Clicked on same color, do nothing
    }

    const pixelStack = [[startX, startY]];

    while (pixelStack.length) {
        const newPos = pixelStack.pop();
        if (!newPos) continue;
        // FIX: Use `let` for y-coordinate to allow modification within the loop.
        const [x] = newPos;
        let [, y] = newPos;

        let pixelPos = (y * width + x) * 4;

        // Go up as long as the color matches
        while (y >= 0 && matchStartColor(pixelPos)) {
            y--;
            pixelPos -= width * 4;
        }
        pixelPos += width * 4;
        y++;

        let reachLeft = false;
        let reachRight = false;

        while (y < height && matchStartColor(pixelPos)) {
            colorPixel(pixelPos);

            if (x > 0) {
                if (matchStartColor(pixelPos - 4)) {
                    if (!reachLeft) {
                        pixelStack.push([x - 1, y]);
                        reachLeft = true;
                    }
                } else if (reachLeft) {
                    reachLeft = false;
                }
            }

            if (x < width - 1) {
                if (matchStartColor(pixelPos + 4)) {
                    if (!reachRight) {
                        pixelStack.push([x + 1, y]);
                        reachRight = true;
                    }
                } else if (reachRight) {
                    reachRight = false;
                }
            }

            y++;
            pixelPos += width * 4;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    function matchStartColor(pixelPos: number) {
        return data[pixelPos] === startR && data[pixelPos + 1] === startG &&
               data[pixelPos + 2] === startB && data[pixelPos + 3] === startA;
    }

    function colorPixel(pixelPos: number) {
        data[pixelPos] = fillRgba.r;
        data[pixelPos + 1] = fillRgba.g;
        data[pixelPos + 2] = fillRgba.b;
        data[pixelPos + 3] = fillRgba.a;
    }
  };


  const draw = (
    ctx: CanvasRenderingContext2D,
    currentPoint: { x: number; y: number },
    prevPoint: { x: number; y: number } | null
  ) => {
    switch (activeTool) {
      case 'brush':
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = toolSettings.size;
        ctx.strokeStyle = toolSettings.color;
        ctx.globalCompositeOperation = 'source-over';
        
        ctx.beginPath();
        if (prevPoint) {
          ctx.moveTo(prevPoint.x, prevPoint.y);
        }
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        break;

      case 'eraser':
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = toolSettings.size;
        
        ctx.beginPath();
        if (prevPoint) {
          ctx.moveTo(prevPoint.x, prevPoint.y);
        }
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        break;

      case 'fill':
        floodFill(ctx, Math.round(currentPoint.x), Math.round(currentPoint.y), toolSettings.color);
        break;
    }
  };

  return draw;
};
