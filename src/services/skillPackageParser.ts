import JSZip from 'jszip';
import {
  NovelSkill,
  SkillCategory,
  SkillQualityTarget,
  SkillReferenceDoc,
  SkillRuleTier,
  SkillScope,
  SkillScriptMeta,
} from '../types';
import { generateUUID } from '../utils/uuid';

/**
 * Smart multi-encoding text decoder (UTF-8 strict -> UTF-16LE/BE BOM -> GB18030/GBK fallback).
 * Prevents Chinese mojibake (乱码) when importing SKILL.md, .txt, or files inside .zip archives
 * created on Windows/macOS/Linux tools.
 */
export function decodeBytesSmart(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return '';

  // 1. Check UTF-8 BOM (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  // 2. Check UTF-16LE BOM (FF FE)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }

  // 3. Check UTF-16BE BOM (FE FF)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  // 4. Strict UTF-8 validation first
  try {
    const utf8Strict = new TextDecoder('utf-8', { fatal: true });
    return utf8Strict.decode(bytes);
  } catch {
    // Not valid UTF-8: fallback to GB18030 / GBK (standard Chinese Windows encoding)
    try {
      const gbDecoder = new TextDecoder('gb18030', { fatal: false });
      return gbDecoder.decode(bytes);
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  }
}

/**
 * Custom filename decoder for JSZip.loadAsync({ decodeFileName })
 * Fixes non-UTF-8 flag (flag bit 11 = 0) Chinese filenames packed by Windows Explorer / WinRAR / 7-Zip.
 */
export function decodeZipFileNameSmart(rawBytes: Uint8Array | string | number[]): string {
  if (typeof rawBytes === 'string') return rawBytes;
  const u8 = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
  return decodeBytesSmart(u8);
}

/**
 * Reads a browser File object cleanly without encoding corruption.
 */
export async function readFileTextSmart(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeBytesSmart(new Uint8Array(buffer));
}

/**
 * Guard: Detects if user accidentally tried to read a binary .zip archive as plain text ("PK\x03\x04")
 */
export function isBinaryZipSignature(bytesOrStr: Uint8Array | string): boolean {
  if (typeof bytesOrStr === 'string') {
    return bytesOrStr.startsWith('PK\x03\x04') || bytesOrStr.startsWith('PK\x05\x06');
  }
  return (
    bytesOrStr.length >= 4 &&
    bytesOrStr[0] === 0x50 &&
    bytesOrStr[1] === 0x4b &&
    (bytesOrStr[2] === 0x03 || bytesOrStr[2] === 0x05)
  );
}

/**
 * Robust YAML frontmatter parser supporting:
 * - Standard single-line key: value
 * - Multi-line block scalars (`|` and `>`)
 * - Bracketed lists (`[a, b, c]`) and dashed multi-line lists (`- item`)
 * - Chinese/English extended fields: `display_name`, `description_zh`, `version`, `visibility`, `ruleTier`
 */
export function parseYamlFrontmatter(yamlRaw: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlRaw.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    let valPart = line.slice(colonIdx + 1).trim();

    // Case 1: Multi-line block scalar (`|` or `>`)
    if (valPart === '|' || valPart === '>' || valPart === '|-' || valPart === '>-') {
      const foldNewlines = valPart.startsWith('>');
      const blockLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.trim() === '') {
          blockLines.push('');
          i++;
          continue;
        }
        if (/^[ \t]+/.test(nextLine)) {
          blockLines.push(nextLine.replace(/^[ \t]{1,4}/, ''));
          i++;
        } else {
          break;
        }
      }
      result[key] = foldNewlines
        ? blockLines.join(' ').replace(/\s+/g, ' ').trim()
        : blockLines.join('\n').trim();
      continue;
    }

    // Case 2: Multi-line YAML array (`key:\n  - item1\n  - item2`)
    if (valPart === '') {
      const listItems: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed) {
          j++;
          continue;
        }
        if (nextTrimmed.startsWith('- ')) {
          listItems.push(unquoteYamlString(nextTrimmed.slice(2).trim()));
          j++;
        } else {
          break;
        }
      }
      if (listItems.length > 0) {
        result[key] = listItems;
        i = j;
        continue;
      }
    }

    // Case 3: Inline array `[a, b, c]`
    if (valPart.startsWith('[') && valPart.endsWith(']')) {
      const inner = valPart.slice(1, -1).trim();
      result[key] = inner
        ? inner
            .split(/[,，]/)
            .map((item) => unquoteYamlString(item.trim()))
            .filter(Boolean)
        : [];
      i++;
      continue;
    }

    // Case 4: Standard scalar value
    result[key] = unquoteYamlString(valPart);
    i++;
  }

  return result;
}

function unquoteYamlString(val: string): string {
  if (!val) return '';
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n');
  }
  return val;
}

/**
 * Extracts trigger keywords automatically from Chinese description text if `keywords:` is not explicitly set.
 * e.g. "触发词：写对白、角色对话、写正文、角色卡..."
 */
function extractTriggerKeywordsFromDescription(desc: string): string[] {
  if (!desc) return [];
  const match = desc.match(/触发词[：:]\s*([^。\n]+)/);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/[、,，/；;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 16);
}

/**
 * Infers applicable writing scopes when importing an industry SKILL package that doesn't declare `scopes` in frontmatter.
 */
function inferScopesFromSkillMetadata(name: string, desc: string, body: string): SkillScope[] {
  const combined = `${name}\n${desc}\n${body.slice(0, 1200)}`.toLowerCase();
  const scopes = new Set<SkillScope>();

  if (/大纲|章纲|选题|结构|卷纲|立项|节拍/.test(combined)) {
    scopes.add('outline');
  }
  if (/正文|写对白|角色对话|叙事|续写|章节|小说创作|场景/.test(combined)) {
    scopes.add('chapter');
  }
  if (/精修|润色|去ai|白描|对白|潜台词|修改|检查/.test(combined)) {
    scopes.add('polish');
  }
  if (/走向|重掷|分支|后续|悬念|钩子/.test(combined)) {
    scopes.add('reroll');
  }

  if (scopes.size === 0) {
    return ['chapter', 'polish'];
  }
  return Array.from(scopes);
}

/**
 * Extracts measurable quality targets table from SKILL.md (`## 质量目标` section)
 */
export function extractQualityTargetsFromBody(markdownBody: string): SkillQualityTarget[] {
  const targets: SkillQualityTarget[] = [];
  const sectionMatch = markdownBody.match(/##\s*质量目标[^\n]*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/);
  if (!sectionMatch) return targets;

  const lines = sectionMatch[1].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    const cols = trimmed
      .slice(1, -1)
      .split('|')
      .map((c) => c.replace(/\*\*/g, '').trim());
    if (cols.length < 2) continue;
    if (cols[0].includes('---') || cols[0] === '指标') continue;
    targets.push({
      metric: cols[0],
      medianTarget: cols[1],
      note: cols[2] || '',
    });
  }
  return targets.slice(0, 12);
}

/**
 * Extracts progressive reference routing table from SKILL.md (`## 参考文档路由` section)
 * Maps reference file paths -> task descriptions & trigger keywords
 */
export function extractReferenceRoutingMap(
  markdownBody: string
): Map<string, { task: string; keywords: string[] }> {
  const map = new Map<string, { task: string; keywords: string[] }>();
  const sectionMatch = markdownBody.match(/##\s*参考文档路由[^\n]*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/);
  if (!sectionMatch) return map;

  const lines = sectionMatch[1].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    const cols = trimmed
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cols.length < 2) continue;
    if (cols[0].includes('---') || cols[0] === '任务') continue;

    const cleanTask = cols[0].replace(/\*\*/g, '').trim();
    const pathMatches = cols[1].match(/`([^`]+)`/g) || [];
    const derivedKeywords = cleanTask
      .split(/[（()）/、,，+\s]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);

    for (const rawCode of pathMatches) {
      const refPath = rawCode.replace(/`/g, '').trim();
      if (refPath) {
        map.set(refPath, { task: cleanTask, keywords: derivedKeywords });
      }
    }
  }
  return map;
}

/**
 * Extracts scripts purpose table from SKILL.md (`## 脚本速查` section)
 */
export function extractScriptsPurposeMap(markdownBody: string): Map<string, string> {
  const map = new Map<string, string>();
  const sectionMatch = markdownBody.match(/##\s*脚本速查[^\n]*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/);
  if (!sectionMatch) return map;

  const lines = sectionMatch[1].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    const cols = trimmed
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cols.length < 2 || cols[0].includes('---') || cols[0] === '脚本') continue;
    const scriptName = cols[0].replace(/`/g, '').trim();
    const purpose = cols[1].replace(/\*\*/g, '').trim();
    if (scriptName) map.set(scriptName, purpose);
  }
  return map;
}

/**
 * Strips CLI-only bash blocks, script tables, and long version changelogs from a large SKILL.md
 * so that the System Prompt receives clean, high-signal literary engineering rules rather than CLI noise.
 */
export function distillExecutablePromptFromSkillBody(markdownBody: string): string {
  if (!markdownBody) return '';
  let cleaned = markdownBody
    // Remove "## 版本记录" / "## Changelog" to end or next H2
    .replace(/##\s*(?:版本记录|更新日志|Changelog)[\s\S]*$/i, '')
    // Remove "## 脚本速查" section
    .replace(/##\s*脚本速查[^\n]*\n[\s\S]*?(?=\n##\s+|$)/g, '')
    // Remove "## 最小工作流" bash CLI blocks if purely python CLI commands
    .replace(/```bash[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length > 3600) {
    cleaned = cleaned.slice(0, 3600) + '\n…（更多细分规范通过 references 参考库按需动态挂载）';
  }
  return cleaned;
}

/**
 * Parses a single SKILL.md content into a NovelSkill object (losslessly preserving metadata).
 */
export function parseSingleSkillMarkdown(
  rawText: string,
  fallbackFileName: string = '导入的写作技能'
): NovelSkill {
  const normalized = rawText.replace(/^\uFEFF/, '').trim();

  if (isBinaryZipSignature(normalized)) {
    throw new Error('检测到 ZIP 二进制压缩头，请使用压缩包解压导入流程处理 .zip 文件');
  }

  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = normalized.match(fmRegex);

  const cleanFileStem = fallbackFileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.(?:skill\.)?(?:md|txt)$/i, '')
    .trim();

  if (!match) {
    return {
      id: `skill-md-${generateUUID()}`,
      name: cleanFileStem || '导入的写作技能',
      description: '从 Markdown 文档导入的写作技能规范',
      promptInstruction: distillExecutablePromptFromSkillBody(normalized),
      ruleTier: 'contract',
      category: 'custom',
      scopes: inferScopesFromSkillMetadata(cleanFileStem, '', normalized),
      triggerMode: 'always',
      priority: 'normal',
      enabled: true,
      isPreset: false,
      packageType: 'single-md',
      rawSkillMd: normalized,
    };
  }

  const meta = parseYamlFrontmatter(match[1]);
  const bodyPart = (match[2] || '').trim();

  const slug = typeof meta.name === 'string' ? meta.name.trim() : undefined;
  const displayName =
    (typeof meta.display_name === 'string' && meta.display_name.trim()) ||
    slug ||
    cleanFileStem ||
    '未命名技能';

  const version = meta.version !== undefined ? String(meta.version).trim() : undefined;

  const fullDesc =
    (typeof meta.description_zh === 'string' && meta.description_zh.trim()) ||
    (typeof meta.description === 'string' && meta.description.trim()) ||
    displayName;

  const validScopes: SkillScope[] = ['outline', 'chapter', 'reroll', 'polish'];
  const rawScopes = Array.isArray(meta.scopes)
    ? meta.scopes
    : typeof meta.scopes === 'string'
    ? meta.scopes.split(/[,，]/).map((s: string) => s.trim())
    : [];
  const parsedScopes = rawScopes.filter((s: string): s is SkillScope =>
    validScopes.includes(s as SkillScope)
  );
  const finalScopes =
    parsedScopes.length > 0
      ? parsedScopes
      : inferScopesFromSkillMetadata(
          displayName,
          `${meta.description || ''} ${meta.description_zh || ''}`,
          bodyPart
        );

  const validCategories: SkillCategory[] = ['style', 'rule', 'preference', 'structure', 'custom'];
  const cat: SkillCategory = validCategories.includes(meta.category as SkillCategory)
    ? (meta.category as SkillCategory)
    : /对白|对话|文风|白描|语言/.test(displayName + fullDesc)
    ? 'style'
    : /结构|叙事|大纲/.test(displayName + fullDesc)
    ? 'structure'
    : 'custom';

  const explicitKeywords: string[] = Array.isArray(meta.keywords)
    ? meta.keywords.map(String)
    : extractTriggerKeywordsFromDescription(String(meta.description || ''));

  const triggerMode: 'always' | 'keyword' =
    meta.triggerMode === 'keyword' ? 'keyword' : 'always';

  const ruleTier: SkillRuleTier =
    meta.ruleTier === 'advisory' ? 'advisory' : 'contract';

  const qualityTargets = extractQualityTargetsFromBody(bodyPart);
  const executableBody = distillExecutablePromptFromSkillBody(bodyPart || normalized);

  return {
    id: slug ? `skill-pkg-${slug}` : `skill-md-${generateUUID()}`,
    slug,
    name: displayName,
    version,
    description: fullDesc,
    promptInstruction: executableBody,
    ruleTier,
    category: cat,
    scopes: finalScopes,
    triggerMode,
    keywords: explicitKeywords,
    priority: meta.priority === 'high' ? 'high' : 'normal',
    enabled: meta.enabled !== 'false' && meta.enabled !== false,
    isPreset: false,
    packageType: 'single-md',
    qualityTargets: qualityTargets.length > 0 ? qualityTargets : undefined,
    rawSkillMd: normalized,
  };
}

/**
 * Parses a `.zip` archive into one or more `NovelSkill` objects:
 * Case A: Standard Engineering SKILL Package (contains `<root>/SKILL.md` + `references/*` + `scripts/*`)
 *   -> Unpacks entry `SKILL.md`, binds `references/*.md|.json` with routing metadata for progressive disclosure,
 *      and catalogs `scripts/*` without mojibake!
 * Case B: Bundle of multiple `.SKILL.md` / `.md` files (exported from studio)
 *   -> Unpacks each `.md` file as an individual skill.
 */
export async function parseSkillZipArchive(file: File | ArrayBuffer): Promise<{
  skills: NovelSkill[];
  summary: string;
}> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(buffer, {
    decodeFileName: decodeZipFileNameSmart as any,
  });

  const allEntries: Array<{ path: string; zipObj: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && !relativePath.includes('__MACOSX') && !relativePath.endsWith('.DS_Store')) {
      allEntries.push({ path: relativePath.replace(/\\/g, '/'), zipObj: zipEntry });
    }
  });

  // Detect if there are one or more `SKILL.md` package roots (e.g. `novel-character-dialogue/SKILL.md` or `SKILL.md`)
  const mainSkillEntries = allEntries.filter((e) => /(?:^|\/)SKILL\.md$/i.test(e.path));

  if (mainSkillEntries.length > 0) {
    const parsedPackages: NovelSkill[] = [];

    for (const mainEntry of mainSkillEntries) {
      const rootPrefix = mainEntry.path.replace(/SKILL\.md$/i, ''); // e.g. "novel-character-dialogue/" or ""
      const mainBytes = await mainEntry.zipObj.async('uint8array');
      const mainMdText = decodeBytesSmart(mainBytes);

      const baseSkill = parseSingleSkillMarkdown(
        mainMdText,
        rootPrefix.replace(/\/$/, '') || 'SKILL'
      );

      // Parse routing map & script purpose map from SKILL.md
      const routingMap = extractReferenceRoutingMap(mainMdText);
      const scriptPurposeMap = extractScriptsPurposeMap(mainMdText);

      const references: SkillReferenceDoc[] = [];
      const scriptsMeta: SkillScriptMeta[] = [];

      const siblingEntries = allEntries.filter(
        (e) => e.path !== mainEntry.path && (rootPrefix === '' || e.path.startsWith(rootPrefix))
      );

      for (const sub of siblingEntries) {
        const relSubPath = rootPrefix ? sub.path.slice(rootPrefix.length) : sub.path;

        if (
          relSubPath.startsWith('references/') &&
          /\.(md|txt|json)$/i.test(relSubPath)
        ) {
          const rawBytes = await sub.zipObj.async('uint8array');
          const content = decodeBytesSmart(rawBytes);
          const fileTitle = relSubPath
            .replace(/^references\//, '')
            .replace(/\.(md|txt|json)$/i, '');

          // Match routing rule from SKILL.md table (exact or prefix match)
          let matchedTask: string | undefined;
          let matchedKeywords: string[] = [];
          routingMap.forEach((val, keyPath) => {
            const cleanKey = keyPath.replace(/\/$/, '');
            if (relSubPath === keyPath || relSubPath.startsWith(cleanKey)) {
              matchedTask = val.task;
              matchedKeywords = val.keywords;
            }
          });

          // Derive additional keywords from filename (e.g. "01-玄幻仙侠", "内心活动层", "叙事层生成契约")
          const fileKeywords = fileTitle
            .split(/[-_/—\d\s]+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 2 && !['方法卡', '示例库', '工作流', '通用'].includes(w));

          const combinedKeywords = Array.from(new Set([...matchedKeywords, ...fileKeywords]));

          // Core structural contracts default to light summary or on-demand
          const isCoreContract = /叙事层生成契约|内心活动层|对话成文承接/.test(fileTitle);

          references.push({
            id: `ref-${generateUUID()}`,
            path: relSubPath,
            title: fileTitle,
            content,
            sizeBytes: rawBytes.byteLength,
            routingTask: matchedTask,
            keywords: combinedKeywords,
            alwaysLoad: isCoreContract,
          });
        } else if (relSubPath.startsWith('scripts/')) {
          const rawBytes = await sub.zipObj.async('uint8array');
          const scriptFileName = relSubPath.replace(/^scripts\//, '');
          scriptsMeta.push({
            path: relSubPath,
            name: scriptFileName,
            purpose: scriptPurposeMap.get(scriptFileName) || '工程化辅助校验/蒸馏脚本',
            sizeBytes: rawBytes.byteLength,
          });
        }
      }

      // Sort references: core contracts first, then alphabetical
      references.sort((a, b) => {
        if (a.alwaysLoad && !b.alwaysLoad) return -1;
        if (!a.alwaysLoad && b.alwaysLoad) return 1;
        return a.path.localeCompare(b.path, 'zh-CN');
      });

      parsedPackages.push({
        ...baseSkill,
        packageType: 'zip-package',
        references,
        scriptsMeta,
      });
    }

    const firstPkg = parsedPackages[0];
    const refCount = parsedPackages.reduce((acc, s) => acc + (s.references?.length || 0), 0);
    const scriptCount = parsedPackages.reduce((acc, s) => acc + (s.scriptsMeta?.length || 0), 0);

    return {
      skills: parsedPackages,
      summary: `已无损解析完整 SKILL 工程包「${firstPkg.name}${firstPkg.version ? ` v${firstPkg.version}` : ''}」（含主入口 SKILL.md、${refCount} 份参考子文档与 ${scriptCount} 个脚本索引）`,
    };
  }

  // Fallback Case B: Multi-skill flat `.SKILL.md` / `.md` bundle zip
  const mdEntries = allEntries.filter((e) => /\.(md|txt)$/i.test(e.path));
  const flatSkills: NovelSkill[] = [];
  for (const entry of mdEntries) {
    const rawBytes = await entry.zipObj.async('uint8array');
    const text = decodeBytesSmart(rawBytes);
    flatSkills.push(parseSingleSkillMarkdown(text, entry.path));
  }

  return {
    skills: flatSkills,
    summary: `已从压缩包批量导入 ${flatSkills.length} 项 SKILL.md 技能规范`,
  };
}

/**
 * Unified entry point for importing any `.zip`, `.md`, or `.txt` file list from `<input type="file">`.
 */
export async function importSkillFilesUniversal(files: FileList | File[]): Promise<{
  skills: NovelSkill[];
  summary: string;
}> {
  const arr = Array.from(files);
  const allImported: NovelSkill[] = [];
  const messages: string[] = [];

  for (const file of arr) {
    const buffer = await file.arrayBuffer();
    const u8 = new Uint8Array(buffer);

    if (file.name.toLowerCase().endsWith('.zip') || isBinaryZipSignature(u8)) {
      const { skills, summary } = await parseSkillZipArchive(buffer);
      allImported.push(...skills);
      messages.push(summary);
    } else {
      const decodedText = decodeBytesSmart(u8);
      const parsed = parseSingleSkillMarkdown(decodedText, file.name);
      allImported.push(parsed);
      messages.push(`已导入技能「${parsed.name}」`);
    }
  }

  return {
    skills: allImported,
    summary: messages.length === 1 ? messages[0] : `共成功解析导入 ${allImported.length} 项 SKILL 技能规范`,
  };
}

/**
 * Exports a single NovelSkill as either a clean `SKILL.md` (if single-md)
 * or a complete `<slug>/SKILL.md + references/*` `.zip` package (if zip-package with references).
 */
export async function exportSingleSkillPackage(
  skill: NovelSkill,
  serializeMdFn: (sk: NovelSkill) => string
): Promise<{ blob: Blob; filename: string }> {
  const safeName = (skill.slug || skill.name).replace(/[\\/:*?"<>|]/g, '_');

  if (skill.packageType === 'zip-package' || (skill.references && skill.references.length > 0)) {
    const zip = new JSZip();
    const folder = zip.folder(safeName)!;
    const entryMd = skill.rawSkillMd || serializeMdFn(skill);
    folder.file('SKILL.md', entryMd);

    (skill.references || []).forEach((ref) => {
      const cleanPath = ref.path.startsWith('references/') ? ref.path : `references/${ref.path}`;
      folder.file(cleanPath, ref.content);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const verSuffix = skill.version ? `-v${skill.version}` : '';
    return {
      blob,
      filename: `${safeName}${verSuffix}.skill.zip`,
    };
  }

  const mdContent = serializeMdFn(skill);
  const blob = new Blob(['\uFEFF' + mdContent], { type: 'text/markdown;charset=utf-8' });
  return {
    blob,
    filename: `${safeName}.SKILL.md`,
  };
}
