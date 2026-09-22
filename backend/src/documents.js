import { AppError } from './security.js';

const IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function prepareAttachments(attachments, { vision }) {
  const images = [];
  const texts = [];
  for (const file of attachments || []) {
    if (IMAGE.has(file.mime)) {
      if (vision === 'off' || vision === 'unlikely') {
        throw new AppError(
          'UNSUPPORTED_FILE',
          'This AI model is not set up to read images. On the server, set AI_VISION_MODEL to a vision-capable model (or AI_VISION=on). You can still send a PDF, DOCX, or text file. Sana did not pretend to see the image.',
          415
        );
      }
      images.push(file);
      continue;
    }
    const buffer = Buffer.from(file.dataBase64, 'base64');
    const text = await extractText(file, buffer);
    if (!text.trim()) {
      throw new AppError(
        'UNREADABLE_FILE',
        `Sana couldn't find readable text in “${file.name}”. If it is a scanned page, send a clear photo and use a vision model. Nothing was invented from the file.`,
        422
      );
    }
    texts.push({
      name: file.name,
      text: text.slice(0, 12000) + (text.length > 12000 ? '\n\n[Truncated — file was longer than the reading limit.]' : ''),
    });
  }
  return { images, texts };
}

async function extractText(file, buffer) {
  if (file.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').trim();
  }
  if (file.mime === 'application/pdf') {
    const modern = await extractPdf(buffer);
    if (modern.trim()) return modern.trim();
    return extractPdfFallback(buffer);
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
}

async function extractPdf(buffer) {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    if (typeof result === 'string') return result;
    if (Array.isArray(result?.text)) return result.text.join('\n');
    return String(result?.text || '');
  } catch {
    return '';
  }
}

export function extractPdfFallback(buffer) {
  const raw = buffer.toString('latin1');
  const parts = [];
  const re = /\((?:\\\)|\\.|[^)\\]){2,}\)/g;
  for (const match of raw.matchAll(re)) {
    let text = match[0].slice(1, -1);
    text = text
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\t/g, ' ');
    if (/[A-Za-z\u0900-\u097F]{3,}/.test(text)) parts.push(text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function composeUserContent(message, texts, images) {
  let text = String(message || '').trim();
  if (!text && texts.length) text = 'Please read the attached file and help me understand it.';
  if (!text && images.length) text = 'Please look at this image and help me.';
  if (texts.length) {
    text +=
      '\n\n' +
      texts
        .map((file) => `--- Attached file: ${file.name} ---\n${file.text}`)
        .join('\n\n');
  }
  return text;
}
