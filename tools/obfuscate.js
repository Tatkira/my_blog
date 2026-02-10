const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const { minify: htmlMinify } = require('html-minifier-terser');
const JavaScriptObfuscator = require('javascript-obfuscator');
const CleanCSS = require('clean-css');
const crypto = require('crypto');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function asyncGlob(pattern){
  return new Promise((resolve, reject) => {
    glob(pattern, { nodir: true }, (err, files) => err ? reject(err) : resolve(files));
  });
}

async function processCSS(){
  const files = await asyncGlob(path.join(PUBLIC_DIR, '**/*.css'));
  for(const f of files){
    try{
      const css = await fs.readFile(f, 'utf8');
      const out = new CleanCSS({}).minify(css).styles;
      await fs.writeFile(f, out, 'utf8');
      console.log('minified css:', path.relative(PUBLIC_DIR, f));
    }catch(e){ console.error('css', f, e); }
  }
}

async function processJS(){
  const files = await asyncGlob(path.join(PUBLIC_DIR, '**/*.js'));
  // 增强但保持性能友好：跳过第三方/已压缩文件，使用 identifier 重命名 + stringArray(base64)，不启用 controlFlowFlattening/deadCodeInjection
  const SKIP_REGEX = /(\.min\.js$|jquery|fancybox|font-awesome|prism|vendor|node_modules|resume)/i;
  for(const f of files){
    try{
      const rel = path.relative(PUBLIC_DIR, f);
      if(SKIP_REGEX.test(rel)){
        console.log('skip js:', rel);
        continue;
      }
      const js = await fs.readFile(f, 'utf8');
      const ob = JavaScriptObfuscator.obfuscate(js, {
        compact: true,
        // 性能敏感：不启用以下两项
        controlFlowFlattening: false,
        deadCodeInjection: false,
        // 使用字符串数组（base64）和标识符重命名，提高可读性难度但影响较小
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        rotateStringArray: true,
        identifierNamesGenerator: 'hexadecimal',
        disableConsoleOutput: true
      });
      await fs.writeFile(f, ob.getObfuscatedCode(), 'utf8');
      console.log('obfuscated js (balanced):', rel);
    }catch(e){ console.error('js', f, e); }
  }
}

async function processHTML(){
  const files = await asyncGlob(path.join(PUBLIC_DIR, '**/*.html'));
  for(const f of files){
    try{
      const html = await fs.readFile(f, 'utf8');
      const out = await htmlMinify(html, {
        collapseWhitespace: true,
        removeComments: true,
        removeAttributeQuotes: true,
        collapseBooleanAttributes: true,
        removeRedundantAttributes: true,
        removeEmptyAttributes: true,
        minifyURLs: true,
        minifyCSS: true,
        minifyJS: false
      });
      await fs.writeFile(f, out, 'utf8');
      console.log('minified html:', path.relative(PUBLIC_DIR, f));
    }catch(e){ console.error('html', f, e); }
  }
}

async function processIndex(){
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if(!await fs.pathExists(indexPath)){
    console.warn('public/index.html 不存在，跳过首页处理。');
    return;
  }
  let html = await fs.readFile(indexPath, 'utf8');
  // 匹配无 src 的内联 script，忽略 type="application/ld+json"
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  const extracts = [];
  while((match = re.exec(html)) !== null){
    const attrs = match[1] || '';
    const content = match[2] || '';
    if(/\bsrc\s*=/.test(attrs)) continue; // 已有外部脚本
    if(/type\s*=\s*["']?application\/ld\+json["']?/.test(attrs)) continue; // 跳过 JSON-LD
    const trimmed = content.trim();
    if(!trimmed) continue;
    if(trimmed[0] === '{' || trimmed[0] === '[') {
      // 可能是纯 JSON 数据，跳过以免破坏
      continue;
    }
    const hash = crypto.createHash('sha1').update(content).digest('hex').slice(0,8);
    const outName = `inline-${hash}.js`;
    const outRel = path.posix.join('js', outName);
    const outPath = path.join(PUBLIC_DIR, 'js', outName);
    extracts.push({full: match[0], attrs, content, outRel, outPath});
  }

  if(extracts.length === 0){
    console.log('首页没有可抽取的内联脚本。');
    // 仍然压缩 HTML
    const mined = await htmlMinify(html, { collapseWhitespace: true, removeComments: true, minifyCSS: true, minifyJS: false });
    await fs.writeFile(indexPath, mined, 'utf8');
    console.log('首页已压缩。');
    return;
  }

  await fs.ensureDir(path.join(PUBLIC_DIR, 'js'));
  for(const item of extracts){
    try{
      // 若文件已存在则跳过写入原始内容
      if(!await fs.pathExists(item.outPath)){
        await fs.writeFile(item.outPath, item.content, 'utf8');
      }
      // 读取并混淆
      const js = await fs.readFile(item.outPath, 'utf8');
      const ob = JavaScriptObfuscator.obfuscate(js, {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        rotateStringArray: true,
        identifierNamesGenerator: 'hexadecimal',
        disableConsoleOutput: true
      });
      await fs.writeFile(item.outPath, ob.getObfuscatedCode(), 'utf8');
      // 替换 HTML 中的内联脚本为外链（使用绝对或根相对路径）
      const replacement = `<script src="/${item.outRel}"></script>`;
      html = html.replace(item.full, replacement);
      console.log('处理首页内联脚本，输出：', item.outRel);
    }catch(e){ console.error('处理首页脚本出错：', e); }
  }

  // 最后压缩 HTML
  const mined = await htmlMinify(html, { collapseWhitespace: true, removeComments: true, minifyCSS: true, minifyJS: false });
  await fs.writeFile(indexPath, mined, 'utf8');
  console.log('首页内联脚本已抽取并混淆，index.html 已更新并压缩。');
}

async function run(){
  if(!await fs.pathExists(PUBLIC_DIR)){
    console.error('public/ 目录不存在，请先运行 hexo generate 再运行本脚本。');
    process.exit(1);
  }
  const mode = process.argv[2] || 'all';
  if(mode === 'index'){
    console.log('仅处理首页（public/index.html）——抽取并混淆内联脚本、压缩 HTML');
    await processIndex();
    return;
  }
  console.log('开始处理 public/ —— CSS 压缩 → JS 混淆 → HTML 压缩');
  await processCSS();
  await processJS();
  await processHTML();
  console.log('处理完成。');
}

run().catch(err => { console.error(err); process.exit(2); });
