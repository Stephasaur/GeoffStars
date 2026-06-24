(function(){
  "use strict";

  // ---------- mode ----------
  var READONLY = (window.STAR_MODE === "view");

  // ---------- Gun sync config ----------
  // Public relays where devices meet to swap data. If your behavior tracker
  // uses a specific relay that works well, replace this list with that one.
  var PEERS = [
    "https://relay.peer.ooo/gun",
    "https://shogun-relay.scobrudot.dev/gun",
    "https://gun.o8.is/gun"
  ];
  // The shared name for THIS chart's data. Must be identical on index.html and
  // view.html. Keep it private-ish; anyone who knows it can read the stars.
  var APP_KEY = "starchart-geoff-7f3a9c2e-v1";

  var gun=null, root=null;
  try{
    if(typeof Gun === "function"){ gun = Gun(PEERS); root = gun.get(APP_KEY); }
  }catch(e){ /* offline / Gun unavailable: app still runs locally */ }

  // ---------- local state (mirror of Gun data) ----------
  var days = {};                                   // "2026-06-24" -> true
  var meta = { rewardName:"", goal:60, startDate:null };
  var editing=false, showHist=false;
  var calMonth = firstOfMonth(new Date());

  function takenDates(){ var a=[]; for(var k in days){ if(days[k]) a.push(k); } a.sort(); return a; }

  // ---------- shared state as one JSON blob (single-writer, like the behavior tracker) ----------
  var LS_KEY = APP_KEY;
  function serialize(){ return { rewardName:meta.rewardName, goal:meta.goal, startDate:meta.startDate, takenDates:takenDates() }; }
  function applyState(obj){
    if(!obj || typeof obj!=="object") return;
    if(typeof obj.rewardName==="string") meta.rewardName=obj.rewardName;
    if(obj.goal) meta.goal=obj.goal;
    if(obj.startDate) meta.startDate=obj.startDate;
    if(Object.prototype.toString.call(obj.takenDates)==="[object Array]"){
      days={}; obj.takenDates.forEach(function(k){ days[k]=true; });
    }
  }
  function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(serialize())); }catch(e){} }
  function loadLocal(){ try{ var r=localStorage.getItem(LS_KEY); if(r) applyState(JSON.parse(r)); }catch(e){} }
  function pushState(){ saveLocal(); if(root){ try{ root.get("state").put(JSON.stringify(serialize())); }catch(e){} } }

  // ---------- date helpers ----------
  function pad(n){ return String(n).padStart(2,"0"); }
  function toKey(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  function todayKey(){ return toKey(new Date()); }
  function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function parseKey(k){ var p=k.split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
  function startOfToday(){ var t=new Date(); t.setHours(0,0,0,0); return t; }
  function firstOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }

  // ---------- star layout (even jittered grid, avoids count text) ----------
  function mulberry32(a){ return function(){ a|=0; a=(a+0x6d2b79f5)|0; var t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
  function starField(goal){
    var rand=mulberry32(1337+goal);
    var x0=6, x1=94, y0=8, y1=93, kx0=24, kx1=76, ky0=66, ky1=100;
    function inKeepOut(x,y){ return x>=kx0 && x<=kx1 && y>=ky0 && y<=ky1; }
    var cols=Math.ceil(Math.sqrt(goal*1.7)), rows=Math.ceil(goal/cols)+1, cells=[];
    for(var tries=0; tries<10; tries++){
      cells=[]; var cw=(x1-x0)/cols, ch=(y1-y0)/rows;
      for(var r=0;r<rows;r++){ for(var c=0;c<cols;c++){
        var cx=x0+(c+0.5)*cw, cy=y0+(r+0.5)*ch;
        if(inKeepOut(cx,cy)) continue;
        cells.push({cx:cx,cy:cy,cw:cw,ch:ch});
      }}
      if(cells.length>=goal) break;
      cols++; rows++;
    }
    for(var i=cells.length-1;i>0;i--){ var j=Math.floor(rand()*(i+1)); var t=cells[i]; cells[i]=cells[j]; cells[j]=t; }
    var arr=[];
    for(var n=0;n<goal && n<cells.length;n++){
      var cell=cells[n];
      var left=cell.cx+(rand()-0.5)*cell.cw*0.7;
      var top=cell.cy+(rand()-0.5)*cell.ch*0.7;
      if(inKeepOut(left,top)) top=ky0-3;
      arr.push({left:left, top:top, size:7+rand()*8, delay:rand()*4});
    }
    return arr;
  }

  function streak(){
    var c=0, cur=new Date();
    if(!days[toKey(cur)]) cur=addDays(cur,-1);
    while(days[toKey(cur)]){ c++; cur=addDays(cur,-1); }
    return c;
  }
  function weekdayStats(){
    var start=meta.startDate?parseKey(meta.startDate):startOfToday(); start.setHours(0,0,0,0);
    var today=startOfToday(), tot=[0,0,0,0,0,0,0], earned=[0,0,0,0,0,0,0];
    for(var d=new Date(start); d<=today; d=addDays(d,1)){
      var wd=d.getDay(); tot[wd]++; if(days[toKey(d)]) earned[wd]++;
    }
    return {tot:tot, earned:earned};
  }

  function starSVG(size,lit){
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="'+(lit?'#FFD66B':'transparent')+
      '" stroke="'+(lit?'none':'rgba(232,230,245,0.16)')+'" stroke-width="1.25" style="'+
      (lit?'filter:drop-shadow(0 0 5px rgba(255,214,107,.9))':'')+'">'+
      '<polygon points="12,2 15,9 22,9.3 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.3 9,9"/></svg>';
  }
  function escapeHtml(s){ return (s||"").replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  function patternsHTML(){
    var ws=weekdayStats(), order=[1,2,3,4,5,6,0];
    var labels={0:"Sun",1:"Mon",2:"Tue",3:"Wed",4:"Thu",5:"Fri",6:"Sat"};
    var full={0:"Sundays",1:"Mondays",2:"Tuesdays",3:"Wednesdays",4:"Thursdays",5:"Fridays",6:"Saturdays"};
    var totalTracked=0; ws.tot.forEach(function(n){ totalTracked+=n; });
    var worst=-1, worstRate=2;
    order.forEach(function(wd){ if(ws.tot[wd]>=2){ var rate=ws.earned[wd]/ws.tot[wd];
      if(rate<worstRate){ worstRate=rate; worst=wd; } } });
    var insight;
    if(totalTracked<7){ insight='<p class="insight muted">Patterns appear after about a week of tracking.</p>'; }
    else if(worst===-1 || worstRate>=1){ insight='<p class="insight">No gaps yet &mdash; every tracked day has a star. Nice.</p>'; }
    else { var missed=ws.tot[worst]-ws.earned[worst];
      insight='<p class="insight">'+(READONLY?'They miss ':'You miss ')+'<strong>'+full[worst]+'</strong> most &mdash; '+missed+' missed of '+ws.tot[worst]+' so far.</p>'; }
    var bars=order.map(function(wd){
      var t=ws.tot[wd], e=ws.earned[wd], rate=t?e/t:0, pct=Math.round(rate*100);
      var low=(wd===worst && totalTracked>=7 && worstRate<1);
      return '<div class="wkRow"><span class="wkLbl">'+labels[wd]+'</span>'+
        '<span class="wkTrack"><span class="wkFill'+(low?' low':'')+'" style="width:'+pct+'%"></span></span>'+
        '<span class="wkCount">'+e+'/'+t+'</span></div>';
    }).join("");
    return '<div class="panel"><p class="panelTitle">Patterns by weekday</p>'+insight+bars+'</div>';
  }

  function calendarHTML(){
    var start=meta.startDate?parseKey(meta.startDate):startOfToday(); start.setHours(0,0,0,0);
    var today=startOfToday(), y=calMonth.getFullYear(), m=calMonth.getMonth();
    var monthLabel=calMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"});
    var lead=(new Date(y,m,1).getDay()+6)%7, daysInMonth=new Date(y,m+1,0).getDate();
    var canPrev=firstOfMonth(calMonth)>firstOfMonth(start), canNext=firstOfMonth(calMonth)<firstOfMonth(today);
    var dows=["Mo","Tu","We","Th","Fr","Sa","Su"].map(function(d){ return '<div class="calDow">'+d+'</div>'; }).join("");
    var cells="";
    for(var i=0;i<lead;i++) cells+='<div class="cal-cell empty"></div>';
    for(var day=1;day<=daysInMonth;day++){
      var c=new Date(y,m,day); c.setHours(0,0,0,0);
      var k=toKey(c), earned=!!days[k], future=(c>today), before=(c<start), isToday=(k===todayKey());
      var cls="cal-cell"+(earned?" earned":(future?" out":(before?" pre":" missed")))+(isToday?" today":"");
      var tap=(!READONLY && !future) ? 'data-k="'+k+'" role="button" tabindex="0"' : '';
      cells+='<div class="'+cls+'" '+tap+'><span class="cal-num">'+day+'</span>'+(earned?starSVG(11,true):'')+'</div>';
    }
    var help=READONLY ? '' : '<p class="footer" style="margin-top:12px">Tap any day to add or remove its star.</p>';
    return '<div class="panel"><div class="calHead">'+
      '<button class="calNav" id="calPrev" '+(canPrev?'':'disabled')+' aria-label="Previous month">&lsaquo;</button>'+
      '<span class="calMonth">'+monthLabel+'</span>'+
      '<button class="calNav" id="calNext" '+(canNext?'':'disabled')+' aria-label="Next month">&rsaquo;</button>'+
      '</div><div class="calGrid">'+dows+cells+'</div>'+help+'</div>';
  }

  // ---------- mutations (edit mode only) ----------
  function markToday(){ if(READONLY) return; days[todayKey()]=true; pushState(); render(); }
  function toggleDay(k){ if(READONLY) return;
    if(days[k]){ delete days[k]; }
    else { days[k]=true; if(meta.startDate && k<meta.startDate){ meta.startDate=k; } }
    pushState(); render(); }
  function saveSettings(){
    var rn=document.getElementById("rwd").value.trim();
    var g=Math.max(1, Math.min(365, parseInt(document.getElementById("gl").value,10)||60));
    meta.rewardName=rn; meta.goal=g; editing=false; pushState(); render();
  }
  function resetChart(){
    if(!confirm("Start a new chart? This clears all earned stars and history.")) return;
    days={}; meta.startDate=todayKey(); pushState(); render();
  }

  // ---------- render ----------
  function render(){
    var earned=takenDates().length, goal=meta.goal||60, complete=earned>=goal;
    var remaining=Math.max(0, goal-earned), doneToday=!!days[todayKey()], field=starField(goal);

    var starsHTML=field.map(function(s,i){ var lit=i<earned;
      return '<span class="star'+(lit?' lit':'')+'" style="left:'+s.left+'%;top:'+s.top+'%;animation-delay:'+s.delay+'s">'+starSVG(s.size,lit)+'</span>';
    }).join("");

    var rewardLine = meta.rewardName
      ? 'Working toward <strong>'+escapeHtml(meta.rewardName)+'</strong>'
      : (READONLY ? '<span class="muted">Working toward a reward</span>'
                  : '<span class="muted">Tap the pencil to name your reward</span>');

    var center = complete
      ? '<div class="completeBig">Reward unlocked</div>'+(meta.rewardName?'<div class="completeReward">'+escapeHtml(meta.rewardName)+'</div>':'')
      : '<div class="countNum">'+earned+'<span> / '+goal+'</span></div><div class="countLabel">stars earned</div>';

    var action;
    if(READONLY){
      action = doneToday
        ? '<div class="doneState">&#9733; Today&rsquo;s star is earned</div>'
        : '<div class="doneState pending">&#9734; No star earned yet today</div>';
    } else if(complete){
      action = '<button class="act" id="reset">&#8635; Start a new chart</button>';
    } else if(doneToday){
      action = '<div class="doneState">&#10003; Today&rsquo;s star is earned &mdash; see you tomorrow</div>';
    } else {
      action = '<button class="act" id="mark">&#9733; Earn today&rsquo;s star</button>';
    }

    var headerBtn = READONLY ? '' : '<button class="iconBtn" id="edit" aria-label="Edit reward and goal">&#9998;</button>';
    var kicker = READONLY ? 'Live progress' : 'Daily medication';

    var editBlock;
    if(!READONLY && editing){
      editBlock = '<div class="editCard"><label class="fieldLabel">Reward at the end</label>'+
        '<input id="rwd" value="'+escapeHtml(meta.rewardName)+'" placeholder="e.g. a trip to the zoo">'+
        '<label class="fieldLabel">Stars needed</label>'+
        '<input id="gl" value="'+goal+'" inputmode="numeric">'+
        '<div class="row"><button class="act" id="saveSet" style="padding:12px">Save</button>'+
        '<button class="iconBtn" id="cancelSet" style="width:auto;padding:0 16px">Cancel</button></div></div>';
    } else {
      editBlock = '<div class="goalLine">&#10024; <span>'+rewardLine+'</span></div>';
    }

    document.getElementById("shell").innerHTML =
      '<div class="headerRow"><div><div class="kicker">'+kicker+'</div><h1>Star Chart</h1></div>'+headerBtn+'</div>'+
      editBlock+
      '<div class="sky'+(complete?' complete':'')+'"><div class="neb neb1"></div><div class="neb neb2"></div>'+
      starsHTML+(complete?'<div class="moon"></div>':'')+'<div class="countWrap">'+center+'</div></div>'+
      action+
      '<div class="stats"><div class="statCell"><div class="statNum">'+streak()+'</div><div class="statLbl">day streak</div></div>'+
      '<div class="statDivider"></div>'+
      '<div class="statCell"><div class="statNum">'+remaining+'</div><div class="statLbl">'+(remaining===1?'star to go':'stars to go')+'</div></div></div>'+
      '<button class="disclosure" id="histToggle">History &amp; patterns '+(showHist?'&#9650;':'&#9660;')+'</button>'+
      (showHist ? patternsHTML()+calendarHTML() : '')+
      '<div class="footer">'+(READONLY?'Live view &mdash; updates as new stars are earned.':'Synced across your devices. Add to your home screen to use it like an app.')+'</div>';

    document.getElementById("shell").className = "shell" + (READONLY ? "" : " editable");
    wire();
  }

  function wire(){
    function on(id,fn){ var el=document.getElementById(id); if(el) el.addEventListener("click",fn); }
    on("histToggle", function(){ showHist=!showHist; render(); });
    on("calPrev", function(){ calMonth=new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1); render(); });
    on("calNext", function(){ calMonth=new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1); render(); });
    if(READONLY) return;
    on("edit", function(){ editing=!editing; render(); });
    on("mark", markToday);
    on("reset", resetChart);
    on("saveSet", saveSettings);
    on("cancelSet", function(){ editing=false; render(); });
    var cells=document.querySelectorAll("[data-k]");
    for(var i=0;i<cells.length;i++){ (function(el){
      el.addEventListener("click", function(){ toggleDay(el.getAttribute("data-k")); });
    })(cells[i]); }
  }

  // ---------- live sync wiring ----------
  loadLocal();                 // instant paint from last-known data, works offline
  if(root){
    root.get("state").on(function(data){
      if(!data) return;
      try{ applyState(JSON.parse(data)); }catch(e){ return; }
      saveLocal(); render();
    });
    if(!READONLY){
      setTimeout(function(){
        if(!meta.startDate){ meta.startDate=todayKey(); pushState(); render(); }
      }, 1500);
    }
  }

  // first paint (shows immediately; live data fills in as it arrives)
  render();

  // surface unexpected errors instead of a blank screen
  window.addEventListener("error", function(e){
    var s=document.getElementById("shell");
    if(s){ s.innerHTML='<div style="color:#ffb3bc;font-size:13px;line-height:1.5;padding:16px;'+
      'background:rgba(255,120,140,.08);border:1px solid rgba(255,120,140,.3);border-radius:12px;'+
      'white-space:pre-wrap">Something went wrong:\n\n'+(e.message||e)+'\n'+(e.filename||'')+' line '+(e.lineno||'?')+'</div>'; }
  });
})();
