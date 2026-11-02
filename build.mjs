// 마크다운 글(글\*.md)을 블로그 HTML(사이트\)로 바꾸는 프로그램
// 실행: node build.mjs  (또는 빌드.bat 더블클릭)
// Node.js 기본 기능만 사용 (npm 설치 필요 없음)
// 옵시디언 문법도 읽음: [[글 링크]], ![[그림]], > [!note] 콜아웃, ==형광펜==, %%숨김 메모%%, 여러 줄 태그 목록
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(ROOT, '글');
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, '사이트');
const CONFIG_FILE = path.join(ROOT, '블로그설정.json');

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

const warnings = [];
function warn(message) {
  if (!warnings.includes(message)) warnings.push(message);
}

let config = {};
// 지금 변환 중인 글의 정보 (글 링크·그림 위치를 찾을 때 사용). 없으면 링크를 글자로만 표시
let ctx = null;

// ───────────── 공통 도우미 ─────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 이미 escapeHtml을 거친 주소를 받아, 스크립트 실행 주소(javascript: 등)만 막는다
function safeUrl(url) {
  const plain = url.replace(/&amp;/g, '&').trim();
  if (/^(javascript|vbscript):/i.test(plain)) return '#';
  if (/^data:/i.test(plain) && !/^data:image\//i.test(plain)) return '#';
  return url;
}

function stripTags(html) {
  return html.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function indentOf(line) {
  return line.match(/^ */)[0].length;
}

function slugifyHeading(text) {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'section';
}

// 사이트 안의 파일 주소 (폴더/파일 이름의 공백·한글을 주소용 글자로)
function fileUrl(rel) {
  return rel.split('/').map(encodeURIComponent).join('/');
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// [[대상|별칭]]을 대상과 별칭으로 나눈다 (표 안에서는 \| 로 씀)
function splitPipe(inner) {
  const m = inner.match(/^(.*?)\\?\|(.*)$/);
  return m ? [m[1].trim(), m[2].trim()] : [inner.trim(), ''];
}

// ───────────── 옵시디언 링크·그림 ─────────────

function renderWikiLink(inner) {
  const [target, alias] = splitPipe(inner);
  const hashAt = target.indexOf('#');
  const name = hashAt >= 0 ? target.slice(0, hashAt).trim() : target;
  let heading = hashAt >= 0 ? target.slice(hashAt + 1).trim() : '';
  if (heading.startsWith('^')) heading = ''; // 문단 참조(^abc)는 글 링크로만
  const label = alias || (name && heading ? `${name} > ${heading}` : name || heading);

  if (!name) return `<a href="#${encodeURIComponent(slugifyHeading(heading))}">${escapeHtml(label)}</a>`;
  if (!ctx) return escapeHtml(label);

  const post = ctx.resolveNote(name);
  if (post) {
    const anchor = heading ? '#' + encodeURIComponent(slugifyHeading(heading)) : '';
    return `<a href="${postHref(post)}${anchor}">${escapeHtml(label)}</a>`;
  }
  const file = ctx.resolveFile(name);
  if (file) return `<a href="${fileUrl(file)}">${escapeHtml(label)}</a>`;

  warn(`${ctx.post.file}: [[${name}]] 글을 찾지 못했습니다. 글자로만 표시합니다. (아직 안 쓴 글이거나 draft 글)`);
  return `<span class="broken-link" title="아직 없는 글">${escapeHtml(label)}</span>`;
}

function renderEmbed(inner) {
  const [target, option] = splitPipe(inner);
  const name = target.split('#')[0].trim();
  if (!ctx) return escapeHtml(name);

  if (IMAGE_EXT.test(name)) {
    const file = ctx.resolveFile(name);
    if (!file) {
      warn(`${ctx.post.file}: 그림 "${name}"을(를) 글 폴더에서 찾지 못했습니다.`);
      return `<span class="broken-link">[그림 없음: ${escapeHtml(name)}]</span>`;
    }
    // ![[그림.png|300]] 또는 |300x200 은 크기, 그 밖의 글자는 그림 설명
    const size = option.match(/^(\d+)(?:x(\d+))?$/);
    const alt = size ? '' : option;
    const sizeAttr = size ? ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ''}` : '';
    return `<img src="${fileUrl(file)}" alt="${escapeHtml(alt)}"${sizeAttr} loading="lazy">`;
  }

  // 다른 글을 끼워 넣는 ![[글]] 은 그 글로 가는 링크 카드로 표시
  const post = ctx.resolveNote(name);
  if (post) return `<a class="note-embed" href="${postHref(post)}"><span class="note-embed-label">연결된 글</span>${escapeHtml(post.title)}</a>`;
  const file = ctx.resolveFile(name);
  if (file) return `<a href="${fileUrl(file)}">${escapeHtml(option || name)}</a>`;

  warn(`${ctx.post.file}: ![[${name}]] 대상을 찾지 못했습니다.`);
  return `<span class="broken-link">${escapeHtml(name)}</span>`;
}

// 일반 마크다운 링크·그림의 상대 주소를 사이트 기준 주소로 바꾼다
// (옵시디언은 그림 파일 이름만 적는 경우가 많아서, 못 찾으면 이름으로 다시 찾음)
function resolveHref(href, isImage) {
  if (!ctx || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return href;
  const raw = safeDecode(href.replace(/&amp;/g, '&'));
  const [filePart, anchor] = raw.split('#');
  if (/\.md$/i.test(filePart) || (!isImage && !path.extname(filePart))) {
    const post = ctx.resolveNote(filePart);
    if (post) return postHref(post) + (anchor ? '#' + encodeURIComponent(slugifyHeading(anchor)) : '');
  }
  const file = ctx.resolveFile(filePart);
  if (file) return escapeHtml(fileUrl(file)) + (anchor ? '#' + encodeURIComponent(anchor) : '');
  if (isImage) warn(`${ctx.post.file}: 그림 "${filePart}"을(를) 글 폴더에서 찾지 못했습니다.`);
  return href;
}

// ───────────── 마크다운 → HTML (글자 꾸밈) ─────────────

function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/==(?=[^\s=])([\s\S]*?[^\s=])==/g, '<mark>$1</mark>')
    .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>')
    .replace(/\*([^\s*])\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');
}

function renderInline(text) {
  // 바뀐 부분은 자리표시(\u0000번호\u0000)로 빼 두었다가 마지막에 되돌린다 (다른 규칙에 다시 걸리지 않게)
  const saved = [];
  const keep = (html) => { saved.push(html); return `\u0000${saved.length - 1}\u0000`; };

  // 인라인 코드 `...`
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, t, code) => keep(`<code>${escapeHtml(code.trim())}</code>`));
  // 줄바꿈: 줄 끝 공백 2개 또는 역슬래시
  text = text.replace(/( {2,}|\\)\n/g, () => keep('<br>'));
  // 옵시디언 그림·글 끼워 넣기 ![[...]], 글 링크 [[...]]
  text = text.replace(/!\[\[([^\]\n]+?)\]\]/g, (m, inner) => keep(renderEmbed(inner)));
  text = text.replace(/\[\[([^\]\n]+?)\]\]/g, (m, inner) => keep(renderWikiLink(inner)));
  // 역슬래시로 막은 기호 (\* → *)
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!|~>=])/g, (m, c) => keep(escapeHtml(c)));

  text = escapeHtml(text);

  // 그림 ![설명](주소 "제목")  — 옵시디언처럼 <주소>로 감싼 경우(공백 포함 파일 이름)도 읽음
  const target = '(?:&lt;(.+?)&gt;|([^\\s)]+))';
  text = text.replace(new RegExp(`!\\[([^\\]]*)\\]\\(\\s*${target}(?:\\s+&quot;(.*?)&quot;)?\\s*\\)`, 'g'), (m, alt, wrapped, src, title) => {
    const url = safeUrl(resolveHref(wrapped || src, true));
    return keep(`<img src="${url}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`);
  });
  // 링크 [글자](주소 "제목")
  text = text.replace(new RegExp(`\\[([^\\]]+)\\]\\(\\s*${target}(?:\\s+&quot;(.*?)&quot;)?\\s*\\)`, 'g'), (m, label, wrapped, href, title) => {
    const raw = wrapped || href;
    const external = /^https?:\/\//i.test(raw);
    return keep(`<a href="${safeUrl(resolveHref(raw, false))}"${title ? ` title="${title}"` : ''}${external ? ' target="_blank" rel="noopener"' : ''}>${emphasis(label)}</a>`);
  });
  // 주소만 적은 경우 자동 링크
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)'])/g, (m, pre, url) =>
    pre + keep(`<a href="${url}" target="_blank" rel="noopener">${url}</a>`));

  text = emphasis(text);

  while (/\u0000\d+\u0000/.test(text)) {
    text = text.replace(/\u0000(\d+)\u0000/g, (m, n) => saved[n]);
  }
  // 옵시디언처럼 엔터 한 번이 줄바꿈 (블로그설정.json의 lineBreaks: false 이면 이어 붙임)
  return text.replace(/\n/g, config.lineBreaks === false ? ' ' : '<br>');
}

// ───────────── 마크다운 → HTML (문단·목록·표 등 덩어리) ─────────────

const LIST_RE = /^( *)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE_RE = /^ *(```+|~~~+)\s*([\w+#.-]*)/;
const HR_RE = /^ *([-*_])( *\1){2,} *$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const TABLE_SEP_RE = /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;

// 옵시디언 콜아웃 종류 → 색 묶음, 기본 제목
const CALLOUTS = {
  note: ['note', '메모'], info: ['note', '정보'], todo: ['note', '할 일'],
  abstract: ['note', '요약'], summary: ['note', '요약'], tldr: ['note', '요약'],
  tip: ['tip', '팁'], hint: ['tip', '팁'], important: ['tip', '중요'],
  success: ['tip', '완료'], check: ['tip', '완료'], done: ['tip', '완료'],
  question: ['warning', '질문'], help: ['warning', '질문'], faq: ['warning', '질문'],
  warning: ['warning', '주의'], caution: ['warning', '주의'], attention: ['warning', '주의'],
  failure: ['danger', '실패'], fail: ['danger', '실패'], missing: ['danger', '없음'],
  danger: ['danger', '위험'], error: ['danger', '오류'], bug: ['danger', '버그'],
  example: ['example', '예시'], quote: ['quote', '인용'], cite: ['quote', '인용'],
};

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) && lines[i + 1].includes('-');
}

function startsBlock(lines, i) {
  const line = lines[i];
  return HEADING_RE.test(line) || FENCE_RE.test(line) || /^ *>/.test(line) || HR_RE.test(line)
    || LIST_RE.test(line) || isTableStart(lines, i);
}

function splitRow(row) {
  row = row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  // [[글|별칭]] 안의 \| 는 칸 나누기로 보지 않는다
  return row.split(/(?<!\\)\|/).map((c) => c.trim());
}

function parseTable(lines, i, doc) {
  const head = splitRow(lines[i]);
  const aligns = splitRow(lines[i + 1]).map((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '');
  const cell = (tag, text, n) => {
    // 링크 밖의 \| 는 글자 | 로
    const content = (text || '').replace(/\\\|(?![^\[]*\]\])/g, '|');
    return `<${tag}${aligns[n] ? ` style="text-align:${aligns[n]}"` : ''}>${renderInline(content)}</${tag}>`;
  };
  let html = '<div class="table-wrap"><table><thead><tr>' + head.map((c, n) => cell('th', c, n)).join('') + '</tr></thead><tbody>';
  i += 2;
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    const cells = splitRow(lines[i]);
    html += '<tr>' + head.map((_, n) => cell('td', cells[n], n)).join('') + '</tr>';
    i++;
  }
  return { html: html + '</tbody></table></div>', i };
}

function parseList(lines, i, doc) {
  const first = lines[i].match(LIST_RE);
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  let cur = null;
  // 같은 들여쓰기 + 같은 종류(번호/기호)일 때만 같은 목록의 항목
  const sameList = (m) => m && m[1].length === base && /\d/.test(m[2]) === ordered;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // 빈 줄 다음에 같은 목록이 이어지면 계속, 아니면 목록 끝
      const next = lines[i + 1];
      if (next !== undefined && next.trim() && (indentOf(next) > base || sameList(next.match(LIST_RE)))) {
        cur.body.push('');
        i++;
        continue;
      }
      break;
    }
    const m = line.match(LIST_RE);
    if (sameList(m)) {
      cur = { text: m[3], body: [] };
      items.push(cur);
      i++;
      continue;
    }
    if (indentOf(line) > base) {
      cur.body.push(line);
      i++;
      continue;
    }
    if (m || startsBlock(lines, i)) break;
    // 들여쓰지 않고 이어 쓴 줄은 앞 항목 글에 붙인다
    if (!cur.body.length) {
      cur.text += '\n' + line.trim();
      i++;
      continue;
    }
    break;
  }

  const isTask = items.some((it) => /^\[[ xX]\]\s+/.test(it.text));
  const lis = items.map((it) => {
    let text = it.text;
    let check = '';
    const task = text.match(/^\[([ xX])\]\s+(.*)$/s);
    if (task) {
      check = `<input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> `;
      text = task[2];
    }
    let inner = check + renderInline(text);
    const body = it.body;
    while (body.length && !body[body.length - 1].trim()) body.pop();
    if (body.length) {
      const cut = Math.min(...body.filter((l) => l.trim()).map(indentOf));
      inner += parseBlocks(body.map((l) => l.slice(cut)), doc);
    }
    return `<li${task ? ' class="task"' : ''}>${inner}</li>`;
  }).join('');

  const tag = ordered ? 'ol' : 'ul';
  const attrs = (ordered && start !== 1 ? ` start="${start}"` : '') + (isTask ? ' class="task-list"' : '');
  return { html: `<${tag}${attrs}>${lis}</${tag}>`, i };
}

// > [!종류]± 제목  → 콜아웃 상자 (+ 는 펼친 채 접기 가능, - 는 접힌 채)
function renderCallout(match, rest, doc) {
  const type = match[1].toLowerCase();
  const [kind, defaultLabel] = CALLOUTS[type] || ['note', match[1]];
  const fold = match[2];
  const title = match[3] ? renderInline(match[3]) : escapeHtml(defaultLabel);
  const body = parseBlocks(rest, doc);
  if (fold) {
    return `<details class="callout callout-${kind}"${fold === '+' ? ' open' : ''}><summary class="callout-title">${title}</summary>${body ? `<div class="callout-body">${body}</div>` : ''}</details>`;
  }
  return `<div class="callout callout-${kind}"><div class="callout-title">${title}</div>${body ? `<div class="callout-body">${body}</div>` : ''}</div>`;
}

function parseBlocks(lines, doc) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // 코드 블록 ```언어
    let m = line.match(FENCE_RE);
    if (m) {
      const fence = m[1];
      const lang = m[2];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 제목 # ~ ######
    m = line.match(HEADING_RE);
    if (m) {
      const level = m[1].length;
      const html = renderInline(m[2]);
      const id = doc.headingId(stripTags(html));
      doc.headings.push({ level, id, text: stripTags(html) });
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++;
      continue;
    }

    // 가로줄 ---
    if (HR_RE.test(line)) { out.push('<hr>'); i++; continue; }

    // 인용 > (옵시디언 콜아웃 > [!note] 포함)
    if (/^ *>/.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() && (/^ *>/.test(lines[i]) || !startsBlock(lines, i))) {
        buf.push(lines[i].replace(/^ *> ?/, ''));
        i++;
      }
      const callout = buf[0].match(/^\[!([\w-]+)\]([+-]?)\s*(.*)$/);
      if (callout) out.push(renderCallout(callout, buf.slice(1), doc));
      else out.push(`<blockquote>${parseBlocks(buf, doc)}</blockquote>`);
      continue;
    }

    // 표
    if (isTableStart(lines, i)) {
      const t = parseTable(lines, i, doc);
      out.push(t.html);
      i = t.i;
      continue;
    }

    // 목록
    if (LIST_RE.test(line)) {
      const l = parseList(lines, i, doc);
      out.push(l.html);
      i = l.i;
      continue;
    }

    // 문단: 빈 줄이나 다른 덩어리가 나올 때까지
    const buf = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      buf.push(lines[i].replace(/^ +/, ''));
      i++;
    }
    out.push(`<p>${renderInline(buf.join('\n'))}</p>`);
  }
  return out.join('\n');
}

// %%숨김 메모%% 를 지운다 (코드 블록 안은 그대로)
function stripComments(md) {
  const out = [];
  let seg = [];
  let fence = null;
  const flush = () => {
    // `코드` 안의 %% 는 남긴다
    if (seg.length) out.push(seg.join('\n').replace(/(`+)[\s\S]*?\1|%%[\s\S]*?%%/g, (m, tick) => (tick ? m : '')));
    seg = [];
  };
  for (const line of md.split('\n')) {
    if (fence) {
      out.push(line);
      if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    const m = line.match(FENCE_RE);
    if (m) {
      flush();
      fence = m[1];
      out.push(line);
      continue;
    }
    seg.push(line);
  }
  flush();
  return out.join('\n');
}

function markdownToHtml(md) {
  const used = new Map();
  const doc = {
    headings: [],
    // 제목 글자로 목차용 주소(#아이디)를 만든다. 같은 제목은 -2, -3을 붙임
    headingId(text) {
      const id = slugifyHeading(text);
      const n = used.get(id) || 0;
      used.set(id, n + 1);
      return n ? `${id}-${n + 1}` : id;
    },
  };
  const lines = stripComments(md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')).split('\n');
  const html = parseBlocks(lines, doc);
  return { html, headings: doc.headings };
}

// ───────────── 글 파일 읽기 ─────────────

function unquote(s) {
  return s.replace(/^(['"])(.*)\1$/, '$2');
}

function parseFrontMatter(src) {
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    // 옵시디언 속성의 여러 줄 목록
    //   tags:
    //     - 가
    //     - 나
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      if (!Array.isArray(meta[listKey])) meta[listKey] = [];
      meta[listKey].push(unquote(item[1].trim()));
      continue;
    }
    const kv = line.match(/^\s*([\w가-힣-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    let v = kv[2].trim();
    listKey = v === '' ? key : null;
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    else v = unquote(v);
    meta[key] = v;
  }
  return { meta, body: src.slice(m[0].length) };
}

function toList(v) {
  if (!v) return [];
  if (typeof v === 'string') return v.split(',').map((t) => t.trim()).filter(Boolean);
  return v;
}

function toSlug(rel) {
  let slug = path.basename(rel, path.extname(rel)).trim()
    .replace(/\s+/g, '-').replace(/[?#%&<>"'\\/:*|]/g, '');
  if (slug.toLowerCase() === 'index') slug = 'index-post';
  return slug || 'post';
}

function pad(n) { return String(n).padStart(2, '0'); }

// 글 폴더 안의 모든 파일 목록 (하위 폴더 포함, 옵시디언 설정 폴더·제외 폴더는 건너뜀)
function walk(dir, rel = '') {
  const exclude = new Set(toList(config.exclude).map((s) => s.toLowerCase()));
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!exclude.has(entry.name.toLowerCase())) result.push(...walk(path.join(dir, entry.name), childRel));
    } else {
      result.push(childRel);
    }
  }
  return result.sort();
}

// 1단계: 글 정보(제목·날짜·태그)만 읽는다. 본문 변환은 모든 글을 안 뒤에 (글 사이 링크를 찾기 위해)
function loadPost(rel) {
  const full = path.join(POSTS_DIR, ...rel.split('/'));
  const name = path.basename(rel, path.extname(rel));
  const src = fs.readFileSync(full, 'utf8').replace(/^﻿/, '');
  const { meta, body } = parseFrontMatter(src);
  if (/^(true|yes|예)$/i.test(meta.draft || '')) return null;
  if (/^(false|no|아니요)$/i.test(meta.publish || '')) return null;

  // 본문 첫 줄이 # 제목이면 글 제목으로 쓰고 본문에서는 뺀다 (제목이 두 번 보이지 않게)
  let text = body.replace(/^\s*\n/, '');
  let title = meta.title;
  const h1 = text.match(/^# +(.+?)\s*#*\s*(\n|$)/);
  if (h1 && (!title || stripTags(renderInline(h1[1])) === title)) {
    title = title || stripTags(renderInline(h1[1]));
    text = text.slice(h1[0].length);
  }
  if (!title) title = name; // 옵시디언처럼 파일 이름이 곧 제목

  let date = String(meta.date || meta.created || '').trim();
  const dateMatch = date.match(/^(\d{4}-\d{2}-\d{2})/);
  if (date && !dateMatch) {
    warn(`${rel}: 날짜 "${date}" 형식이 맞지 않습니다 (예: 2026-11-02). 파일 이름이나 수정일로 대신합니다.`);
  }
  date = dateMatch ? dateMatch[1] : '';
  const stat = fs.statSync(full);
  if (!date) {
    const fromName = name.match(/^(\d{4}-\d{2}-\d{2})/);
    if (fromName) date = fromName[1];
    else {
      const d = stat.mtime;
      date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }

  const tags = [...new Set(toList(meta.tags).map((t) => String(t).replace(/^#/, '').replace(/\|/g, '').trim()).filter(Boolean))];

  return {
    file: rel,
    dir: path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel),
    name,
    slug: toSlug(rel),
    title,
    aliases: toList(meta.aliases || meta.alias).map(String),
    date,
    mtime: stat.mtimeMs, // 같은 날짜 글끼리는 나중에 쓴 글이 위로
    tags,
    metaSummary: meta.summary || '',
    body: text,
  };
}

// 2단계: 본문을 HTML로 바꾼다
function renderPost(post) {
  const { html, headings } = markdownToHtml(post.body);
  const plain = stripTags(html).replace(/\s+/g, ' ').trim();
  let summary = post.metaSummary;
  if (!summary) {
    const firstP = html.match(/<p>([\s\S]*?)<\/p>/);
    summary = firstP ? stripTags(firstP[1]).trim() : '';
    if (summary.length > 120) summary = summary.slice(0, 118) + '…';
  }
  post.html = html;
  post.headings = headings;
  post.summary = summary;
  post.minutes = Math.max(1, Math.round(plain.length / 500)); // 한글 기준 1분에 약 500자
}

// ───────────── 페이지 만들기 ─────────────

function formatDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function postHref(post) {
  return encodeURIComponent(post.slug) + '.html';
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in values ? values[key] : m));
}

function renderIndex(posts) {
  const counts = new Map();
  posts.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const tags = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b, 'ko'));

  const chips = [`<button type="button" class="chip is-on" data-tag="" aria-pressed="true">전체 <span class="count">${posts.length}</span></button>`]
    .concat(tags.map((t) => `<button type="button" class="chip" data-tag="${escapeHtml(t)}" aria-pressed="false">${escapeHtml(t)} <span class="count">${counts.get(t)}</span></button>`))
    .join('\n');

  const items = posts.map((p) => `
<li class="post-item" data-tags="${escapeHtml(p.tags.join('|'))}">
  <a class="post-card" href="${postHref(p)}">
    <div class="meta"><time datetime="${p.date}">${formatDate(p.date)}</time> · 약 ${p.minutes}분</div>
    <h2>${escapeHtml(p.title)}</h2>
    ${p.summary ? `<p class="summary">${escapeHtml(p.summary)}</p>` : ''}
    ${p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
  </a>
</li>`).join('');

  return `
<section class="intro">
  <h1>${escapeHtml(config.name)}</h1>
  ${config.description ? `<p>${escapeHtml(config.description)}</p>` : ''}
</section>
${tags.length ? `<div class="chips" role="group" aria-label="태그로 거르기">\n${chips}\n</div>` : ''}
${posts.length ? `<ul class="post-list">${items}\n</ul>` : ''}
<p class="empty"${posts.length ? ' hidden' : ''}>${posts.length ? '이 태그의 글이 없습니다.' : '아직 글이 없습니다. 글 폴더에 .md 파일을 넣고 빌드해 주세요.'}</p>`;
}

function renderToc(headings) {
  const list = headings.filter((h) => h.level === 2 || h.level === 3);
  if (list.length < 3) return '';
  return `
<nav class="toc" aria-label="목차">
  <div class="toc-title">목차</div>
  <ol>${list.map((h) => `<li class="toc-h${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ol>
</nav>`;
}

function pagerLink(post, label, cls) {
  if (!post) return '<span></span>';
  return `<a class="pager-card ${cls}" href="${postHref(post)}"><span class="pager-label">${label}</span><span class="pager-title">${escapeHtml(post.title)}</span></a>`;
}

function renderPostPage(post, newer, older) {
  return `
<a class="back" href="index.html">← 글 목록</a>
<article class="article">
  <header class="article-head">
    ${post.tags.length ? `<div class="tags">${post.tags.map((t) => `<a class="tag" href="index.html#tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('')}</div>` : ''}
    <h1>${escapeHtml(post.title)}</h1>
    <div class="meta"><time datetime="${post.date}">${formatDate(post.date)}</time> · 약 ${post.minutes}분 읽기</div>
  </header>
  ${renderToc(post.headings)}
  <div class="prose">
${post.html}
  </div>
</article>
${newer || older ? `<nav class="pager" aria-label="다른 글">${pagerLink(older, '← 이전 글', 'prev')}${pagerLink(newer, '다음 글 →', 'next')}</nav>` : ''}`;
}

// ───────────── 실행 ─────────────

function loadConfig() {
  const result = { name: '나의 블로그', description: '', lineBreaks: true, exclude: [] };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      Object.assign(result, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^﻿/, '')));
    } catch (e) {
      warn('블로그설정.json을 읽지 못해 기본 설정을 씁니다. (쉼표·따옴표를 확인해 주세요)');
    }
  }
  return result;
}

function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
    console.log('글 폴더가 없어서 새로 만들었습니다.');
  }
  config = loadConfig();
  const template = fs.readFileSync(path.join(SRC_DIR, 'template.html'), 'utf8');

  const allFiles = walk(POSTS_DIR);
  const mdFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.md'));
  const otherFiles = allFiles.filter((f) => !f.toLowerCase().endsWith('.md'));

  const posts = [];
  const errors = [];
  for (const rel of mdFiles) {
    try {
      const post = loadPost(rel);
      if (post) posts.push(post);
    } catch (e) {
      errors.push(`${rel}: 읽는 중 오류 (${e.message})`);
    }
  }
  // 같은 주소가 겹치면 뒤 글에 번호를 붙인다
  const seen = new Map();
  for (const p of posts) {
    const n = seen.get(p.slug) || 0;
    seen.set(p.slug, n + 1);
    if (n) {
      warn(`${p.file}: 주소가 다른 글과 겹쳐 "${p.slug}-${n + 1}"로 바꿨습니다.`);
      p.slug = `${p.slug}-${n + 1}`;
    }
  }

  // [[링크]] 찾기용 색인: 파일 이름·경로·제목·별칭(aliases)
  const noteIndex = new Map();
  const addNote = (key, post) => {
    const k = key.trim().toLowerCase();
    if (k && !noteIndex.has(k)) noteIndex.set(k, post);
  };
  posts.forEach((p) => {
    addNote(p.file.replace(/\.md$/i, ''), p);
    addNote(p.name, p);
  });
  posts.forEach((p) => {
    addNote(p.title, p);
    p.aliases.forEach((a) => addNote(a, p));
  });
  const fileSet = new Map(otherFiles.map((f) => [f.toLowerCase(), f]));
  const fileByName = new Map();
  otherFiles.forEach((f) => {
    const k = path.posix.basename(f).toLowerCase();
    if (!fileByName.has(k)) fileByName.set(k, f);
  });

  for (const post of posts) {
    ctx = {
      post,
      resolveNote(name) {
        const key = name.replace(/\.md$/i, '').trim().toLowerCase();
        const fromDir = post.dir ? path.posix.normalize(`${post.dir}/${key}`).toLowerCase() : key;
        return noteIndex.get(fromDir) || noteIndex.get(key) || noteIndex.get(path.posix.basename(key));
      },
      // 글 위치 기준 → 글 폴더 기준 → 파일 이름만으로 차례로 찾는다
      resolveFile(name) {
        const key = name.trim().replace(/^\.\//, '');
        const candidates = [post.dir ? path.posix.normalize(`${post.dir}/${key}`) : key, path.posix.normalize(key)];
        for (const c of candidates) {
          const hit = fileSet.get(c.toLowerCase());
          if (hit) return hit;
        }
        return fileByName.get(path.posix.basename(key).toLowerCase()) || null;
      },
    };
    try {
      renderPost(post);
    } catch (e) {
      errors.push(`${post.file}: 변환 중 오류 (${e.message})`);
      post.failed = true;
    }
  }
  ctx = null;
  const published = posts.filter((p) => !p.failed);
  published.sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime || a.title.localeCompare(b.title, 'ko'));

  // 사이트 폴더 안을 매번 비우고 새로 만든다 (직접 고친 내용은 사라짐)
  // 폴더 자체는 남긴다: 탐색기에서 열어 둔 폴더는 지울 수 없어서
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(OUT_DIR)) {
    fs.rmSync(path.join(OUT_DIR, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  // 그림 등 글 폴더의 다른 파일은 같은 폴더 구조 그대로 복사
  for (const rel of otherFiles) {
    const dest = path.join(OUT_DIR, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(POSTS_DIR, ...rel.split('/')), dest);
  }
  fs.mkdirSync(path.join(OUT_DIR, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(SRC_DIR, 'style.css'), path.join(OUT_DIR, 'assets', 'style.css'));
  fs.copyFileSync(path.join(SRC_DIR, 'main.js'), path.join(OUT_DIR, 'assets', 'main.js'));

  const year = new Date().getFullYear();
  const page = (pageTitle, description, content) => fill(template, {
    pageTitle: escapeHtml(pageTitle),
    description: escapeHtml(description || ''),
    blogName: escapeHtml(config.name),
    year,
    content,
  });

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), page(config.name, config.description, renderIndex(published)));
  published.forEach((p, n) => {
    const html = page(`${p.title} · ${config.name}`, p.summary, renderPostPage(p, published[n - 1], published[n + 1]));
    fs.writeFileSync(path.join(OUT_DIR, p.slug + '.html'), html);
  });

  console.log('');
  console.log(`[완료] 글 ${published.length}개를 블로그로 만들었습니다.`);
  console.log(`       결과: 사이트\\index.html`);
  if (warnings.length) {
    console.log('');
    console.log(`[확인] ${warnings.length}건`);
    warnings.forEach((w) => console.log('  - ' + w));
  }
  if (errors.length) {
    console.log('');
    console.log(`[오류] ${errors.length}건 (이 글은 빠졌습니다)`);
    errors.forEach((w) => console.log('  - ' + w));
    process.exitCode = 1;
  }
}

try {
  main();
} catch (e) {
  console.error('');
  console.error('[오류] 블로그를 만들지 못했습니다: ' + e.message);
  process.exitCode = 1;
}
