// 화면 동작: 기본/다크 모드 전환, 글 목록의 태그 거르기
(function () {
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // ───── 모드 전환 ─────
  // 직접 고른 적이 없으면 컴퓨터 설정(다크/라이트)을 따른다
  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!(media && media.matches);
  }

  var btn = document.getElementById('theme-toggle');
  function updateLabel() {
    if (!btn) return;
    var text = isDark() ? '기본 모드로 바꾸기' : '다크 모드로 바꾸기';
    btn.setAttribute('aria-label', text);
    btn.title = text;
  }
  if (btn) {
    btn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      updateLabel();
    });
    updateLabel();
  }
  if (media && media.addEventListener) media.addEventListener('change', updateLabel);

  // ───── 태그 거르기 (글 목록 화면에만 있음) ─────
  var chips = document.querySelectorAll('.chip[data-tag]');
  if (!chips.length) return;
  var items = document.querySelectorAll('.post-item');
  var empty = document.querySelector('.empty');

  // 주소 끝의 #tag=이름 으로 고른 태그를 기억 (뒤로 가기·글에서 태그 누르기에도 동작)
  function currentTag() {
    var m = location.hash.match(/^#tag=(.*)$/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
  }

  function apply() {
    var tag = currentTag();
    var shown = 0;
    chips.forEach(function (c) {
      var on = c.getAttribute('data-tag') === tag;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    items.forEach(function (item) {
      var tags = item.getAttribute('data-tags').split('|');
      var ok = !tag || tags.indexOf(tag) >= 0;
      item.hidden = !ok;
      if (ok) shown++;
    });
    if (empty) empty.hidden = shown > 0;
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var tag = c.getAttribute('data-tag');
      if (tag) {
        location.hash = 'tag=' + encodeURIComponent(tag);
        return;
      }
      try { history.pushState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
      apply();
    });
  });

  window.addEventListener('hashchange', apply);
  window.addEventListener('popstate', apply);
  apply();
})();
