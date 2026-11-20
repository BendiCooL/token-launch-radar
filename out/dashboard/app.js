/* Token Launch Radar — board rendering, filters, sort and the detail view.
   Reads window.RADAR from ../data.js (written by main.ts). No network, ever. */
(function () {
  'use strict';
  var data = window.RADAR;
  var rowsEl = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var detailEl = document.getElementById('detail');
  var scrimEl = document.getElementById('scrim');
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('category');
  var chainEl = document.getElementById('chain');
  var sortEl = document.getElementById('sort');
  var watchEl = document.getElementById('watchlist-only');

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function age(n) {
    if (n === null || n === undefined) return '—';
    if (n < 60) return n + 'd';
    if (n < 730) return Math.round(n / 30.4) + 'mo';
    return (n / 365.25).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Header stats and the model note.
  var stats = [
    ['Protocols scanned', data.protocol_count],
    ['Still pre-token', data.pretoken_count],
    ['On this board', data.rows.length],
    ['Watchlist covered', data.rows.filter(function (r) { return r.watchlist; }).length + ' / 40'],
  ];
  document.getElementById('stats').innerHTML = stats.map(function (s) {
    return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>';
  }).join('');
  document.getElementById('model-text').innerHTML =
    'Implied value = <b>TVL x category multiple</b>, adjusted for <b>7-day momentum</b>, <b>age without a token</b> and <b>chain reach</b>. ' +
    'The multiples are not chosen by hand: they are the median market-cap/TVL of the <b>' + data.comps_count + ' token-bearing protocols</b> in the same snapshot, ' +
    'shrunk toward the global median of <b>' + data.global_ratio + 'x</b> when a category has few observations. No protocol is ranked by name — open any row to see its exact arithmetic.';
  document.getElementById('as-of').textContent = data.as_of;

  // Filter options, in board order of first appearance.
  function fillSelect(el, values, allLabel) {
    el.innerHTML = '<option value="">' + allLabel + '</option>' + values.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    }).join('');
  }
  var categories = [];
  var chains = [];
  data.rows.forEach(function (r) {
    var c = r.category || 'Uncategorised';
    if (categories.indexOf(c) < 0) categories.push(c);
    r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
  });
  categories.sort();
  chains.sort();
  fillSelect(catEl, categories, 'All categories');
  fillSelect(chainEl, chains, 'All chains');

  function currentRows() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catEl.value;
    var chain = chainEl.value;
    var out = data.rows.filter(function (r) {
      if (watchEl.checked && !r.watchlist) return false;
      if (cat && (r.category || 'Uncategorised') !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      momentum: function (a, b) { return (b.change_7d || -999) - (a.change_7d || -999); },
      age: function (a, b) { return (b.age_days || -1) - (a.age_days || -1); },
    };
    return out.sort(by[sortEl.value] || by.rank);
  }

  function render() {
    var rows = currentRows();
    countEl.textContent = 'Showing ' + rows.length + ' of ' + data.rows.length + ' ranked protocols' +
      (watchEl.checked ? ' — watchlist only' : '') + '. Click a row for its model breakdown and farm plan.';
    emptyEl.hidden = rows.length > 0;
    rowsEl.innerHTML = rows.map(function (r) {
      var mult = (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
          (r.watchlist ? '<span class="badge">Watchlist</span>' : '') +
          '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '<span class="chains">' + esc(r.chains.slice(0, 3).join(' · ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">' + mult + '</td></tr>';
    }).join('');
  }

  function openDetail(slug) {
    var r = null;
    data.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var base = Math.round(r.tvl_usd * r.ratio);
    detailEl.innerHTML =
      '<button class="close" id="close-detail" type="button">Close</button>' +
      '<h2>' + esc(r.name) + (r.watchlist ? '<span class="badge">Watchlist</span>' : '') + '</h2>' +
      '<p class="sub">Radar rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.slug) + '</p>' +
      '<dl class="kv">' +
        '<div><dt>Implied launch value</dt><dd>' + money(r.implied_value_usd) + '</dd></div>' +
        '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>' +
        '<div><dt>7-day TVL change</dt><dd>' + pct(r.change_7d) + '</dd></div>' +
        '<div><dt>Age without a token</dt><dd>' + (r.age_days === null ? 'unreported' : r.age_days + ' days') + '</dd></div>' +
        '<div><dt>Chains</dt><dd>' + r.chains.length + '</dd></div>' +
        '<div><dt>Watchlist (TVL over $50M)</dt><dd>' + (r.watchlist ? 'Yes' : 'No — early find') + '</dd></div>' +
      '</dl>' +
      '<h3>Why this value</h3>' +
      '<p class="formula">' + money(r.tvl_usd) + ' TVL x ' + r.ratio + ' category multiple = ' + money(base) +
        ', x ' + r.momentum_mult + ' momentum, x ' + r.maturity_mult + ' maturity, x ' + r.reach_mult + ' reach = <b>' + money(r.implied_value_usd) + '</b></p>' +
      '<p class="sub">Chains: ' + esc(r.chains.join(', ') || '—') + '</p>' +
      '<h3>Farm plan</h3>' +
      '<ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    detailEl.hidden = false;
    scrimEl.hidden = false;
    document.getElementById('close-detail').addEventListener('click', closeDetail);
    if (location.hash !== '#p=' + slug) history.replaceState(null, '', '#p=' + slug);
  }
  function closeDetail() {
    detailEl.hidden = true;
    scrimEl.hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
  }

  rowsEl.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  scrimEl.addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeDetail(); });
  [qEl, catEl, chainEl, sortEl, watchEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  // Deep links used by the screenshots and by readers: #p=<slug> opens a
  // protocol, #category=<name> starts filtered.
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('category')) catEl.value = hash.get('category');
  render();
  if (hash.get('p')) openDetail(hash.get('p'));
})();
