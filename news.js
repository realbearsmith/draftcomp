/* Recent-news panel for the 2026 draft board.
 *
 * Self-contained: watches #view for player detail panels opened by app.js and
 * injects a "Recent news" section into each one. Nothing in app.js calls this.
 *
 * Two hops against ESPN's public endpoints, both cached:
 *   1. name  -> athlete id   (site.web.api.espn.com search, cached forever)
 *   2. id    -> news items   (fantasy news feed, cached for 15 minutes)
 *
 * If either request fails — offline, rate-limited, CORS, ESPN down — the panel
 * degrades to plain links rather than showing an error and blocking the draft.
 */
(function () {
"use strict";

var SEARCH = "https://site.web.api.espn.com/apis/common/v3/search";
var NEWS   = "https://site.web.api.espn.com/apis/fantasy/v2/games/ffl/news/players";
var ID_KEY = "ff2026.espnids.v1";
var NW_KEY = "ff2026.news.v1";
var TTL    = 15 * 60 * 1000;          // news cache lifetime
var DAYS   = 60;                       // how far back to look
var LIMIT  = 6;                        // headlines per player

/* our team codes -> ESPN's */
var TEAM = {WAS: "WSH", LVR: "LV", JAC: "JAX"};

/* Body parts only — "back" is deliberately absent on its own because every
   running back in the league would trip it. */
var INJURY = /\b(injur\w*|questionable|doubtful|ruled out|inactive|injured reserve|IR\b|PUP\b|hamstring|knee|ankle|groin|calf|quad|hip|shoulder|foot|toe|concussion|protocol|surgery|strain\w*|sprain\w*|torn|acl\b|achilles|back (?:injury|tightness|spasms?|soreness|issue)|did not practice|missed practice|limited (?:in )?practice|dnp\b|carted|setback|re-?aggravat\w*)\b/i;
/* Not an injury, but still something you want to see before you spend a pick:
   availability, role and contract noise. */
var BOOST  = /\b(suspend\w*|suspension|holdout|hold-?in|extension|traded?|released|waived|signed|starter|starting|depth chart|snap count|reps|promoted|activated|cleared|did not (?:play|suit up|dress)|ramp-?up|return(?:ed|ing)? to practice|sat out|held out|rested)\b/i;

function loadJSON(k){
  try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; }
}
function saveJSON(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}
var idCache = loadJSON(ID_KEY);
var nwCache = loadJSON(NW_KEY);
var inflight = {};

function esc(x){
  return String(x == null ? "" : x).replace(/[&<>"]/g, function(m){
    return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[m]; });
}
function ago(iso){
  var t = Date.parse(iso);
  if (!t) return "";
  var m = Math.floor((Date.now() - t) / 60000);
  if (m < 60)    return m <= 1 ? "just now" : m + "m ago";
  var h = Math.floor(m / 60);
  if (h < 24)    return h + "h ago";
  var d = Math.floor(h / 24);
  if (d < 30)    return d + "d ago";
  return new Date(t).toLocaleDateString(undefined, {month:"short", day:"numeric"});
}
function jget(url){
  return fetch(url, {mode: "cors", credentials: "omit"}).then(function(r){
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

/* ---------------------------------------------------------------- id lookup */
function resolveId(p){
  var k = p.key;
  if (idCache[k]) return Promise.resolve(idCache[k]);
  var want = TEAM[p.team] || p.team;
  var url = SEARCH + "?query=" + encodeURIComponent(p.name) +
            "&limit=5&sport=football&league=nfl&type=player";
  return jget(url).then(function(d){
    var items = (d && d.items) || [];
    if (!items.length) throw new Error("no match");
    // Prefer the result on the right NFL team — "Josh Allen" is a QB and a
    // linebacker, and the search does not know which one we mean.
    var hit = items.filter(function(it){
      var rel = (it.teamRelationships || [])[0];
      var abb = rel && rel.core && rel.core.abbreviation;
      return abb && want && abb.toUpperCase() === want.toUpperCase();
    })[0] || items[0];
    var id = parseInt(hit.id, 10);
    if (!id) throw new Error("no id");
    idCache[k] = id;
    saveJSON(ID_KEY, idCache);
    return id;
  });
}

/* -------------------------------------------------------------- news lookup */
function normalise(feed){
  return (feed || []).map(function(it){
    var web = it.links && it.links.web && it.links.web.href;
    var mob = it.links && it.links.mobile && it.links.mobile.href;
    var head = it.headline || it.description || "";
    var body = it.story || "";
    return {
      head: head,
      body: body.replace(/<[^>]+>/g, "").trim(),
      when: it.published || it.lastModified || "",
      src:  it.type === "Rotowire" ? "Rotowire" :
            it.type === "Media"    ? "ESPN video" : "ESPN",
      url:  web || mob || "",
      hot:  INJURY.test(head + " " + body),
      note: BOOST.test(head + " " + body)
    };
  }).filter(function(x){ return x.head; });
}

function fetchNews(p){
  var k = p.key;
  var c = nwCache[k];
  if (c && Date.now() - c.t < TTL) return Promise.resolve(c.items);
  if (inflight[k]) return inflight[k];
  inflight[k] = resolveId(p).then(function(id){
    return jget(NEWS + "?days=" + DAYS + "&limit=" + LIMIT + "&playerId=" + id);
  }).then(function(d){
    var items = normalise(d && d.feed);
    nwCache[k] = {t: Date.now(), items: items};
    saveJSON(NW_KEY, nwCache);
    delete inflight[k];
    return items;
  })["catch"](function(e){
    delete inflight[k];
    throw e;
  });
  return inflight[k];
}

/* ----------------------------------------------------------------- rendering */
function searchLinks(p){
  var q = encodeURIComponent(p.name + " NFL");
  return '<a class="nlink" target="_blank" rel="noopener" ' +
    'href="https://news.google.com/search?q=' + q + '">Search Google News</a>' +
    '<a class="nlink" target="_blank" rel="noopener" ' +
    'href="https://www.espn.com/search/_/q/' + encodeURIComponent(p.name) +
    '">Look up on ESPN</a>';
}

function renderItems(p, items){
  if (!items.length){
    return '<div class="nempty">No ESPN or Rotowire items in the last ' + DAYS +
      ' days — usually a good sign.</div><div class="nlinks">' +
      searchLinks(p) + '</div>';
  }
  var rows = items.map(function(it){
    var cls = it.hot ? " hot" : it.note ? " note" : "";
    var open = it.url ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' : "<span>";
    var shut = it.url ? "</a>" : "</span>";
    return '<li class="nitem' + cls + '">' +
      '<div class="nmeta"><span class="nsrc">' + esc(it.src) + '</span>' +
      (it.hot  ? '<span class="nflag">injury</span>' :
       it.note ? '<span class="nflag amber">status</span>' : "") +
      '<span class="nwhen">' + esc(ago(it.when)) + '</span></div>' +
      '<div class="nhead">' + open + esc(it.head) + shut + '</div>' +
      (it.body ? '<div class="nbody">' + esc(it.body) + '</div>' : "") +
      '</li>';
  }).join("");
  return '<ul class="nlist">' + rows + '</ul>' +
    '<div class="nlinks">' + searchLinks(p) + '</div>';
}

function panelFor(p){
  var box = document.createElement("div");
  box.className = "news";
  box.setAttribute("data-news", p.key);
  box.innerHTML = '<div class="nhead2">Recent news</div>' +
                  '<div class="nbodywrap"><div class="nload">Loading latest…</div></div>';
  var target = box.querySelector(".nbodywrap");

  if (p.pos === "DST"){
    var t = TEAM[p.team] || p.team;
    target.innerHTML = '<div class="nempty">Team defenses do not carry player news. ' +
      'Check the team page for injuries on that defense.</div>' +
      '<div class="nlinks"><a class="nlink" target="_blank" rel="noopener" ' +
      'href="https://www.espn.com/nfl/team/injuries/_/name/' +
      encodeURIComponent(String(t).toLowerCase()) + '">' + esc(t) +
      ' injury report</a></div>';
    return box;
  }

  fetchNews(p).then(function(items){
    target.innerHTML = renderItems(p, items);
  })["catch"](function(){
    target.innerHTML = '<div class="nempty">Could not reach ESPN just now. ' +
      'Your draft board still works — this panel needs a live connection.</div>' +
      '<div class="nlinks">' + searchLinks(p) + '</div>';
  });
  return box;
}

/* ------------------------------------------------------- attach to the board */
function byKey(k){
  var D = window.FF_DATA;
  if (!D) return null;
  for (var i = 0; i < D.players.length; i++)
    if (D.players[i].key === k) return D.players[i];
  return null;
}

function decorate(){
  var details = document.querySelectorAll("#view .detail");
  for (var i = 0; i < details.length; i++){
    var d = details[i];
    if (d.querySelector("[data-news]")) continue;
    var row = d.previousElementSibling;
    var k = row && row.getAttribute && row.getAttribute("data-k");
    if (!k) continue;
    var p = byKey(k);
    if (!p) continue;
    var panel = panelFor(p);
    var buttons = d.querySelectorAll(".tags");
    var before = buttons.length ? buttons[buttons.length - 1] : null;
    if (before) d.insertBefore(panel, before);
    else d.appendChild(panel);
  }
}

var view = document.getElementById("view");
if (view && window.MutationObserver){
  new MutationObserver(function(){ decorate(); }).observe(view, {childList: true, subtree: true});
}
decorate();

/* exposed for testing */
window.FF_NEWS = {decorate: decorate, fetchNews: fetchNews, resolveId: resolveId,
                  normalise: normalise, ago: ago, INJURY: INJURY};
})();
