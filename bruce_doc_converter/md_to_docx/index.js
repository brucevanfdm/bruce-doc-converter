#!/usr/bin/env node
/**
 * Markdown 转 DOCX 命令行工具
 * 用法: node index.js <input.md> [output_dir]
 */

const fs = require('fs');
const path = require('path');

/**
 * 将 Markdown 文件转换为 DOCX
 * @param {string} inputPath - 输入的 Markdown 文件路径
 * @param {string} outputDir - 输出目录（可选）
 * @returns {Object} 转换结果
 */
async function convertMarkdownToDocx(inputPath, outputDir) {
  try {
    const { Document, Packer } = require('docx');
    const { markdownToHTML } = require('./markdown-converter');
    const { convertHTMLToDocx } = require('./html-converter');
    const { createStyles, createNumbering, createMargins } = require('./styles');

    // 验证输入文件
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `文件不存在: ${inputPath}` };
    }

    // 读取 Markdown 文件
    const markdown = fs.readFileSync(inputPath, 'utf-8');

    // Markdown -> HTML
    const html = await markdownToHTML(markdown);

    // HTML -> DOCX 组件（传入 Markdown 文件所在目录，用于解析相对路径图片）
    const mdDir = path.dirname(path.resolve(inputPath));
    const docxChildren = convertHTMLToDocx(html, mdDir);

    // 创建文档
    const doc = new Document({
      styles: createStyles(),
      numbering: createNumbering(),
      sections: [{
        properties: { page: { margin: createMargins() } },
        children: docxChildren
      }]
    });

    // 确定输出路径
    const inputDir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));

    let finalOutputDir;
    if (outputDir) {
      finalOutputDir = outputDir;
    } else {
      finalOutputDir = path.join(inputDir, 'Word');
    }

    // 创建输出目录
    if (!fs.existsSync(finalOutputDir)) {
      fs.mkdirSync(finalOutputDir, { recursive: true });
    }

    const outputPath = path.join(finalOutputDir, `${baseName}.docx`);

    // 生成并保存文档
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);

    return {
      success: true,
      output_path: outputPath,
      message: `转换成功: ${outputPath}`
    };

  } catch (error) {
    return {
      success: false,
      error: `转换错误: ${error.message}`
    };
  }
}

// 命令行入口
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    console.log(JSON.stringify({
      success: true,
      usage: 'node index.js <input.md> [output_dir]'
    }, null, 2));
    process.exit(0);
  }

  if (args.length < 1) {
    console.log(JSON.stringify({
      success: false,
      error: '用法: node index.js <input.md> [output_dir]'
    }));
    process.exit(1);
  }

  const inputPath = args[0];
  const outputDir = args[1] || '';

  const result = await convertMarkdownToDocx(inputPath, outputDir || null);
  console.log(JSON.stringify(result, null, 2));

  process.exit(result.success ? 0 : 1);
}

main();
