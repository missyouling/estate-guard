const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

const CACHE_DIR = '/app/uploads/preview-cache';
const UPLOADS_DIR = '/app/uploads';
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '2', 10);
const CONVERSION_TIMEOUT = parseInt(process.env.CONVERSION_TIMEOUT || '120000', 10);
const LIBREOFFICE_SECRET = process.env.LIBREOFFICE_SECRET || 'lo-default-secret';

let activeJobs = 0;
let queue = [];

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${LIBREOFFICE_SECRET}`) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/convert', authMiddleware, async (req, res) => {
  const { filePath, fileHash } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing filePath' });
  }

  // Resolve source file — filePath is /files/documents/uuid.doc → documents/uuid.doc
  const safePath = filePath.replace(/\.\.\//g, '').replace(/^\/?files\//, '').replace(/^\//, '');
  const sourceFile = path.join(UPLOADS_DIR, safePath);

  if (!fs.existsSync(sourceFile)) {
    return res.status(404).json({ error: 'Source file not found' });
  }

  // Check cache by hash
  const cacheKey = fileHash || crypto.createHash('md5').update(sourceFile + fs.statSync(sourceFile).size).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.pdf`);
  if (fs.existsSync(cachePath)) {
    const pdfUrl = `/files/preview-cache/${cacheKey}.pdf`;
    return res.json({ pdfUrl, cached: true });
  }

  // Enforce concurrency limit
  if (activeJobs >= MAX_CONCURRENT) {
    return res.status(503).json({ error: 'Server busy, try again', retryable: true });
  }

  activeJobs++;

  try {
    const pdfPath = await convertToPdf(sourceFile, CACHE_DIR, cacheKey);

    const pdfUrl = `/files/preview-cache/${cacheKey}.pdf`;
    res.json({ pdfUrl, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Conversion failed' });
  } finally {
    activeJobs--;
    processQueue();
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeJobs, queued: queue.length });
});

function convertToPdf(sourceFile, outputDir, cacheKey) {
  return new Promise((resolve, reject) => {
    // LibreOffice names output by source file's basename, so we convert to tmp dir
    // then rename to cacheKey.pdf
    const tmpDir = path.join(outputDir, '.tmp');
    fs.mkdirSync(tmpDir, { recursive: true });

    const proc = spawn('libreoffice', [
      '--headless',
      '--convert-to', 'pdf:writer_pdf_Export:EmbedFonts,SelectPdfVersion=1,IsSkipEmptyPages=false,ExportPlaceholders=true,UseLosslessCompression=false',
      '--outdir', tmpDir,
      sourceFile,
    ], {
      env: { ...process.env, HOME: '/tmp', LANG: 'zh_CN.UTF-8', LC_ALL: 'zh_CN.UTF-8' },
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('转换超时，文档过大或格式异常'));
    }, CONVERSION_TIMEOUT);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = stderr ? ` (${stderr.slice(0, 200)})` : '';
        reject(new Error(`LibreOffice 转换失败 (exit ${code})${detail}`));
        return;
      }
      // LibreOffice names the output after the source file (with .pdf extension)
      const sourceName = path.parse(sourceFile).name;
      const tmpPdf = path.join(tmpDir, `${sourceName}.pdf`);
      const outputPath = path.join(outputDir, `${cacheKey}.pdf`);
      if (!fs.existsSync(tmpPdf)) {
        // Try alternate name in case of unusual filenames
        const altTmpPdf = path.join(tmpDir, `${cacheKey}.pdf`);
        if (fs.existsSync(altTmpPdf)) {
          fs.renameSync(altTmpPdf, outputPath);
          return resolve(outputPath);
        }
        reject(new Error('转换后未找到输出文件'));
        return;
      }
      // Rename to cacheKey-based name
      fs.renameSync(tmpPdf, outputPath);
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 LibreOffice: ${err.message}`));
    });
  });
}

function processQueue() {
  if (queue.length > 0 && activeJobs < MAX_CONCURRENT) {
    const next = queue.shift();
    next();
  }
}

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(path.join(CACHE_DIR, '.tmp'), { recursive: true });

const port = 3001;
app.listen(port, '0.0.0.0', () => {
  console.log(`LibreOffice converter listening on port ${port}`);
});
