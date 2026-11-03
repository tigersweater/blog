/* 픽셀 아트 — 그림 데이터 계산(장부)과 화면 그리기(게시판)를 나눠 둠 */
(function () {
  'use strict';

  var SIZE = 16;              // 16×16 고정
  var COUNT = SIZE * SIZE;    // 256칸
  var HISTORY_LIMIT = 50;     // 되돌리기 최대 단계
  var STORE_KEY = 'pixelArt.v1';
  var SCALES = [1, 8, 16, 32];
  var DEFAULT_COLOR = '#000000';
  var DEFAULT_SCALE = 16;

  // 기본 팔레트 16색
  var PALETTE = [
    { name: '검정', code: '#000000' },
    { name: '진회색', code: '#5F6368' },
    { name: '연회색', code: '#BDC1C6' },
    { name: '흰색', code: '#FFFFFF' },
    { name: '빨강', code: '#FF3B30' },
    { name: '주황', code: '#FF9500' },
    { name: '노랑', code: '#FFD60A' },
    { name: '살구', code: '#FFC9A3' },
    { name: '연두', code: '#A8E05F' },
    { name: '초록', code: '#34C759' },
    { name: '하늘', code: '#64D2FF' },
    { name: '파랑', code: '#0A84FF' },
    { name: '남색', code: '#3634A3' },
    { name: '보라', code: '#AF52DE' },
    { name: '분홍', code: '#FF6FAE' },
    { name: '갈색', code: '#8B5A2B' }
  ];

  /* ===== 그림 함수 (화면과 무관, 256칸 목록만 다룸) ===== */

  // 빈 그림 (모두 null = 투명)
  function emptyPixels() {
    var p = [];
    for (var i = 0; i < COUNT; i++) p.push(null);
    return p;
  }

  // 색 코드 검사: # + 16진수 6자리
  function isColor(v) {
    return typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
  }

  // 색 코드를 대문자로 통일 (#ff0000 → #FF0000)
  function normColor(v) {
    return isColor(v) ? v.toUpperCase() : null;
  }

  // 줄·칸 → 칸 번호 (판 밖이면 -1)
  function toIndex(x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return -1;
    return y * SIZE + x;
  }

  // 두 그림이 같은지
  function samePixels(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function isEmpty(pixels) {
    for (var i = 0; i < pixels.length; i++) if (pixels[i] !== null) return false;
    return true;
  }

  // 두 칸 사이 직선이 지나는 칸 목록 (브레젠험 선 긋기) — 빠르게 끌어도 빠짐 없게
  function lineCells(x0, y0, x1, y1) {
    var out = [];
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
      out.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return out;
  }

  // 획 한 구간에서 실제로 칠할 칸: 판 밖 좌표까지 선으로 잇고 판 안(0~15) 칸만 남김
  // → 빠르게 판 밖으로 나가거나 밖에서 들어와도 가장자리 칸이 빠지지 않음
  function strokeCells(x0, y0, x1, y1) {
    return lineCells(x0, y0, x1, y1).filter(function (c) {
      return toIndex(c[0], c[1]) !== -1;
    });
  }

  // 한 칸 칠하기 (color가 null이면 지우기). 바뀌었으면 true
  function setPixel(pixels, idx, color) {
    if (idx < 0 || idx >= COUNT) return false;
    if (pixels[idx] === color) return false;
    pixels[idx] = color;
    return true;
  }

  // 채우기: 누른 칸과 같은 색으로 위·아래·왼·오른쪽 이어진 칸을 color로
  // 새 그림을 돌려줌. 바뀐 게 없으면 null
  function floodFill(pixels, idx, color) {
    if (idx < 0 || idx >= COUNT) return null;
    var target = pixels[idx];
    if (target === color) return null;
    var out = pixels.slice();
    var todo = [idx];               // 할 일 목록 (되부름 대신)
    out[idx] = color;
    while (todo.length) {
      var i = todo.pop();
      var x = i % SIZE, y = (i - x) / SIZE;
      var near = [toIndex(x - 1, y), toIndex(x + 1, y), toIndex(x, y - 1), toIndex(x, y + 1)];
      for (var k = 0; k < 4; k++) {
        var n = near[k];
        if (n >= 0 && out[n] === target) {
          out[n] = color;
          todo.push(n);
        }
      }
    }
    return out;
  }

  /* ===== 되돌리기 기록 (단계 전 그림 전체를 쌓음) ===== */

  function createHistory() {
    return { undo: [], redo: [] };
  }

  // 새 단계 기록: 바뀌기 전 그림을 넣고, 다시하기 기록은 비움
  function recordHistory(h, before) {
    h.undo.push(before.slice());
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
    h.redo = [];
  }

  // 되돌리기: 지금 그림을 다시하기에 넣고 이전 그림을 돌려줌 (없으면 null)
  function undoHistory(h, current) {
    if (!h.undo.length) return null;
    h.redo.push(current.slice());
    return h.undo.pop();
  }

  function redoHistory(h, current) {
    if (!h.redo.length) return null;
    h.undo.push(current.slice());
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
    return h.redo.pop();
  }

  /* ===== PNG용 계산 ===== */

  // 색 있는 칸만 정수 크기 사각형 목록으로 (빈 칸 = 투명이라 안 칠함)
  function pngRects(pixels, scale) {
    var rects = [];
    for (var i = 0; i < COUNT; i++) {
      if (pixels[i] === null) continue;
      var x = i % SIZE, y = (i - x) / SIZE;
      rects.push({ x: x * scale, y: y * scale, w: scale, h: scale, color: pixels[i] });
    }
    return rects;
  }

  // 파일 이름: pixel-art-20261103-153012.png
  function fileName(d) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return 'pixel-art-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) +
      '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) + '.png';
  }

  /* ===== 저장값 검사 (이상한 값은 버리고 기본값) ===== */

  function parseSaved(raw) {
    var state = { pixels: emptyPixels(), color: DEFAULT_COLOR, grid: true, scale: DEFAULT_SCALE };
    if (typeof raw !== 'string') return state;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return state; }
    if (!data || typeof data !== 'object') return state;
    // 그림: 길이 256 목록일 때만, 이상한 칸은 빈 칸으로
    if (Array.isArray(data.pixels) && data.pixels.length === COUNT) {
      state.pixels = data.pixels.map(function (v) { return normColor(v); });
    }
    if (isColor(data.color)) state.color = normColor(data.color);
    if (typeof data.grid === 'boolean') state.grid = data.grid;
    if (SCALES.indexOf(data.scale) !== -1) state.scale = data.scale;
    return state;
  }

  var core = {
    SIZE: SIZE,
    COUNT: COUNT,
    HISTORY_LIMIT: HISTORY_LIMIT,
    PALETTE: PALETTE,
    emptyPixels: emptyPixels,
    isColor: isColor,
    normColor: normColor,
    toIndex: toIndex,
    samePixels: samePixels,
    isEmpty: isEmpty,
    lineCells: lineCells,
    strokeCells: strokeCells,
    setPixel: setPixel,
    floodFill: floodFill,
    createHistory: createHistory,
    recordHistory: recordHistory,
    undoHistory: undoHistory,
    redoHistory: redoHistory,
    pngRects: pngRects,
    fileName: fileName,
    parseSaved: parseSaved
  };

  // Node에서 시험할 때는 계산 함수만 내보내고 끝
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }
  if (typeof document === 'undefined') return;

  /* ===== 상태 ===== */

  var pixels = emptyPixels();
  var color = DEFAULT_COLOR;
  var tool = 'pen';
  var grid = true;
  var scale = DEFAULT_SCALE;
  var history = createHistory();
  var canStore = true;

  // 한 획 진행 정보
  var stroke = null; // { id, before, last: [x, y] 또는 null }

  /* ===== 화면 요소 ===== */

  var boardCard = document.getElementById('board-card');
  var board = document.getElementById('board');
  var paletteBox = document.getElementById('palette');
  var swatch = document.getElementById('swatch');
  var codeEl = document.getElementById('color-code');
  var customInput = document.getElementById('custom-color');
  var undoBtn = document.getElementById('undo');
  var redoBtn = document.getElementById('redo');
  var gridToggle = document.getElementById('grid-toggle');
  var clearBtn = document.getElementById('clear');
  var scaleSel = document.getElementById('scale');
  var saveBtn = document.getElementById('save');
  var openTabBtn = document.getElementById('open-tab');
  var toast = document.getElementById('toast');
  var help = document.getElementById('help');
  var toolBtns = Array.prototype.slice.call(document.querySelectorAll('.tool'));
  var cells = [];
  var drawn = []; // 화면에 칠해 둔 색 (바뀐 칸만 고치려고)
  var chips = [];

  /* ===== 자동 저장 (모두 try/catch — 막혀도 그리기는 정상) ===== */

  function load() {
    try {
      var s = parseSaved(window.localStorage.getItem(STORE_KEY));
      pixels = s.pixels; color = s.color; grid = s.grid; scale = s.scale;
    } catch (e) {
      canStore = false;
    }
  }

  function save() {
    if (!canStore) return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        pixels: pixels, color: color, grid: grid, scale: scale
      }));
    } catch (e) {
      canStore = false;
      showHelp();
    }
  }

  function showHelp() {
    help.textContent = canStore
      ? '자동 저장됨 · 창을 닫아도 그림이 남아요'
      : '자동 저장을 쓸 수 없어요 (그리기와 PNG 저장은 됩니다)';
  }

  /* ===== 그리기 (장부를 보고 화면을 칠함) ===== */

  function buildBoard() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < COUNT; i++) {
      var c = document.createElement('div');
      c.className = 'px';
      cells.push(c);
      drawn.push(null);
      frag.appendChild(c);
    }
    board.appendChild(frag);
  }

  function renderBoard() {
    for (var i = 0; i < COUNT; i++) {
      if (drawn[i] === pixels[i]) continue;
      cells[i].style.backgroundColor = pixels[i] || '';
      drawn[i] = pixels[i];
    }
  }

  function buildPalette() {
    PALETTE.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.style.backgroundColor = p.code;
      b.setAttribute('aria-label', p.name + ' ' + p.code);
      b.title = p.name;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { pickColor(p.code, true); });
      chips.push({ el: b, code: p.code });
      paletteBox.appendChild(b);
    });
  }

  function renderTools() {
    toolBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tool') === tool ? 'true' : 'false');
    });
    chips.forEach(function (c) {
      c.el.setAttribute('aria-pressed', c.code === color ? 'true' : 'false');
    });
    // 지금 색 상자: 지우개면 체크무늬
    if (tool === 'eraser') {
      swatch.classList.add('empty');
      swatch.style.backgroundColor = '';
      codeEl.textContent = '투명';
    } else {
      swatch.classList.remove('empty');
      swatch.style.backgroundColor = color;
      codeEl.textContent = color;
    }
    if (customInput.value.toUpperCase() !== color) customInput.value = color.toLowerCase();
    undoBtn.disabled = history.undo.length === 0;
    redoBtn.disabled = history.redo.length === 0;
    board.classList.toggle('no-grid', !grid);
    gridToggle.checked = grid;
    scaleSel.value = String(scale);
  }

  // 그림판 크기: 쓸 수 있는 폭·480px·화면 높이 60% 중 작은 값 → 16으로 나눠 정수 칸
  function fitBoard() {
    var cs = window.getComputedStyle(boardCard);
    var avail = boardCard.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2; // 그림판 테두리 2px
    var size = Math.min(avail, 480, Math.floor(window.innerHeight * 0.6));
    var cell = Math.max(8, Math.floor(size / SIZE));
    if (cell % 2) cell -= 1; // 짝수로: 체크무늬 조각(칸의 절반)도 정수 px
    board.style.setProperty('--cell', cell + 'px');
    // 그림판 위치를 정수 px에 맞춤 (격자선·체크무늬가 흐려지지 않게)
    board.style.transform = '';
    var r = board.getBoundingClientRect();
    var dx = Math.round(r.left) - r.left;
    var dy = Math.round(r.top) - r.top;
    if (dx || dy) board.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }

  /* ===== 상태 바꾸기 ===== */

  function setTool(t) {
    tool = t;
    renderTools();
  }

  // 색 고르기. fromPalette면 지우개·스포이드는 펜으로 돌아감
  function pickColor(c, fromPalette) {
    var n = normColor(c);
    if (!n) return;
    color = n;
    if (fromPalette && (tool === 'eraser' || tool === 'picker')) tool = 'pen';
    renderTools();
    save();
  }

  // 그림 한 번에 바꾸기 (채우기·전체 지우기): 기록 남기고 저장
  function commit(next) {
    recordHistory(history, pixels);
    pixels = next;
    renderBoard();
    renderTools();
    save();
  }

  function undo() {
    var prev = undoHistory(history, pixels);
    if (!prev) return;
    pixels = prev;
    renderBoard(); renderTools(); save();
  }

  function redo() {
    var next = redoHistory(history, pixels);
    if (!next) return;
    pixels = next;
    renderBoard(); renderTools(); save();
  }

  /* ===== 그림판 입력 (포인터 이벤트: 마우스·펜·손가락 한 번에) ===== */

  // 화면 위치 → [칸, 줄] (판 밖이어도 범위 제한 없이 계산)
  function rawCellAt(clientX, clientY) {
    var r = board.getBoundingClientRect();
    var size = board.clientWidth / SIZE;
    return [
      Math.floor((clientX - r.left - board.clientLeft) / size),
      Math.floor((clientY - r.top - board.clientTop) / size)
    ];
  }

  // 판 안이면 [칸, 줄], 밖이면 null
  function cellAt(clientX, clientY) {
    var at = rawCellAt(clientX, clientY);
    return toIndex(at[0], at[1]) === -1 ? null : at;
  }

  // 펜·지우개로 from → to 까지 이어 칠함 (판 밖 칸은 건너뜀)
  function paintLine(from, to) {
    var c = tool === 'eraser' ? null : color;
    var list = from ? strokeCells(from[0], from[1], to[0], to[1]) : [to];
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      if (setPixel(pixels, toIndex(list[i][0], list[i][1]), c)) changed = true;
    }
    if (changed) renderBoard();
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 왼쪽 버튼만
    // 두 번째 손가락 무시 (모든 도구): 처음 닿은 손가락만 isPrimary가 참
    if (stroke || e.isPrimary === false) return;
    var at = cellAt(e.clientX, e.clientY);
    if (!at) return;
    e.preventDefault();
    var idx = toIndex(at[0], at[1]);

    if (tool === 'fill') {
      var next = floodFill(pixels, idx, color);
      if (next) commit(next);
      return;
    }
    if (tool === 'picker') {
      // 칠한 칸이면 그 색을 지금 색으로 하고 펜으로. 빈 칸이면 아무 일 없음
      if (pixels[idx] !== null) {
        color = pixels[idx];
        tool = 'pen';
        renderTools();
        save();
      }
      return;
    }
    // 펜·지우개: 한 획 시작
    stroke = { id: e.pointerId, before: pixels.slice(), last: at };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    paintLine(null, at);
  }

  function onMove(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    e.preventDefault();
    // 띄엄띄엄 온 움직임도 모두 처리
    var list = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [];
    if (!list || !list.length) list = [e];
    for (var i = 0; i < list.length; i++) {
      // 판 밖 좌표도 그대로 써서 이전 점과 선으로 잇고, 판 안 칸만 칠함
      var at = rawCellAt(list[i].clientX, list[i].clientY);
      if (stroke.last[0] === at[0] && stroke.last[1] === at[1]) continue;
      paintLine(stroke.last, at);
      stroke.last = at;
    }
  }

  // 획 끝 (뗌·취소·잡기 풀림): 바뀌었으면 기록 1단계 + 저장
  function onUp(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    var before = stroke.before;
    stroke = null;
    try { board.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    if (!samePixels(before, pixels)) {
      recordHistory(history, before);
      renderTools();
      save();
    }
  }

  board.addEventListener('pointerdown', onDown);
  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerup', onUp);
  board.addEventListener('pointercancel', onUp);
  board.addEventListener('lostpointercapture', onUp);
  board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  board.addEventListener('dragstart', function (e) { e.preventDefault(); });
  // 옛 브라우저용: 그림판 위 터치 이동 시 스크롤 막기
  board.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  /* ===== 버튼들 ===== */

  toolBtns.forEach(function (b) {
    b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
  });
  customInput.addEventListener('input', function () { pickColor(customInput.value, true); });
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  gridToggle.addEventListener('change', function () {
    grid = gridToggle.checked;
    renderTools(); save();
  });
  clearBtn.addEventListener('click', function () {
    if (isEmpty(pixels)) return;
    if (!window.confirm('정말 모두 지울까요?')) return;
    commit(emptyPixels());
  });
  scaleSel.addEventListener('change', function () {
    var s = Number(scaleSel.value);
    if (SCALES.indexOf(s) !== -1) scale = s;
    save();
  });

  /* ===== PNG 저장 ===== */

  // 화면에 안 보이는 종이에 칸마다 정수 크기 사각형으로 칠함 (빈 칸은 투명)
  function makeCanvas() {
    var cv = document.createElement('canvas');
    cv.width = SIZE * scale;
    cv.height = SIZE * scale;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    pngRects(pixels, scale).forEach(function (r) {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    });
    return cv;
  }

  var toastTimer = 0;
  function showToast(msg) {
    toast.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.textContent = ''; }, 2000);
  }

  function download(url, name) {
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 새 탭에 그림 띄우고 "길게 눌러 저장" 안내 (휴대폰에서 내려받기가 안 될 때)
  function openInTab() {
    var url = makeCanvas().toDataURL('image/png');
    var w = window.open('', '_blank');
    if (!w) { showToast('새 탭을 열 수 없어요 (팝업 차단 확인)'); return; }
    var d = w.document;
    d.title = '픽셀 아트 그림';
    d.body.style.cssText = 'margin:0;padding:16px;background:#EEEFF2;font-family:sans-serif;text-align:center;';
    var p = d.createElement('p');
    p.textContent = '그림을 길게 눌러(또는 오른쪽 클릭) 저장하세요';
    var img = d.createElement('img');
    img.src = url;
    img.alt = '픽셀 아트 그림';
    img.style.cssText = 'max-width:100%;image-rendering:pixelated;background:repeating-conic-gradient(#fff 0 25%,#e8e9ed 0 50%) 0 0/16px 16px;';
    d.body.appendChild(p);
    d.body.appendChild(img);
  }

  var canDownload = 'download' in document.createElement('a');

  saveBtn.addEventListener('click', function () {
    if (!canDownload) { openInTab(); return; }
    var cv = makeCanvas();
    var name = fileName(new Date());
    if (typeof cv.toBlob === 'function') {
      cv.toBlob(function (blob) {
        if (!blob) { download(cv.toDataURL('image/png'), name); showToast('저장했어요'); return; }
        var url = URL.createObjectURL(blob);
        download(url, name);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        showToast('저장했어요');
      }, 'image/png');
    } else {
      download(cv.toDataURL('image/png'), name);
      showToast('저장했어요');
    }
  });
  openTabBtn.addEventListener('click', openInTab);

  /* ===== 시작 ===== */

  load();
  // 손가락 기기에서는 "새 탭에서 열기" 대안을 보여 줌
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) openTabBtn.hidden = false;
  } catch (e) { /* 무시 */ }
  buildBoard();
  buildPalette();
  fitBoard();
  renderBoard();
  renderTools();
  showHelp();

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitBoard, 50);
  });
  window.addEventListener('orientationchange', function () { setTimeout(fitBoard, 200); });
})();
