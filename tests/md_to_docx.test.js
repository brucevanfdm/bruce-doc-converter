const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { markdownToHTML } = require('../bruce_doc_converter/md_to_docx/markdown-converter');
const { convertHTMLToDocx } = require('../bruce_doc_converter/md_to_docx/html-converter');

function collectDocxText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(collectDocxText).join('');
  return collectDocxText(value.root);
}

test('markdown 表格支持转义管道符', async () => {
  const markdown = [
    '| col1 | col2 |',
    '| --- | --- |',
    '| a\\|b | c |'
  ].join('\n');

  const html = await markdownToHTML(markdown);

  assert.match(html, /<th>col1<\/th>/);
  assert.match(html, /<th>col2<\/th>/);
  assert.match(html, /<td>a\|b<\/td>/);
  assert.equal((html.match(/<th>/g) || []).length, 2);
  assert.equal((html.match(/<td>/g) || []).length, 2);
});

test('markdown 链接和图片支持带圆括号的 URL', async () => {
  const markdown = [
    '[link](https://example.com/a_(b).png)',
    '',
    '![img](https://example.com/a_(b).png)'
  ].join('\n');

  const html = await markdownToHTML(markdown);

  assert.match(html, /href="https:\/\/example\.com\/a_\(b\)\.png"/);
  assert.match(html, /src="https:\/\/example\.com\/a_\(b\)\.png"/);
});

test('HTML 转 DOCX 保留混合内联样式和超链接目标', () => {
  const children = convertHTMLToDocx(
    '<p><strong><em>混合格式</em></strong> <a href="https://example.com">链接</a></p>',
    process.cwd()
  );

  assert.equal(children.length, 1);

  const paragraph = children[0];
  const firstRun = paragraph.root.find(child => child && child.rootKey === 'w:r');
  const hyperlink = paragraph.root.find(child => child && child.rootKey === 'w:externalHyperlink');

  assert.ok(firstRun, '应生成首个文本 run');
  assert.ok(hyperlink, '应保留超链接节点');
  assert.equal(hyperlink.options.link, 'https://example.com');

  const styleKeys = firstRun.properties.root.map(item => item.rootKey);
  assert.ok(styleKeys.includes('w:b'));
  assert.ok(styleKeys.includes('w:i'));
});

test('fenced code block 保留首个空行，只移除 fence 结尾带来的一个换行', async () => {
  const markdown = '```js\n\nconst x = 1;\n\n```';
  const html = await markdownToHTML(markdown);

  assert.equal(html, '<pre><code class="language-js">\nconst x = 1;\n</code></pre>');
});

test('HTML 转 DOCX 只允许读取 Markdown 目录内的相对图片', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdc-image-scope-'));
  try {
    const insideDir = path.join(tmpDir, 'inside');
    const outsideDir = path.join(tmpDir, 'outside');
    fs.mkdirSync(insideDir);
    fs.mkdirSync(outsideDir);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6N6t0AAAAASUVORK5CYII=',
      'base64'
    );
    const allowedImage = path.join(insideDir, 'allowed.png');
    const outsideImage = path.join(outsideDir, 'secret.png');
    fs.writeFileSync(allowedImage, png);
    fs.writeFileSync(outsideImage, png);

    const allowed = convertHTMLToDocx('<p><img src="allowed.png" alt="allowed"></p>', insideDir);
    const absolute = convertHTMLToDocx(`<p><img src="${outsideImage}" alt="absolute"></p>`, insideDir);
    const fileUrl = convertHTMLToDocx(`<p><img src="file://${outsideImage}" alt="file"></p>`, insideDir);
    const traversal = convertHTMLToDocx('<p><img src="../outside/secret.png" alt="traversal"></p>', insideDir);

    assert.ok(
      allowed[0].root.some(child => child && child.rootKey === 'w:r'),
      '目录内相对图片应正常生成 run'
    );
    assert.match(collectDocxText(absolute), /\[图片: absolute\]/);
    assert.match(collectDocxText(fileUrl), /\[图片: file\]/);
    assert.match(collectDocxText(traversal), /\[图片: traversal\]/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
