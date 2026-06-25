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
  var editing=false, showHist=false, pickingMood=false;
  var calMonth = firstOfMonth(new Date());

  function takenDates(){ var a=[]; for(var k in days){ if(days[k]) a.push(k); } a.sort(); return a; }

  // ---------- shared state as one JSON blob (single-writer, like the behavior tracker) ----------
  var LS_KEY = APP_KEY;
  function serialize(){
    var dd={}; for(var k in days){ if(days[k]) dd[k]=days[k]; }
    return { rewardName:meta.rewardName, goal:meta.goal, startDate:meta.startDate, days:dd, takenDates:takenDates() };
  }
  function applyState(obj){
    if(!obj || typeof obj!=="object") return;
    if(typeof obj.rewardName==="string") meta.rewardName=obj.rewardName;
    if(obj.goal) meta.goal=obj.goal;
    if(obj.startDate) meta.startDate=obj.startDate;
    if(obj.days && typeof obj.days==="object" && Object.prototype.toString.call(obj.days)!=="[object Array]"){
      days={}; for(var k in obj.days){ if(obj.days[k]) days[k]=obj.days[k]; }
    } else if(Object.prototype.toString.call(obj.takenDates)==="[object Array]"){
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
  function moodCounts(){
    var well=0, sick=0, other=0;
    for(var k in days){ if(!days[k]) continue;
      if(days[k]==="well") well++; else if(days[k]==="sick") sick++; else other++; }
    return {well:well, sick:sick, other:other};
  }

  function moodColor(status){ return status==="well"?"#6BD49A":status==="sick"?"#F2766B":"#FFD66B"; }
  function starSVG(size,color){
    var lit=!!color;
    var glow = color==="#6BD49A" ? "rgba(107,212,154,.9)" : color==="#F2766B" ? "rgba(242,118,107,.9)" : "rgba(255,214,107,.9)";
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="'+(lit?color:"transparent")+
      '" stroke="'+(lit?"none":"rgba(232,230,245,0.16)")+'" stroke-width="1.25" style="'+
      (lit?"filter:drop-shadow(0 0 5px "+glow+")":"")+'">'+
      '<polygon points="12,2 15,9 22,9.3 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.3 9,9"/></svg>';
  }
  function escapeHtml(s){ return (s||"").replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  function wellnessHTML(){
    var c=moodCounts(), total=c.well+c.sick+c.other;
    var otherCell = c.other
      ? '<div class="statDivider"></div><div class="statCell"><div class="statNum" style="color:#FFD66B">'+c.other+'</div><div class="statLbl">unmarked</div></div>'
      : '';
    var bar = total
      ? '<div class="moodBar">'+
        '<span style="width:'+(c.well/total*100)+'%;background:#4FBF85"></span>'+
        '<span style="width:'+(c.sick/total*100)+'%;background:#E8584C"></span>'+
        '<span style="width:'+(c.other/total*100)+'%;background:rgba(255,214,107,.6)"></span></div>'
      : '<p class="insight muted" style="margin:0">No days marked yet.</p>';
    return '<div class="panel"><p class="panelTitle">Sick &amp; well days</p>'+
      '<div class="stats" style="margin-top:0">'+
      '<div class="statCell"><div class="statNum" style="color:#6BD49A">'+c.well+'</div><div class="statLbl">well days</div></div>'+
      '<div class="statDivider"></div>'+
      '<div class="statCell"><div class="statNum" style="color:#F2766B">'+c.sick+'</div><div class="statLbl">sick days</div></div>'+
      otherCell+'</div>'+bar+'</div>';
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
      var k=toKey(c), st=days[k], earned=!!st, future=(c>today), before=(c<start), isToday=(k===todayKey());
      var earnCls = st==="well"?" well":st==="sick"?" sick":" earned";
      var cls="cal-cell"+(earned?earnCls:(future?" out":(before?" pre":" missed")))+(isToday?" today":"");
      var tap=(!READONLY && !future) ? 'data-k="'+k+'" role="button" tabindex="0"' : '';
      cells+='<div class="'+cls+'" '+tap+'><span class="cal-num">'+day+'</span>'+(earned?starSVG(11,moodColor(st)):'')+'</div>';
    }
    var help=READONLY ? '' : '<p class="footer" style="margin-top:12px">Tap a day to cycle: well, then sick, then clear.</p>';
    return '<div class="panel"><div class="calHead">'+
      '<button class="calNav" id="calPrev" '+(canPrev?'':'disabled')+' aria-label="Previous month">&lsaquo;</button>'+
      '<span class="calMonth">'+monthLabel+'</span>'+
      '<button class="calNav" id="calNext" '+(canNext?'':'disabled')+' aria-label="Next month">&rsaquo;</button>'+
      '</div><div class="calGrid">'+dows+cells+'</div>'+help+'</div>';
  }

  // ---------- mutations (edit mode only) ----------
  function setMood(k, status){ if(READONLY) return;
    days[k]=status;
    if(meta.startDate && k<meta.startDate){ meta.startDate=k; }
    pickingMood=false; pushState(); render(); }
  function cycleDay(k){ if(READONLY) return;
    var cur=days[k];
    if(!cur){ days[k]="well"; if(meta.startDate && k<meta.startDate) meta.startDate=k; }
    else if(cur==="well"){ days[k]="sick"; }
    else { delete days[k]; }
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
      return '<span class="star'+(lit?' lit':'')+'" style="left:'+s.left+'%;top:'+s.top+'%;animation-delay:'+s.delay+'s">'+starSVG(s.size,lit?'#FFD66B':null)+'</span>';
    }).join("");

    var rewardLine = meta.rewardName
      ? 'Working toward <strong>'+escapeHtml(meta.rewardName)+'</strong>'
      : (READONLY ? '<span class="muted">Working toward a reward</span>'
                  : '<span class="muted">Tap the pencil to name your reward</span>');

    var center = complete
      ? '<div class="completeBig">Reward unlocked</div>'+(meta.rewardName?'<div class="completeReward">'+escapeHtml(meta.rewardName)+'</div>':'')
      : '<div class="countNum">'+earned+'<span> / '+goal+'</span></div><div class="countLabel">stars earned</div>';

    var todayStatus = days[todayKey()];
    var moodLabel = todayStatus==="well" ? "felt well" : todayStatus==="sick" ? "felt sick" : "";
    var action;
    if(READONLY){
      if(doneToday){
        action = '<div class="doneState"><span style="color:'+moodColor(todayStatus)+'">&#9733;</span> Today&rsquo;s star is earned'+(moodLabel?' &mdash; '+moodLabel:'')+'</div>';
      } else {
        action = '<div class="doneState pending">&#9734; No star earned yet today</div>';
      }
    } else if(complete){
      action = '<button class="act" id="reset">&#8635; Start a new chart</button>';
    } else if(pickingMood){
      action = '<div class="moodPrompt">'+(doneToday?'Update today&rsquo;s star &mdash; how did he feel?':'Earn today&rsquo;s star &mdash; how did he feel?')+'</div>'+
        '<div class="row"><button class="act well" id="moodWell">&#9733; Felt well</button>'+
        '<button class="act sick" id="moodSick">&#9733; Felt sick</button></div>'+
        '<button class="disclosure" id="moodCancel" style="margin-top:8px">Cancel</button>';
    } else if(doneToday){
      action = '<button class="doneState" id="changeToday" style="width:100%;cursor:pointer">'+
        '<span style="color:'+moodColor(todayStatus)+'">&#9733;</span> Today: '+(moodLabel||'earned')+' &mdash; tap to change</button>';
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
      (showHist ? wellnessHTML()+calendarHTML() : '')+
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
    on("mark", function(){ pickingMood=true; render(); });
    on("changeToday", function(){ pickingMood=true; render(); });
    on("moodWell", function(){ setMood(todayKey(),"well"); });
    on("moodSick", function(){ setMood(todayKey(),"sick"); });
    on("moodCancel", function(){ pickingMood=false; render(); });
    on("reset", resetChart);
    on("saveSet", saveSettings);
    on("cancelSet", function(){ editing=false; render(); });
    var cells=document.querySelectorAll("[data-k]");
    for(var i=0;i<cells.length;i++){ (function(el){
      el.addEventListener("click", function(){ cycleDay(el.getAttribute("data-k")); });
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
