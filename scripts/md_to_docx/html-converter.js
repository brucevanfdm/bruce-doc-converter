/**
 * HTML 到 DOCX 转换器（简化版）
 * 将 HTML 转换为 docx.js 组件结构
 * 适用于 Node.js 环境，使用 jsdom 提供 DOM 支持
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign } = require('docx');
const { charsToTwips } = require('./styles');

// Node 类型常量
const NODE_TYPE = {
  TEXT_NODE: 3,
  ELEMENT_NODE: 1
};

const MAX_LIST_LEVEL = 4;

// Emoji 正则：匹配常见 Emoji 字符（包括组合 Emoji）
const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}(?:\u{FE0F}|\u{200D}\p{Extended_Pictographic})*)/gu;

/**
 * 将文本拆分为普通文本和 Emoji 片段，对 Emoji 使用 Segoe UI Emoji 字体
 * @param {string} text - 原始文本
 * @param {object} baseStyle - 基础样式
 * @returns {TextRun[]} TextRun 数组
 */
function createTextRunsWithEmoji(text, baseStyle = {}) {
  if (!EMOJI_REGEX.test(text)) {
    return [Object.keys(baseStyle).length > 0 ? new TextRun({ text, ...baseStyle }) : new TextRun(text)];
  }
  // 重置 lastIndex
  EMOJI_REGEX.lastIndex = 0;

  const runs = [];
  let lastIndex = 0;
  let match;

  while ((match = EMOJI_REGEX.exec(text)) !== null) {
    // 添加 Emoji 前的普通文本
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      runs.push(Object.keys(baseStyle).length > 0 ? new TextRun({ text: before, ...baseStyle }) : new TextRun(before));
    }
    // 添加 Emoji（使用 Segoe UI Emoji 字体）
    runs.push(new TextRun({ text: match[0], font: "Segoe UI Emoji", ...baseStyle }));
    lastIndex = match.index + match[0].length;
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    runs.push(Object.keys(baseStyle).length > 0 ? new TextRun({ text: remaining, ...baseStyle }) : new TextRun(remaining));
  }

  return runs;
}
const MAX_IMAGE_WIDTH_PX = 560;

// Markdown 文件所在目录，用于解析相对路径图片
let _basePath = null;
const DEFAULT_IMAGE_HEIGHT_PX = 280;
const SVG_FALLBACK_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6N6t0AAAAASUVORK5CYII=',
  'base64'
);

const MIME_TO_IMAGE_TYPE = {
  'image/png': 'png',
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg'
};

const EXT_TO_IMAGE_TYPE = {
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.gif': 'gif',
  '.bmp': 'bmp',
  '.svg': 'svg'
};

/**
 * 将 HTML 字符串转换为 docx 组件数组
 * @param {string} htmlString - HTML 字符串
 * @returns {Array} docx 组件数组
 */
function convertHTMLToDocx(htmlString, basePath) {
  _basePath = (basePath && typeof basePath === 'string') ? basePath : null;
  const dom = new JSDOM(`<body>${htmlString}</body>`);
  const temp = dom.window.document.body;

  const children = [];

  for (const node of temp.childNodes) {
    const converted = convertNode(node);
    if (converted) {
      if (Array.isArray(converted)) {
        children.push(...converted);
      } else {
        children.push(converted);
      }
    }
  }

  return children.length > 0 ? children : [new Paragraph({ text: '' })];
}

/**
 * 转换单个 DOM 节点
 */
function convertNode(node) {
  // 文本节点
  if (node.nodeType === NODE_TYPE.TEXT_NODE) {
    const text = node.textContent.trim();
    if (text) {
      return new Paragraph({
        children: [new TextRun(text)],
        indent: { firstLine: charsToTwips(2) }
      });
    }
    return null;
  }

  // 元素节点
  if (node.nodeType === NODE_TYPE.ELEMENT_NODE) {
    const tagName = node.nodeName.toUpperCase();

    switch (tagName) {
      case 'H1':
        return new Paragraph({
          children: createTextRunsWithEmoji(node.textContent),
          style: "Heading1"
        });

      case 'H2':
        return new Paragraph({
          children: createTextRunsWithEmoji(node.textContent),
          style: "Heading2"
        });

      case 'H3':
        return new Paragraph({
          children: createTextRunsWithEmoji(node.textContent),
          style: "Heading3"
        });

      case 'H4':
      case 'H5':
      case 'H6':
        return new Paragraph({
          children: createTextRunsWithEmoji(node.textContent),
          style: "Heading3"
        });

      case 'P':
        return convertParagraph(node);

      case 'PRE':
        return convertCodeBlock(node);

      case 'BLOCKQUOTE':
        return convertBlockquote(node);

      case 'TABLE':
        return convertTable(node);

      case 'UL':
      case 'OL':
        return convertList(node);

      case 'IMG':
        return convertImage(node);

      case 'HR':
        return new Paragraph({
          children: [new TextRun({ text: '─'.repeat(50), color: 'CCCCCC' })],
          alignment: AlignmentType.CENTER
        });

      case 'BR':
        return new Paragraph({ text: '' });

      case 'DIV':
      case 'SECTION':
      case 'ARTICLE':
      case 'SPAN':
        return convertChildren(node);

      default:
        return convertChildren(node);
    }
  }

  return null;
}

/**
 * 转换段落元素
 */
function convertParagraph(pElement) {
  const runs = convertInlineNodes(pElement.childNodes);
  return new Paragraph({
    children: runs.length > 0 ? runs : [new TextRun('')],
    indent: { firstLine: charsToTwips(2) }
  });
}

/**
 * 转换代码块
 */
function convertCodeBlock(preElement) {
  const codeElement = preElement.querySelector('code') || preElement;
  const codeText = codeElement.textContent;
  const lines = codeText.split('\n');

  const textRuns = [];
  lines.forEach((line, index) => {
    textRuns.push(new TextRun({
      text: line || ' ',
      font: "Consolas",
      size: 22,
      color: "1F2937"
    }));

    if (index < lines.length - 1) {
      textRuns.push(new TextRun({ text: '', break: 1 }));
    }
  });

  return new Paragraph({
    children: textRuns,
    style: "CodeBlock"
  });
}

/**
 * 转换图片元素
 */
function convertImage(imgElement) {
  const alt = imgElement.getAttribute('alt') || '';
  const src = imgElement.getAttribute('src') || '';
  const imageRun = createImageRun(imgElement);

  if (imageRun) {
    return new Paragraph({
      children: [imageRun],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 }
    });
  }

  let description = '[图片]';
  if (alt) {
    description = `[图片: ${alt}]`;
  }
  if (src && !src.startsWith('data:')) {
    description += ` (${src})`;
  }

  return new Paragraph({
    children: [new TextRun({ text: description, italics: true, color: "6B7280" })],
    spacing: { before: 200, after: 200 }
  });
}

function createImageRun(imgElement) {
  const src = (imgElement.getAttribute('src') || '').trim();
  if (!src) return null;

  const imageData = parseDataImage(src) || parseLocalImage(src);
  if (!imageData) return null;

  const transformation = computeImageTransformation(imgElement, imageData);

  if (imageData.type === 'svg') {
    return new ImageRun({
      type: 'svg',
      data: imageData.data,
      fallback: {
        type: 'png',
        data: SVG_FALLBACK_PIXEL
      },
      transformation
    });
  }

  return new ImageRun({
    type: imageData.type,
    data: imageData.data,
    transformation
  });
}

function parseDataImage(src) {
  const match = src.match(/^data:(image\/[a-zA-Z0-9.+-]+)(;[^,]*)?,([\s\S]+)$/i);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const metadata = match[2] || '';
  const payload = match[3] || '';
  const imageType = MIME_TO_IMAGE_TYPE[mime];

  if (!imageType) {
    return null;
  }

  let buffer;
  if (metadata.toLowerCase().includes(';base64')) {
    buffer = Buffer.from(payload, 'base64');
  } else {
    try {
      buffer = Buffer.from(decodeURIComponent(payload), 'utf-8');
    } catch (error) {
      return null;
    }
  }

  if (!buffer.length) {
    return null;
  }

  return {
    type: imageType,
    data: buffer,
    svgMeta: imageType === 'svg' ? parseSvgMeta(buffer.toString('utf-8')) : null
  };
}

function parseLocalImage(src) {
  if (/^https?:\/\//i.test(src)) return null;
  if (src.startsWith('data:')) return null;

  let localPath = src;

  if (src.startsWith('file://')) {
    try {
      const fileUrl = new URL(src);
      // 处理 file://C:/path 格式（两个斜杠，Windows 盘符被误识别为 hostname）
      if (process.platform === 'win32' && /^[a-zA-Z]$/.test(fileUrl.hostname)) {
        localPath = safeDecodeURIComponent(fileUrl.hostname + ':' + fileUrl.pathname);
      } else {
        localPath = safeDecodeURIComponent(fileUrl.pathname);
        if (process.platform === 'win32' && localPath.startsWith('/')) {
          localPath = localPath.slice(1);
        }
      }
    } catch (error) {
      return null;
    }
  }

  let decodedPath = safeDecodeURIComponent(localPath);
  // 处理 /C:/path 格式（前导斜杠 + Windows 盘符）
  if (process.platform === 'win32' && /^\/[a-zA-Z]:[\\/]/.test(decodedPath)) {
    decodedPath = decodedPath.slice(1);
  }
  const resolvedPath = (_basePath && !path.isAbsolute(decodedPath))
    ? path.resolve(_basePath, decodedPath)
    : path.resolve(decodedPath);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return null;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const imageType = EXT_TO_IMAGE_TYPE[extension];
  if (!imageType) return null;

  const data = fs.readFileSync(resolvedPath);
  return {
    type: imageType,
    data,
    svgMeta: imageType === 'svg' ? parseSvgMeta(data.toString('utf-8')) : null
  };
}

function computeImageTransformation(imgElement, imageData) {
  const widthAttr = Number.parseInt(imgElement.getAttribute('width') || '', 10);
  const heightAttr = Number.parseInt(imgElement.getAttribute('height') || '', 10);
  const hasWidthAttr = Number.isFinite(widthAttr) && widthAttr > 0;
  const hasHeightAttr = Number.isFinite(heightAttr) && heightAttr > 0;
  const ratio = getAspectRatio(imageData);

  let width = hasWidthAttr ? widthAttr : MAX_IMAGE_WIDTH_PX;
  let scaleByWidth = 1;
  if (width > MAX_IMAGE_WIDTH_PX) {
    scaleByWidth = MAX_IMAGE_WIDTH_PX / width;
    width = MAX_IMAGE_WIDTH_PX;
  }

  let height;
  if (hasHeightAttr) {
    // 当宽度被页面上限收缩时，同步按比例缩放高度，避免图像拉伸
    height = Math.round(heightAttr * scaleByWidth);
  } else {
    height = Math.round(width / ratio);
  }

  if (!Number.isFinite(height) || height <= 0) {
    height = DEFAULT_IMAGE_HEIGHT_PX;
  }

  return { width, height };
}

function getAspectRatio(imageData) {
  if (imageData.type === 'svg' && imageData.svgMeta) {
    const { width, height } = imageData.svgMeta;
    if (width > 0 && height > 0) {
      return width / height;
    }
  }
  return 16 / 9;
}

function parseSvgMeta(svgText) {
  const viewBoxMatch = svgText.match(/viewBox="([^"]+)"/i);
  if (viewBoxMatch) {
    const values = viewBoxMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map(value => Number.parseFloat(value));
    if (values.length === 4 && values[2] > 0 && values[3] > 0) {
      return { width: values[2], height: values[3] };
    }
  }

  const widthMatch = svgText.match(/\bwidth="([\d.]+)(px)?"/i);
  const heightMatch = svgText.match(/\bheight="([\d.]+)(px)?"/i);
  const width = widthMatch ? Number.parseFloat(widthMatch[1]) : NaN;
  const height = heightMatch ? Number.parseFloat(heightMatch[1]) : NaN;
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height };
  }

  return null;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

/**
 * 转换列表元素
 */
function convertList(listElement, level = 0) {
  const paragraphs = [];
  const isOrdered = listElement.nodeName === 'OL';
  const reference = isOrdered ? "numbered-list" : "bullet-list";
  const safeLevel = Math.min(level, MAX_LIST_LEVEL);

  // 避免 :scope 在部分环境兼容性不佳，手动筛选直接子元素
  const listItems = Array.from(listElement.childNodes).filter(child =>
    child.nodeType === NODE_TYPE.ELEMENT_NODE &&
    child.nodeName.toUpperCase() === 'LI'
  );
  for (const li of listItems) {
    let hasNumberedParagraph = false;
    let currentRuns = [];

    const appendParagraph = (runs, numbered) => {
      if (runs.length === 0 && !numbered) return;
      const options = {
        children: runs.length > 0 ? runs : [new TextRun('')]
      };

      if (numbered) {
        options.numbering = { reference: reference, level: safeLevel };
      } else {
        // 列表项续行：缩进以对齐列表文本
        options.indent = { left: 720 + safeLevel * 720 };
      }

      paragraphs.push(new Paragraph(options));
      if (numbered) {
        hasNumberedParagraph = true;
      }
    };

    const flushRuns = (numbered) => {
      if (currentRuns.length === 0 && !numbered) return;
      appendParagraph(currentRuns, numbered);
      currentRuns = [];
    };

    for (const child of li.childNodes) {
      if (child.nodeType === NODE_TYPE.ELEMENT_NODE) {
        const tagName = child.nodeName.toUpperCase();
        if (tagName === 'UL' || tagName === 'OL') {
          if (!hasNumberedParagraph) {
            flushRuns(true);
          } else if (currentRuns.length > 0) {
            flushRuns(false);
          }

          const nestedParagraphs = convertList(child, level + 1);
          paragraphs.push(...nestedParagraphs);
          continue;
        }
      }

      currentRuns.push(...convertInlineNodes([child], true));
    }

    if (!hasNumberedParagraph) {
      flushRuns(true);
    } else if (currentRuns.length > 0) {
      flushRuns(false);
    }
  }

  return paragraphs;
}

/**
 * 转换表格
 */
function convertTable(tableElement) {
  const rows = [];

  // 处理表头
  const thead = tableElement.querySelector('thead');
  if (thead) {
    const headerRows = thead.querySelectorAll('tr');
    headerRows.forEach(tr => {
      const cells = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        const headerCellContent = convertCellContent(cell, true);

        cells.push(new TableCell({
          children: headerCellContent,
          shading: { fill: "E5E7EB" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 150, right: 150 }
        }));
      });

      if (cells.length > 0) {
        rows.push(new TableRow({ children: cells, tableHeader: true }));
      }
    });
  }

  // 处理表体
  const tbody = tableElement.querySelector('tbody') || tableElement;
  const bodyRows = tbody.querySelectorAll('tr');
  bodyRows.forEach(tr => {
    if (thead && thead.contains(tr)) return;

    const cells = [];
    tr.querySelectorAll('th, td').forEach(cell => {
      const cellContent = convertCellContent(cell);
      cells.push(new TableCell({
        children: cellContent,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 150, right: 150 }
      }));
    });

    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  });

  return new Table({
    rows: rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
      left: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
      right: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" }
    }
  });
}

/**
 * 转换表格单元格内容
 */
function convertCellContent(cellElement, isHeader = false) {
  const runs = convertInlineNodes(cellElement.childNodes, false, isHeader);
  return [new Paragraph({
    children: runs.length > 0 ? runs : [new TextRun('')],
    alignment: (isHeader || cellElement.nodeName === 'TH') ? AlignmentType.CENTER : AlignmentType.LEFT
  })];
}

/**
 * 转换引用块
 */
function convertBlockquote(blockquoteElement) {
  const paragraphs = [];

  for (const child of blockquoteElement.childNodes) {
    if (child.nodeName === 'P') {
      const runs = convertInlineNodes(child.childNodes);
      paragraphs.push(new Paragraph({ children: runs, style: "Quote" }));
    } else if (child.nodeType === NODE_TYPE.TEXT_NODE) {
      const text = child.textContent.trim();
      if (text) {
        paragraphs.push(new Paragraph({ children: [new TextRun(text)], style: "Quote" }));
      }
    }
  }

  return paragraphs.length > 0 ? paragraphs : [new Paragraph({
    text: blockquoteElement.textContent,
    style: "Quote"
  })];
}

/**
 * 递归转换容器的子元素
 */
function convertChildren(containerElement) {
  const children = [];

  for (const child of containerElement.childNodes) {
    const converted = convertNode(child);
    if (converted) {
      if (Array.isArray(converted)) {
        children.push(...converted);
      } else {
        children.push(converted);
      }
    }
  }

  return children;
}

/**
 * 转换内联元素为 TextRun 数组
 * @param {NodeList} nodes - 节点列表
 * @param {boolean} skipNestedLists - 是否跳过嵌套列表
 */
function convertInlineNodes(nodes, skipNestedLists = false, applyBold = false) {
  const runs = [];

  for (const node of nodes) {
    if (node.nodeType === NODE_TYPE.TEXT_NODE) {
      const text = node.textContent;
      if (text && text.trim()) {
        runs.push(...createTextRunsWithEmoji(text, applyBold ? { bold: true, size: 24 } : {}));
      }
    } else if (node.nodeType === NODE_TYPE.ELEMENT_NODE) {
      const tagName = node.nodeName.toUpperCase();

      // 跳过嵌套列表
      if (skipNestedLists && (tagName === 'UL' || tagName === 'OL')) {
        continue;
      }

      switch (tagName) {
        case 'STRONG':
        case 'B':
          runs.push(...createTextRunsWithEmoji(node.textContent, { bold: true, ...(applyBold ? { size: 24 } : {}) }));
          break;

        case 'EM':
        case 'I':
          runs.push(...createTextRunsWithEmoji(node.textContent, { italics: true, ...(applyBold ? { bold: true, size: 24 } : {}) }));
          break;

        case 'DEL':
        case 'S':
          runs.push(...createTextRunsWithEmoji(node.textContent, { strike: true, ...(applyBold ? { bold: true, size: 24 } : {}) }));
          break;

        case 'CODE':
          runs.push(new TextRun({
            text: node.textContent,
            font: "Consolas",
            size: 22,
            color: "DC2626",
            ...(applyBold ? { bold: true } : {})
          }));
          break;

        case 'A':
          runs.push(...createTextRunsWithEmoji(node.textContent, { color: "2563EB", underline: {}, ...(applyBold ? { bold: true, size: 24 } : {}) }));
          break;

        case 'BR':
          runs.push(new TextRun({ text: '', break: 1 }));
          break;

        case 'IMG': {
          const imageRun = createImageRun(node);
          if (imageRun) {
            runs.push(imageRun);
          } else {
            const alt = node.getAttribute('alt') || '图片';
            const src = node.getAttribute('src') || '';
            const fallbackText = src ? `[图片: ${alt}] (${src})` : `[图片: ${alt}]`;
            runs.push(new TextRun({ text: fallbackText, italics: true, color: "6B7280" }));
          }
          break;
        }

        default:
          runs.push(...convertInlineNodes(node.childNodes, skipNestedLists, applyBold));
      }
    }
  }

  return runs;
}

module.exports = {
  convertHTMLToDocx
};
