/* 2026 Synthesized Draft Board — app logic.
   Reads window.FF_DATA (data.js) and drives the page defined in index.html. */
(function () {
"use strict";
var D = window.FF_DATA, P = D.players, META = D.meta;
var TEAMS = 12;
var LS = "ff2026draft.v1";

/* ------------------------------------------------------------------ glossary */
var GLOSSARY = [
  {t:"Consensus rank", ab:"the # column",
   d:"Where this player sits once all three sources are blended into one list. " +
     "<em>#1 is the best player left on the board.</em> It is what to fall back on when " +
     "nothing else is telling you otherwise."},
  {t:"Projected points", ab:"PROJ",
   d:"How many fantasy points this player is forecast to score across the whole 17-game " +
     "season. <em>Bigger is better.</em> Good for comparing two players at the same " +
     "position, but not across positions — a quarterback scores far more than a tight " +
     "end without being more valuable to your team."},
  {t:"Value over replacement", ab:"VOR",
   d:"Projected points minus what a freely available player at the same position would " +
     "score. <em>This is the number that lets you compare a running back to a wide " +
     "receiver.</em> A 240-point RB is worth more than a 250-point WR if decent receivers " +
     "are easy to find later. Higher VOR means drafting him now gains you more than " +
     "waiting does; a negative number means he is roughly replacement-level."},
  {t:"Average draft position", ab:"ADP",
   d:"The average overall pick number where this player actually gets taken in real " +
     "drafts. <em>If his ADP is 20 and you pick at 30, expect him to be gone.</em> " +
     "Comparing ADP against consensus rank is how you spot bargains: a player ranked 25th " +
     "with an ADP of 45 is someone the room undervalues."},
  {t:"Expert consensus rank", ab:"ECR",
   d:"The same consensus number, shown on the My Pick tab so you can see how far a " +
     "recommendation reaches past straight rank order."},
  {t:"Tier",
   d:"A group of players the sources treat as roughly interchangeable. <em>The point of " +
     "tiers is knowing when to stop waiting.</em> If five players sit in the same tier you " +
     "can safely take a different position first; if only one is left, that is your cue to " +
     "grab him."},
  {t:"Split opinion",
   d:"Flagged when the best and worst ranking a player gets differ by 25 spots or more. " +
     "<em>The consensus number is hiding a real argument.</em> Worth ten seconds of " +
     "thought rather than drafting on autopilot."},
  {t:"Chance he lasts",
   d:"The odds this player is still on the board when your next turn comes around, based " +
     "on how consistently he goes near his ADP. <em>Under about 35% means take him now if " +
     "you want him.</em> Over 70% means you can address something else first."},
  {t:"PPR vs non-PPR",
   d:"PPR awards a point for every catch, which lifts pass-catching backs and slot " +
     "receivers. Non-PPR counts only yards and touchdowns, which pushes bruising running " +
     "backs up. <em>Check which one your league uses before you draft</em> — the switch at " +
     "the top reorders the entire board."},
  {t:"Bye week", ab:"bye",
   d:"The week this player's NFL team does not play, so he scores nothing. Not a reason " +
     "to avoid anyone, but stacking your whole starting lineup on one bye week is " +
     "avoidable pain."},
  {t:"FLEX",
   d:"A lineup slot you can fill with a running back, wide receiver or tight end — " +
     "whichever spare is projected highest that week."},
  {t:"Snake draft",
   d:"The pick order reverses every round. From slot 3 in a 12-team league you pick 3rd, " +
     "then 22nd, then 27th, and so on. <em>The gap between your picks is why timing " +
     "matters more than raw rank.</em>"},
  {t:"Auction value", ab:"auction $",
   d:"What this player would cost out of a $200 budget in an auction-format league. " +
     "Ignore it in a normal snake draft; it is a handy second opinion on how much better " +
     "one player is than another."},
  {t:"Position rank", ab:"RB1, WR3, QB5…",
   d:"Where he ranks among players at his own position. <em>RB1 is the best running back " +
     "still available</em>, not the first running back drafted overall."}
];

/* --------------------------------------------------------------------- state */
var S = {
  scoring: "PPR",
  slot: 6,
  rounds: 16,
  picks: [],          // [{key}] in draft order
  filter: "ALL",
  q: "",
  tab: "board",
  open: null
};
try { Object.assign(S, JSON.parse(localStorage.getItem(LS) || "{}")); } catch (e) {}
function save(){
  try {
    localStorage.setItem(LS, JSON.stringify({
      scoring:S.scoring, slot:S.slot, rounds:S.rounds, picks:S.picks }));
  } catch (e) {}
}

/* ------------------------------------------------------------------- helpers */
var byKey = {};
P.forEach(function(p){ byKey[p.key] = p; });

function sc(p){ return p.src[S.scoring] || {}; }
function rankOf(p){ var s = sc(p); return s.consensus || 9999; }
function displayName(p){
  return p.pos === "DST" ? (p.team || p.name.split(" ")[0]) + " D/ST" : p.name;
}
function pickLabel(n){                        // overall pick -> "3.05"
  var r = Math.floor((n-1)/TEAMS) + 1, i = (n-1) % TEAMS + 1;
  return r + "." + (i < 10 ? "0" + i : i);
}
function teamOnClock(n){
  var r = Math.floor((n-1)/TEAMS) + 1, i = (n-1) % TEAMS + 1;
  return r % 2 ? i : TEAMS - i + 1;            // snake
}
function currentPick(){ return S.picks.length + 1; }
function isMine(n){ return teamOnClock(n) === S.slot; }
function nextMyPick(from){
  var n = from, last = S.rounds * TEAMS;
  while (n <= last){ if (isMine(n)) return n; n++; }
  return null;
}
var taken = {};
function rebuildTaken(){ taken = {}; S.picks.forEach(function(x,i){ taken[x.key] = i+1; }); }
rebuildTaken();

function available(){
  return P.filter(function(p){ return !taken[p.key] && sc(p).consensus; })
          .sort(function(a,b){ return rankOf(a) - rankOf(b); });
}

function phi(z){                               // normal CDF
  var t = 1/(1+0.2316419*Math.abs(z));
  var d = 0.3989423*Math.exp(-z*z/2);
  var p = d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
  return z > 0 ? 1-p : p;
}
function survival(p, n){                       // P(still available at pick n)
  var s = sc(p);
  var adp = (s.ffc && s.ffc.adp) || (s.cbs && s.cbs.adp) ||
            (s.fftoolbox && s.fftoolbox.adp) || s.consensus;
  if (!adp) return 0.5;
  var sd = (s.ffc && s.ffc.sd) ? s.ffc.sd * 1.15 : Math.max(6, adp * 0.16);
  return 1 - phi((n - adp) / sd);
}

/* lineup model: 1QB / 2RB / 2WR / 1TE / 1FLEX / K / DST + bench */
var STARTERS = {QB:1, RB:2, WR:2, TE:1, K:1, DST:1};
var CAP      = {QB:2, RB:6, WR:6, TE:2, K:1, DST:1};

function myRoster(){
  var r = [];
  S.picks.forEach(function(x, i){
    if (teamOnClock(i+1) === S.slot) r.push(byKey[x.key]);
  });
  return r;
}
function posCount(roster){
  var c = {QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
  roster.forEach(function(p){ if (p) c[p.pos]++; });
  return c;
}
function needMult(pos, c, round){
  if (pos === "K" || pos === "DST") return round >= S.rounds - 1 ? 1.6 : 0.02;
  var have = c[pos] || 0, need = STARTERS[pos] || 0;
  if (have < need) return 1.22;
  if (pos === "RB" || pos === "WR"){
    if (have === need) return 1.06;            // flex candidate
    if (have >= CAP[pos]) return 0.45;
    return 0.92;
  }
  if (have >= (CAP[pos] || 1)) return 0.3;
  return 0.7;
}
function recommendations(limit){
  var pick = currentPick();
  var round = Math.floor((pick-1)/TEAMS) + 1;
  var nxt = nextMyPick(pick + 1);
  var c = posCount(myRoster());
  var pool = available().slice(0, 90);
  var maxV = 1;
  pool.forEach(function(p){ maxV = Math.max(maxV, sc(p).vor || 0); });
  var scored = pool.map(function(p){
    var s = sc(p);
    var vor = s.vor != null ? s.vor : 0;
    var base = (vor + 60) / (maxV + 60);
    var surv = nxt ? survival(p, nxt) : 0;
    var scarce = 0.72 + 0.28 * (1 - surv);
    return {p:p, score: base * needMult(p.pos, c, round) * scarce, surv:surv, vor:vor};
  });
  scored.sort(function(a,b){ return b.score - a.score; });
  return {list: scored.slice(0, limit || 6), nextPick: nxt, round: round, counts: c};
}
function tierLast(p){
  var s = sc(p);
  if (!s.tier) return false;
  return available().filter(function(o){
    return o.pos === p.pos && sc(o).tier === s.tier;
  }).length === 1;
}

/* ----------------------------------------------------------------- rendering */
function el(id){ return document.getElementById(id); }
function esc(x){
  return String(x == null ? "" : x).replace(/[&<>"]/g, function(m){
    return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[m]; });
}
function n0(x){ return x == null ? "–" : Math.round(x); }
function n1(x){ return x == null ? "–" : (Math.round(x*10)/10).toFixed(1); }

function renderHeader(){
  var pick = currentPick(), total = S.rounds * TEAMS;
  el("sub").textContent = "12-team snake · " + META.season + " · " + P.length +
    " players · updated " + META.generated;
  var c = el("clock");
  if (pick > total){
    c.className = "clock";
    c.innerHTML = '<div><div class="lbl">Draft complete</div><b>All ' + total +
      ' picks made</b></div>';
    return;
  }
  var mine = isMine(pick), nxt = mine ? pick : nextMyPick(pick);
  c.className = "clock" + (mine ? " me" : "");
  c.innerHTML =
    '<div><div class="lbl">On the clock</div><b>' + pickLabel(pick) +
      ' &middot; Team ' + teamOnClock(pick) + (mine ? " — YOU" : "") + '</b></div>' +
    '<div style="text-align:right"><div class="lbl">Your next</div><b>' +
      (nxt ? pickLabel(nxt) + (mine ? " (now)" : " · in " + (nxt-pick) + " picks") : "—") +
    '</b></div>';
}

function posBadge(p){
  var s = sc(p);
  return '<span class="pos ' + p.pos + '">' + p.pos +
         (s.posRank && p.pos !== "K" && p.pos !== "DST" ? s.posRank : "") + '</span>';
}

/* the pair of take-buttons that sits on every player row */
function takeButtons(k){
  return '<div class="take">' +
    '<button class="me" data-act="pickme" data-k="' + esc(k) + '" ' +
      'aria-label="I picked them" title="I picked them">Me</button>' +
    '<button data-act="pick" data-k="' + esc(k) + '" ' +
      'aria-label="Someone else picked them" title="Someone else picked them">Taken</button>' +
    '</div>';
}

function playerRow(p){
  var s = sc(p), bits = [esc(p.team || "FA")];
  if (p.bye) bits.push("bye " + n0(p.bye));
  if (s.tier) bits.push("tier " + s.tier);
  if (s.proj != null) bits.push("<em>" + n0(s.proj) + "</em> proj");
  if (s.vor != null)  bits.push("<em>" + n0(s.vor) + "</em> VOR");
  return '<div class="row" data-k="' + esc(p.key) + '">' +
    '<div class="rk">' + (s.consensus || "–") + '</div>' + posBadge(p) +
    '<div class="nm"><div class="n">' + esc(displayName(p)) + '</div>' +
      '<div class="m">' + bits.join(" · ") + '</div></div>' +
    takeButtons(p.key) + '</div>' +
    (S.open === p.key ? detailBlock(p) : "");
}

function detailBlock(p){
  var s = sc(p), o = p.src[S.scoring === "PPR" ? "STD" : "PPR"] || {};
  var rows = META.sources.map(function(src){
    var d = s[src.id] || {};
    return '<tr><td>' + esc(src.label) + '</td>' +
      '<td>' + (d.rank || "–") + '</td>' +
      '<td>' + (d.adp != null ? n1(d.adp) : "–") + '</td>' +
      '<td>' + (d.proj != null ? n0(d.proj) : "–") + '</td></tr>';
  }).join("");
  var tags = [];
  if (s._spread != null && s._spread >= 25)
    tags.push('<span class="tag warn">split opinion · ' + s._spread + '-spot gap</span>');
  if (s._n < META.sources.length)
    tags.push('<span class="tag">ranked by ' + s._n + '/' + META.sources.length +
              ' sources</span>');
  if (s.projEst) tags.push('<span class="tag">projection estimated from curve</span>');
  if (s.fftoolbox && s.fftoolbox.auction)
    tags.push('<span class="tag">auction $' + n0(s.fftoolbox.auction) + '</span>');
  if (s.ffc && s.ffc.n)
    tags.push('<span class="tag">' + n0(s.ffc.n) + ' mock drafts</span>');
  if (tierLast(p))
    tags.push('<span class="tag bad">last ' + p.pos + ' in tier ' + s.tier + '</span>');
  var nxt = nextMyPick(currentPick() + (isMine(currentPick()) ? 1 : 0));
  if (nxt){
    var sv = Math.round(survival(p, nxt) * 100);
    tags.push('<span class="tag ' + (sv < 35 ? "bad" : sv > 70 ? "good" : "warn") + '">' +
      sv + '% chance he lasts to ' + pickLabel(nxt) + '</span>');
  }
  if (o.consensus)
    tags.push('<span class="tag">' + (S.scoring === "PPR" ? "non-PPR" : "PPR") +
              ' consensus #' + o.consensus + '</span>');
  return '<div class="detail">' +
    '<table><thead><tr><th>Platform</th><th>Rank</th>' +
      '<th><u data-gloss="1">ADP</u></th><th><u data-gloss="1">Proj</u></th></tr></thead>' +
    '<tbody>' + rows +
    '<tr><td><b>Synthesis</b></td><td><b>' + (s.consensus || "–") + '</b></td>' +
      '<td>' + (s._avg != null ? n1(s._avg) : "–") + '</td>' +
      '<td><b>' + n0(s.proj) + '</b></td></tr></tbody></table>' +
    '<div class="tags">' + tags.join("") + '</div>' +
    '<div class="tags">' +
      '<button class="btn mine" data-act="pickme" data-k="' + esc(p.key) + '">' +
        'I picked them</button>' +
      '<button class="btn ghost" data-act="pick" data-k="' + esc(p.key) + '">' +
        'Someone else picked them</button>' +
      '<button class="btn ghost" data-gloss="1">What do these mean?</button>' +
    '</div></div>';
}

function viewBoard(){
  var list = available();
  if (S.filter !== "ALL") list = list.filter(function(p){ return p.pos === S.filter; });
  if (S.q){
    var q = S.q.toLowerCase();
    list = list.filter(function(p){
      return (p.name + " " + p.team + " " + p.pos).toLowerCase().indexOf(q) >= 0; });
  }
  var chips = ["ALL","QB","RB","WR","TE","K","DST"].map(function(f){
    return '<button data-filter="' + f + '" aria-pressed="' + (S.filter === f) + '">' +
      f + '</button>';
  }).join("");
  var body = list.length
    ? list.slice(0, 220).map(playerRow).join("")
    : '<div class="empty">No available players match that filter.</div>';
  return '<div class="chips">' + chips + '</div>' +
    '<div class="legend"><b>Me</b> = I picked them · <i>Taken</i> = someone else did ·' +
      ' <button class="btn ghost" data-gloss="1" ' +
      'style="min-height:26px;padding:3px 8px">What is PROJ / VOR?</button></div>' +
    '<div class="card">' + body + '</div>' +
    '<p class="note">Tap a player\'s name for the platform-by-platform breakdown.</p>';
}

function viewPick(){
  var pick = currentPick();
  if (pick > S.rounds * TEAMS)
    return '<div class="card"><div class="empty">Draft is complete.</div></div>';
  var r = recommendations(6), mine = isMine(pick);
  var head = mine
    ? "You are on the clock at " + pickLabel(pick)
    : "Pick " + pickLabel(pick) + " belongs to team " + teamOnClock(pick) +
      " — your next is " + (r.nextPick ? pickLabel(r.nextPick) : "—");
  var rows = r.list.map(function(x, i){
    var p = x.p, s = sc(p), why = [];
    if (s.vor != null) why.push("<em>" + n0(s.vor) + "</em> pts over replacement");
    if (x.surv < 0.35) why.push("unlikely to last (" + Math.round(x.surv*100) + "%)");
    else if (x.surv > 0.75) why.push("likely still there next turn");
    if (tierLast(p)) why.push("last of " + p.pos + " tier " + s.tier);
    if ((r.counts[p.pos] || 0) < (STARTERS[p.pos] || 0))
      why.push("fills a starting " + p.pos + " slot");
    return '<div class="row" data-k="' + esc(p.key) + '">' +
      '<div class="rk">' + (i+1) + '</div>' + posBadge(p) +
      '<div class="nm"><div class="n">' + esc(displayName(p)) + '</div>' +
        '<div class="m">' + why.join(" · ") + '</div></div>' +
      takeButtons(p.key) + '</div>' +
      (S.open === p.key ? detailBlock(p) : "");
  }).join("");
  var c = r.counts;
  var pills = ["QB","RB","WR","TE","K","DST"].map(function(pos){
    return '<span class="pill">' + pos + " " + (c[pos]||0) + "/" + (STARTERS[pos]||0) +
      "</span>";
  }).join("");
  return '<div class="card"><h2>' + esc(head) + '</h2>' + rows + '</div>' +
    '<div class="card"><h2>Roster needs</h2><div class="pillrow">' + pills + '</div>' +
    '<p class="note">Ranked by value over replacement, weighted by what your roster still ' +
      'needs and by how likely each player is to survive until ' +
      (r.nextPick ? pickLabel(r.nextPick) : "your next pick") + '. ' +
      '<a href="#" data-gloss="1">What do these terms mean?</a></p></div>';
}

function viewTeam(){
  var roster = myRoster().filter(Boolean);
  var order = {QB:0,RB:1,WR:2,TE:3,K:4,DST:5};
  var pool = roster.slice().sort(function(a,b){
    return (order[a.pos]-order[b.pos]) || (rankOf(a)-rankOf(b)); });
  var total = roster.reduce(function(t,p){ return t + (sc(p).proj || 0); }, 0);
  function take(pos){
    for (var i = 0; i < pool.length; i++)
      if (pool[i].pos === pos) return pool.splice(i,1)[0];
    return null;
  }
  var slots = [];
  [["QB","QB"],["RB","RB1"],["RB","RB2"],["WR","WR1"],["WR","WR2"],["TE","TE"]]
    .forEach(function(x){ slots.push([x[1], take(x[0])]); });
  slots.push(["FLEX", take("RB") || take("WR") || take("TE")]);
  slots.push(["K", take("K")]);
  slots.push(["DST", take("DST")]);
  pool.forEach(function(p, i){ slots.push(["BENCH " + (i+1), p]); });
  var starters = slots.slice(0,9).reduce(function(t,x){
    return t + (x[1] ? (sc(x[1]).proj || 0) : 0); }, 0);
  var cells = slots.map(function(x){
    return '<div class="slot' + (x[1] ? "" : " open") + '">' +
      '<div class="s">' + x[0] + '</div><div class="p">' +
      (x[1] ? esc(displayName(x[1])) +
        " <span style='color:var(--dim);font-weight:400'>" +
        (x[1].team || "") + " · " + n0(sc(x[1]).proj) + "</span>" : "open") +
      '</div></div>';
  }).join("");
  var log = S.picks.map(function(x, i){
    var p = byKey[x.key];
    return '<div class="row"><div class="rk">' + pickLabel(i+1) + '</div>' +
      (p ? posBadge(p) : "") +
      '<div class="nm"><div class="n">' + esc(p ? displayName(p) : x.key) + '</div>' +
      '<div class="m">team ' + teamOnClock(i+1) +
        (teamOnClock(i+1) === S.slot ? " — you" : "") + '</div></div></div>';
  }).reverse().join("");
  return '<div class="card"><h2>Your roster · ' + roster.length + ' picks</h2>' +
    '<div class="grid">' + cells + '</div>' +
    '<div class="pillrow"><span class="pill">Starters proj: <b>' + n0(starters) +
      '</b></span><span class="pill">Full roster proj: <b>' + n0(total) + '</b></span>' +
      '<span class="pill">' + S.scoring + '</span></div></div>' +
    '<div class="card"><h2>Draft log</h2>' +
      (log || '<div class="empty">No picks yet.</div>') + '</div>';
}

function viewSrc(){
  var blocks = META.sources.map(function(s){
    return '<div class="srcblk"><b>' + esc(s.label) + '</b><span class="k">' +
      esc(s.kind) + '</span><p>' + esc(s.note) + '<br><a href="' + esc(s.url) +
      '" target="_blank" rel="noopener">' + esc(s.url) + '</a></p></div>';
  }).join("");
  return '<div class="card"><h2>Platforms in the synthesis</h2>' + blocks + '</div>' +
  '<div class="card"><h2>How the synthesis works</h2>' +
    '<p class="note">Each platform is read separately for PPR and non-PPR. A player\'s ' +
    'position on each board is converted to a rank; a source that does not list him at ' +
    'all is charged a penalty rank rather than being ignored, so thinly-covered players ' +
    'do not float to the top. The average of those ranks is re-sorted to produce the ' +
    'consensus number in the left column, and the gap between a player\'s best and worst ' +
    'ranking is surfaced as "split opinion" when the sources disagree by 25 spots or ' +
    'more.</p>' +
    '<p class="note">Projections come from the Fulltime Fantasy season-point projections, ' +
    'restated for whichever scoring you have toggled. Players outside that board are ' +
    'estimated by interpolating their own position\'s rank-to-points curve and are ' +
    'flagged as estimated. VOR is projected points minus the last startable player at ' +
    'that position in a 12-team league (QB14, RB34, WR40, TE13), which is what makes an ' +
    'RB2 and a WR3 comparable. Kickers and defenses are ranked but deliberately carry no ' +
    'projection — the spread there is noise.</p>' +
    '<p class="note">"Chance he lasts" models each player\'s ADP as a normal distribution ' +
    'around its observed standard deviation, then asks how often he would still be on the ' +
    'board at your next turn. Tiers are cut where consensus rank gaps open up within a ' +
    'position. <a href="#" data-gloss="1">Plain-English glossary →</a></p></div>' +
  '<div class="card"><h2>Caveats</h2>' +
    '<p class="note">Rankings are a snapshot from ' + esc(META.generated) + ' and do not ' +
    'update themselves. Re-run <code>build_data.py</code> to refresh <code>data.js</code>. ' +
    'Injuries and depth-chart news after that date are not reflected. The board assumes a ' +
    'standard 1QB / 2RB / 2WR / 1TE / 1FLEX / K / DST lineup.</p></div>';
}

function render(){
  renderHeader();
  el("view").innerHTML =
      S.tab === "board" ? viewBoard()
    : S.tab === "pick"  ? viewPick()
    : S.tab === "team"  ? viewTeam()
    : viewSrc();
  ["board","pick","team","src"].forEach(function(t){
    var b = el("t" + t.charAt(0).toUpperCase() + t.slice(1));
    if (b) b.setAttribute("aria-pressed", String(S.tab === t));
  });
  el("scPPR").setAttribute("aria-pressed", String(S.scoring === "PPR"));
  el("scSTD").setAttribute("aria-pressed", String(S.scoring === "STD"));
}

/* --------------------------------------------------------------- glossary UI */
el("glossBody").innerHTML = GLOSSARY.map(function(g){
  return '<div class="gterm"><b>' + esc(g.t) + '</b>' +
    (g.ab ? '<span class="ab">' + esc(g.ab) + '</span>' : "") +
    '<p>' + g.d + '</p></div>';
}).join("");

function openGloss(){
  el("gloss").hidden = false;
  document.body.classList.add("locked");
  el("glossClose").focus();
}
function closeGloss(){
  el("gloss").hidden = true;
  document.body.classList.remove("locked");
}
el("help").onclick = openGloss;
el("glossClose").onclick = closeGloss;
el("gloss").addEventListener("click", function(e){
  if (e.target === el("gloss")) closeGloss();
});
document.addEventListener("keydown", function(e){
  if (e.key === "Escape" && !el("gloss").hidden) closeGloss();
});

/* ------------------------------------------------------------------- actions */
function draft(k, toMe){
  if (taken[k]) return;
  var pick = currentPick();
  if (pick > S.rounds * TEAMS) return;
  if (toMe && !isMine(pick)){
    // fast-forward the intervening teams so the player lands on your roster
    var target = nextMyPick(pick);
    if (!target) return;
    var pool = available().filter(function(p){ return p.key !== k; });
    var i = 0;
    while (currentPick() < target && i < pool.length){
      S.picks.push({key: pool[i].key});
      rebuildTaken();
      i++;
    }
  }
  S.picks.push({key: k});
  rebuildTaken();
  S.open = null;
  save();
  render();
}

document.addEventListener("click", function(e){
  if (!e.target || !e.target.closest) return;
  var g = e.target.closest("[data-gloss]");
  if (g){ e.preventDefault(); e.stopPropagation(); openGloss(); return; }
  var b = e.target.closest("[data-act]");
  if (b){
    e.stopPropagation();
    if (b.dataset.act === "pick")   draft(b.dataset.k, false);
    if (b.dataset.act === "pickme") draft(b.dataset.k, true);
    return;
  }
  var f = e.target.closest("[data-filter]");
  if (f){ S.filter = f.dataset.filter; render(); return; }
  var row = e.target.closest(".row[data-k]");
  if (row){ S.open = S.open === row.dataset.k ? null : row.dataset.k; render(); }
});

el("undo").onclick  = function(){ S.picks.pop(); rebuildTaken(); save(); render(); };
el("reset").onclick = function(){
  if (!S.picks.length || confirm("Clear all " + S.picks.length + " picks?")){
    S.picks = []; rebuildTaken(); save(); render();
  }
};
el("scPPR").onclick  = function(){ S.scoring = "PPR"; save(); render(); };
el("scSTD").onclick  = function(){ S.scoring = "STD"; save(); render(); };
el("tBoard").onclick = function(){ S.tab = "board"; render(); };
el("tPick").onclick  = function(){ S.tab = "pick";  render(); };
el("tTeam").onclick  = function(){ S.tab = "team";  render(); };
el("tSrc").onclick   = function(){ S.tab = "src";   render(); };

var qEl = el("q");
qEl.value = S.q || "";
qEl.oninput = function(){ S.q = qEl.value.trim(); if (S.tab === "board") render(); };

var slotSel = el("slot");
for (var i = 1; i <= TEAMS; i++){
  var o = document.createElement("option");
  o.value = i; o.textContent = "#" + i + " of 12";
  slotSel.appendChild(o);
}
slotSel.value = S.slot;
slotSel.onchange = function(){ S.slot = +slotSel.value; save(); render(); };

var rSel = el("rounds");
[13,14,15,16,17,18].forEach(function(r){
  var o = document.createElement("option");
  o.value = r; o.textContent = r; rSel.appendChild(o);
});
rSel.value = S.rounds;
rSel.onchange = function(){ S.rounds = +rSel.value; save(); render(); };

render();
})();
