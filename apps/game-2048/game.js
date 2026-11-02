/* 2048 게임 — 규칙(계산)과 화면(그리기)을 나눠 둠 */
(function () {
  'use strict';

  var SIZE = 4;
  var WIN_VALUE = 2048;
  var KEY_BEST = 'game2048.best';
  var KEY_STATE = 'game2048.state';

  /* ===== 규칙 함수 (화면과 무관, 숫자 표만 다룸) ===== */

  // 빈 판(모두 0) 만들기
  function emptyBoard() {
    var b = [];
    for (var r = 0; r < SIZE; r++) {
      b.push([]);
      for (var c = 0; c < SIZE; c++) b[r].push(0);
    }
    return b;
  }

  // 판 복사
  function cloneBoard(board) {
    return board.map(function (row) { return row.slice(); });
  }

  // 한 줄을 왼쪽으로 밀고 합치기
  // 반환: { line: 결과 줄, score: 얻은 점수, merged: 합쳐진 칸 번호 목록 }
  function slideLine(line) {
    var nums = line.filter(function (v) { return v !== 0; }); // 빈 칸 빼고 붙이기
    var out = [];
    var merged = [];
    var score = 0;
    for (var i = 0; i < nums.length; i++) {
      // 바로 뒤 숫자가 같으면 합침 (합친 타일은 건너뛰어 다시 합쳐지지 않음)
      if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
        var v = nums[i] * 2;
        merged.push(out.length);
        out.push(v);
        score += v;
        i++;
      } else {
        out.push(nums[i]);
      }
    }
    while (out.length < line.length) out.push(0); // 남은 자리는 빈 칸
    return { line: out, score: score, merged: merged };
  }

  // 방향별로 판 전체 이동: dir = 'left' | 'right' | 'up' | 'down'
  // 반환: { board: 새 판, score: 얻은 점수, moved: 움직였는지, merged: [[행, 열], ...] }
  function move(board, dir) {
    var next = emptyBoard();
    var score = 0;
    var merged = [];
    for (var i = 0; i < SIZE; i++) {
      // i번째 줄의 칸 좌표를 "미는 방향 쪽 끝부터" 순서로 모음
      var coords = [];
      for (var j = 0; j < SIZE; j++) {
        if (dir === 'left') coords.push([i, j]);
        else if (dir === 'right') coords.push([i, SIZE - 1 - j]);
        else if (dir === 'up') coords.push([j, i]);
        else coords.push([SIZE - 1 - j, i]); // down
      }
      var line = coords.map(function (p) { return board[p[0]][p[1]]; });
      var res = slideLine(line);
      score += res.score;
      for (var k = 0; k < SIZE; k++) next[coords[k][0]][coords[k][1]] = res.line[k];
      res.merged.forEach(function (k) { merged.push(coords[k]); });
    }
    return { board: next, score: score, moved: !sameBoard(board, next), merged: merged };
  }

  // 두 판이 같은지
  function sameBoard(a, b) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) if (a[r][c] !== b[r][c]) return false;
    }
    return true;
  }

  // 빈 칸 좌표 목록
  function emptyCells(board) {
    var list = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) if (board[r][c] === 0) list.push([r, c]);
    }
    return list;
  }

  // 빈 칸 하나에 새 타일 놓기 (2: 90%, 4: 10%). rand는 시험용으로 바꿔 넣을 수 있음
  // 반환: 놓은 좌표 [행, 열] (빈 칸이 없으면 null)
  function addRandomTile(board, rand) {
    rand = rand || Math.random;
    var cells = emptyCells(board);
    if (cells.length === 0) return null;
    var p = cells[Math.floor(rand() * cells.length)];
    board[p[0]][p[1]] = rand() < 0.9 ? 2 : 4;
    return p;
  }

  // 더 움직일 수 있는지 (빈 칸이 있거나, 가로·세로 이웃에 같은 숫자가 있으면 true)
  function canMove(board) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = board[r][c];
        if (v === 0) return true;
        if (c + 1 < SIZE && board[r][c + 1] === v) return true;
        if (r + 1 < SIZE && board[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  // 판에 특정 숫자 이상의 타일이 있는지
  function hasTile(board, value) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) if (board[r][c] >= value) return true;
    }
    return false;
  }

  // 저장해 둔 판이 올바른지 (4×4, 0 또는 2 이상 2의 거듭제곱)
  function isValidBoard(board) {
    if (!Array.isArray(board) || board.length !== SIZE) return false;
    var tiles = 0;
    for (var r = 0; r < SIZE; r++) {
      var row = board[r];
      if (!Array.isArray(row) || row.length !== SIZE) return false;
      for (var c = 0; c < SIZE; c++) {
        var v = row[c];
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || Math.floor(v) !== v) return false;
        if (v !== 0) {
          if (v < 2 || v > 131072 || (v & (v - 1)) !== 0) return false; // 2의 거듭제곱만
          tiles++;
        }
      }
    }
    return tiles > 0;
  }

  // 점수 값이 올바른지 (0 이상 정수)
  function isValidScore(n) {
    return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n;
  }

  var rules = {
    SIZE: SIZE,
    emptyBoard: emptyBoard,
    slideLine: slideLine,
    move: move,
    sameBoard: sameBoard,
    emptyCells: emptyCells,
    addRandomTile: addRandomTile,
    canMove: canMove,
    hasTile: hasTile,
    isValidBoard: isValidBoard,
    isValidScore: isValidScore
  };

  // Node에서 시험할 때는 규칙 함수만 내보내고 끝
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = rules;
  }
  if (typeof document === 'undefined') return;

  /* ===== 저장 (모두 try/catch — 저장이 막혀도 게임은 진행) ===== */

  function loadBest() {
    try {
      var raw = window.localStorage.getItem(KEY_BEST);
      if (raw === null) return 0;
      var n = Number(raw);
      return isValidScore(n) ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(n) {
    try { window.localStorage.setItem(KEY_BEST, String(n)); } catch (e) { /* 저장 안 됨 */ }
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(KEY_STATE);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return null;
      if (!isValidBoard(s.board) || !isValidScore(s.score)) return null;
      return {
        board: s.board,
        score: s.score,
        won: s.won === true,
        keepPlaying: s.keepPlaying === true
      };
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(KEY_STATE, JSON.stringify({
        board: state.board,
        score: state.score,
        won: state.won,
        keepPlaying: state.keepPlaying
      }));
    } catch (e) { /* 저장 안 됨 */ }
  }

  /* ===== 상태 (장부) ===== */

  var state = {
    board: emptyBoard(),
    score: 0,
    best: 0,
    won: false,         // 2048 안내를 이미 띄웠는지
    keepPlaying: false, // [계속하기]를 눌렀는지
    over: false         // 게임 오버인지
  };
  var fx = { added: null, merged: [] }; // 이번 그리기에서 "톡" 효과를 줄 칸

  /* ===== 화면 요소 ===== */

  var elBoard = document.getElementById('board');
  var elScore = document.getElementById('score');
  var elBest = document.getElementById('best');
  var elOverlay = document.getElementById('overlay');
  var elOverlayTitle = document.getElementById('overlay-title');
  var elOverlayText = document.getElementById('overlay-text');
  var elKeep = document.getElementById('keep-playing');
  var elRetry = document.getElementById('retry');
  var elNew = document.getElementById('new-game');
  var elHelp = document.getElementById('help');

  // 빈 칸 16개를 미리 깔아 둠
  var cells = [];
  for (var r = 0; r < SIZE; r++) {
    cells.push([]);
    for (var c = 0; c < SIZE; c++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      elBoard.appendChild(cell);
      cells[r].push(cell);
    }
  }

  /* ===== 그리기 (장부를 보고 화면을 다시 그림) ===== */

  function isAt(p, r, c) { return p && p[0] === r && p[1] === c; }

  function tileClass(v) {
    var digits = String(v).length;
    var cls = 'tile ' + (v > WIN_VALUE ? 'vbig' : 'v' + v);
    if (digits === 3) cls += ' d3';
    else if (digits === 4) cls += ' d4';
    else if (digits >= 5) cls += ' d5';
    return cls;
  }

  var overlayShown = '';
  var ready = false; // 처음 열 때는 포커스를 옮기지 않음 (iframe에서 블로그 화면을 건드리지 않게)

  function focusQuiet(el) {
    if (!ready) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function render() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = cells[r][c];
        var v = state.board[r][c];
        while (cell.firstChild) cell.removeChild(cell.firstChild);
        if (v === 0) continue;
        var tile = document.createElement('div');
        var cls = tileClass(v);
        if (isAt(fx.added, r, c)) cls += ' is-new';
        else if (fx.merged.some(function (p) { return isAt(p, r, c); })) cls += ' is-merged';
        tile.className = cls;
        tile.textContent = String(v);
        cell.appendChild(tile);
      }
    }
    fx = { added: null, merged: [] };

    elScore.textContent = String(state.score);
    elBest.textContent = String(state.best);

    // 안내 막: 2048 달성(계속하기 전) → 게임 오버 순서로 확인
    var mode = '';
    if (state.won && !state.keepPlaying) mode = 'win';
    else if (state.over) mode = 'over';

    if (mode === 'win') {
      elOverlayTitle.textContent = '2048 달성!';
      elOverlayText.textContent = '점수 ' + state.score;
      elKeep.hidden = false;
      elRetry.textContent = '새 게임';
    } else if (mode === 'over') {
      elOverlayTitle.textContent = '게임 끝!';
      elOverlayText.textContent = '최종 점수 ' + state.score;
      elKeep.hidden = true;
      elRetry.textContent = '다시 하기';
    }
    elOverlay.hidden = mode === '';

    // 안내 막이 새로 떴을 때만 첫 버튼으로 포커스 이동 (키보드로 바로 누를 수 있게)
    if (mode && mode !== overlayShown) {
      focusQuiet(mode === 'win' ? elKeep : elRetry);
    }
    overlayShown = mode;
  }

  /* ===== 진행 ===== */

  function newGame() {
    state.board = emptyBoard();
    state.score = 0;
    state.won = false;
    state.keepPlaying = false;
    state.over = false;
    var a = addRandomTile(state.board);
    var b = addRandomTile(state.board);
    fx = { added: null, merged: [] };
    saveState();
    render();
    // 새 타일 두 개 모두 "톡" 효과
    [a, b].forEach(function (p) {
      var t = p && cells[p[0]][p[1]].firstChild;
      if (t) t.className += ' is-new';
    });
    focusQuiet(elBoard);
  }

  function overlayOpen() {
    return (state.won && !state.keepPlaying) || state.over;
  }

  function doMove(dir) {
    if (overlayOpen()) return; // 안내 막이 떠 있으면 무시
    var res = move(state.board, dir);
    if (!res.moved) return; // 움직임 없음 → 아무 일도 없음

    state.board = res.board;
    state.score += res.score;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest(state.best);
    }
    fx.added = addRandomTile(state.board);
    fx.merged = res.merged;

    if (!state.won && hasTile(state.board, WIN_VALUE)) state.won = true; // 처음 한 번만
    state.over = !canMove(state.board);

    saveState();
    render();
  }

  /* ===== 입력: 키보드 ===== */

  var KEY_DIR = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    Left: 'left', Right: 'right', Up: 'up', Down: 'down' // 옛 브라우저용 이름
  };
  var CODE_DIR = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // 방향키는 e.key, WASD는 e.code(한글 입력 상태에서도 같은 값) 기준
    var dir = KEY_DIR[e.key] || CODE_DIR[e.code];
    if (!dir) {
      var k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      dir = { a: 'left', d: 'right', w: 'up', s: 'down' }[k];
    }
    if (!dir) return; // 게임 키가 아니면 기본 동작 그대로 (Tab 등)
    e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    if (e.repeat) return; // 누르고 있어도 한 번만
    doMove(dir);
  });

  /* ===== 입력: 터치 밀기 ===== */

  var touch = null; // { x, y } 시작 위치. 손가락 두 개면 null

  elBoard.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  elBoard.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) { touch = null; return; } // 두 손가락은 무시
    if (touch && e.cancelable) e.preventDefault(); // 화면 스크롤 막기 (보조)
  }, { passive: false });

  elBoard.addEventListener('touchend', function (e) {
    if (!touch) return;
    if (e.touches.length > 0) { touch = null; return; }
    var t = e.changedTouches[0];
    var dx = t.clientX - touch.x;
    var dy = t.clientY - touch.y;
    touch = null;
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 30) return; // 너무 짧으면 톡 친 것으로 보고 무시
    if (ax > ay) doMove(dx > 0 ? 'right' : 'left');
    else doMove(dy > 0 ? 'down' : 'up');
  });

  elBoard.addEventListener('touchcancel', function () { touch = null; });

  // 판을 누르면 키보드 입력을 받을 수 있게 포커스 (iframe 안에서 필요)
  elBoard.addEventListener('mousedown', function () { ready = true; focusQuiet(elBoard); });

  /* ===== 버튼 ===== */

  elNew.addEventListener('click', newGame);
  elRetry.addEventListener('click', newGame);
  elKeep.addEventListener('click', function () {
    state.keepPlaying = true;
    saveState();
    render();
    focusQuiet(elBoard);
  });

  /* ===== 시작 ===== */

  // iframe 안이면 "판을 누른 뒤" 안내 추가
  var inFrame = false;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  if (inFrame) elHelp.textContent = '조작: 판을 누른 뒤 방향키 · WASD · 화면 밀기';

  state.best = loadBest();
  var saved = loadState();
  if (saved) {
    state.board = saved.board;
    state.score = saved.score;
    state.won = saved.won || hasTile(saved.board, WIN_VALUE);
    state.keepPlaying = saved.keepPlaying;
    state.over = !canMove(state.board);
    if (state.score > state.best) {
      state.best = state.score;
      saveBest(state.best);
    }
    render();
  } else {
    newGame();
  }
  ready = true;
})();
