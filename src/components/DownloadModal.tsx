import React, { useState } from 'react';
import { X, Download, FileText, Archive, Globe, BookOpen } from 'lucide-react';
import { Book } from '../types';
import JSZip from 'jszip';
import { ModalPortal } from './MotionPrimitives';

interface DownloadModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  book,
  isOpen,
  onClose,
}) => {
  const [format, setFormat] = useState<'epub' | 'txt-single' | 'html-single' | 'zip-txt'>('epub');

  if (!isOpen || !book) return null;

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 150);
  };

  const buildEpubBlob = async (targetBook: Book): Promise<Blob> => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    zip.file(
      'OEBPS/style.css',
      `body { font-family: "Songti SC", "Noto Serif SC", serif; line-height: 1.9; padding: 4%; color: #1c1b18; }
h1, h2 { font-weight: bold; margin-bottom: 1.2em; line-height: 1.4; }
p { text-indent: 2em; margin: 0.65em 0; text-align: justify; }`
    );

    const chapters = targetBook.chapters || [];
    const manifestItems: string[] = [
      `<item id="css" href="style.css" media-type="text/css"/>`,
      `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    ];
    const spineItems: string[] = [];
    const navPoints: string[] = [];

    chapters.forEach((ch, idx) => {
      const id = `ch_${idx + 1}`;
      const href = `chapter_${idx + 1}.xhtml`;
      const safeTitle = escapeXml(ch.title || `第 ${ch.index} 章`);
      const paragraphs = (ch.text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<p>${escapeXml(line)}</p>`)
        .join('\n    ');

      const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
  <title>${safeTitle}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2>${safeTitle}</h2>
  ${paragraphs}
</body>
</html>`;

      zip.file(`OEBPS/${href}`, xhtml);
      manifestItems.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
      spineItems.push(`<itemref idref="${id}"/>`);
      navPoints.push(`
    <navPoint id="navPoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${safeTitle}</text></navLabel>
      <content src="${href}"/>
    </navPoint>`);
    });

    const bookUuid = `urn:uuid:${targetBook.id || Date.now()}`;
    const safeBookTitle = escapeXml(targetBook.title);

    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${safeBookTitle}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="BookId">${bookUuid}</dc:identifier>
    <dc:creator>个人创作室</dc:creator>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`
    );

    zip.file(
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookUuid}"/>
  </head>
  <docTitle><text>${safeBookTitle}</text></docTitle>
  <navMap>${navPoints.join('')}
  </navMap>
</ncx>`
    );

    return await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  };

  const handleDownload = async () => {
    const filename = book.title.replace(/[\\/:*?"<>|]/g, '_');

    if (format === 'epub') {
      const epubBlob = await buildEpubBlob(book);
      triggerDownload(epubBlob, `${filename}.epub`);
    } else if (format === 'txt-single') {
      const content = book.chapters
        .map((c) => `${c.title}\n\n${c.text}`)
        .join('\n\n====================\n\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      triggerDownload(blob, `${filename}.txt`);
    } else if (format === 'html-single') {
      const chapterHtml = book.chapters
        .map(
          (c) =>
            `<section style="margin-bottom:3rem;"><h2 style="font-size:1.35rem;border-bottom:1px solid #e5e2da;padding-bottom:0.6rem;">${escapeXml(c.title)}</h2><div style="white-space:pre-wrap;line-height:1.95;font-size:1.08rem;">${escapeXml(c.text)}</div></section>`
        )
        .join('\n');

      const content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(book.title)}</title>
  <style>
    body { line-height: 1.9; max-width: 760px; margin: 0 auto; padding: 32px 20px; font-family: "Songti SC", "Noto Serif SC", serif; color: #18181b; background-color: #f7f6f2; }
    h1 { text-align: center; margin-bottom: 48px; }
  </style>
</head>
<body>
  <h1>《${escapeXml(book.title)}》</h1>
  ${chapterHtml}
</body>
</html>`;
      const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
      triggerDownload(blob, `${filename}.html`);
    } else if (format === 'zip-txt') {
      const zip = new JSZip();
      book.chapters.forEach((c) => {
        const safeTitle = c.title.replace(/[\\/:*?"<>|]/g, '_');
        zip.file(`第${c.index}章_${safeTitle}.txt`, c.text);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(blob, `${filename}_分章.zip`);
    }

    onClose();
  };

  return (
    <ModalPortal onEscape={onClose}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-safe bg-black/55 backdrop-blur-xs"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="studio-card w-full sm:max-w-md max-h-[88dvh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-[var(--text-primary)] text-base truncate pr-3">
              导出作品《{book.title}》
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-2.5 overflow-y-auto flex-1">
          {[
            {
              id: 'epub',
              title: 'EPUB 电子书 (.epub) · 手机阅读推荐',
              desc: '可直接导入微信读书、Apple 图书、掌阅等阅读器离线精排阅读',
              icon: BookOpen,
            },
            {
              id: 'txt-single',
              title: '全本合并纯文本 (.txt)',
              desc: '兼容所有手机本地阅读器与网盘备份',
              icon: FileText,
            },
            {
              id: 'html-single',
              title: '单文件离线阅读网页 (.html)',
              desc: '纸张质感排版，手机/电脑浏览器双击直接免网阅读',
              icon: Globe,
            },
            {
              id: 'zip-txt',
              title: '按章节拆分压缩包 (.zip)',
              desc: '每章独立保存为一个 TXT 文件',
              icon: Archive,
            },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = format === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFormat(item.id as any)}
                className={`w-full p-3.5 rounded-xl border text-left transition-colors flex items-start gap-3 cursor-pointer ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-primary)]" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{item.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

          <div className="px-5 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="btn-primary min-h-[44px] px-5 py-2 text-xs flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>立即导出</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
