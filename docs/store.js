/* Stockage partagé entre l'écran (player.html) et la page de contrôle (admin.html).
   Firebase Realtime Database par son API web (REST + flux en direct), sans bibliothèque.
   Sans adresse de base (ou avec ?mock=1), tout reste dans le navigateur : pratique pour essayer. */
(function(){
  var Q = new URLSearchParams(location.search);
  var DB = ((window.EB_CONFIG && EB_CONFIG.dbUrl) || '').replace(/\/+$/,'');
  var MOCK = !DB || Q.get('mock')==='1';
  var EB = window.EB = { mock: MOCK, state: {}, _subs: [], _es: null };

  EB.DEFAULTS = {
    homeSeconds: 30, homeMode: 'alt', announce: true, announceSeconds: 8,
    videoRate: 0.8, order: 'manual', playMode: 'all', autoAdd: true,
    promoCount: 2, promoSeconds: 12, demoPromos: false,
    news: true, newsAuto: true, newsSeconds: 16, newsEvery: 3,
    bonusCount: 2, bonusKinds: { quiz:true, air:true, services:true, equipe:true, enfants:true, conseil:true }, garde: true, gardeFrom: '18:00',
    rappel: 'every', newsSource: 'site', rappelId: '', weatherMode: 'auto',
    hoursOn: '', hoursOff: '', gasUrl: '', name: 'Pharmacie de la Benauge'
  };
  EB.OPENING = { show:true, seconds:12, title:'Votre pharmacie vous accueille',
    lines:[ { days:'Du lundi au vendredi', hours:'8h30 – 19h30' }, { days:'Le samedi', hours:'8h30 – 13h00 et 14h00 – 19h30' } ],
    msgOn:false, msgTitle:'Information', msgText:'', msgUntil:'' };
  EB.opening = function(){ var o=Object.assign({}, EB.OPENING, EB.state.opening||{}); if (!Array.isArray(o.lines)) o.lines=EB.OPENING.lines; return o; };
  EB.newCode = function(n){ var a='abcdefghjkmnpqrstuvwxyz23456789', s=''; var r=new Uint32Array(n); crypto.getRandomValues(r); for (var i=0;i<n;i++) s+=a.charAt(r[i]%a.length); return s; };
  EB.code = function(){ return Q.get('code') || localStorage.getItem('eb_code') || ''; };
  EB.setCode = function(c){ localStorage.setItem('eb_code', c); };
  EB.titleFromName = function(name){
    var t=String(name||'').replace(/\.[a-z0-9]+$/i,'').replace(/^Pharmacie[-_ ]Benauge[-_ ]/i,'').replace(/^\d{4}-\d{2}-\d{2}[-_ ]/,'').replace(/[-_]+/g,' ').replace(/\s+\d+s$/i,'').trim();
    return t ? t.charAt(0).toUpperCase()+t.slice(1) : 'Vidéo';
  };

  function url(base, p){ return DB+'/'+base+(p?'/'+p:'')+'.json'; }
  function root(){ return 'ecrans/'+EB.code(); }
  function setAt(obj, path, val){
    var parts=path.split('/').filter(Boolean); if (!parts.length) return val;
    obj = (obj && typeof obj==='object') ? obj : {};
    var o=obj;
    for (var i=0;i<parts.length-1;i++){ if (!o[parts[i]] || typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; }
    if (val===null) delete o[parts[parts.length-1]]; else o[parts[parts.length-1]]=val;
    return obj;
  }
  function emit(){ EB._subs.forEach(function(f){ try{ f(EB.state); }catch(e){ console.error(e); } }); }

  /* --- mode essai : tout dans le navigateur --- */
  function mockKey(base){ return 'eb_mock:'+base; }
  function mockRead(base){ try{ return JSON.parse(localStorage.getItem(mockKey(base))||'null'); }catch(e){ return null; } }
  function mockWrite(base, v){ if (v===null) localStorage.removeItem(mockKey(base)); else localStorage.setItem(mockKey(base), JSON.stringify(v)); }

  function write(base, p, v, merge){
    if (MOCK){
      var cur=mockRead(base);
      if (merge){ var tgt=cur; (p||'').split('/').filter(Boolean).forEach(function(k){ tgt=(tgt||{})[k]; }); v=Object.assign({}, (tgt&&typeof tgt==='object')?tgt:{}, v); }
      cur=setAt(cur, p||'', v); mockWrite(base, cur);
      if (base===root()){ EB.state=cur||{}; emit(); }
      try{ EB._bc && EB._bc.postMessage(base); }catch(e){}
      return Promise.resolve();
    }
    return fetch(url(base,p), { method: merge?'PATCH':'PUT', body: JSON.stringify(v) }).then(function(r){ if(!r.ok) throw new Error('Écriture refusée ('+r.status+')'); });
  }
  EB.set   = function(p, v){ return write(root(), p, v, false); };
  EB.patch = function(p, v){ return write(root(), p, v, true); };
  EB.remove= function(p){ return write(root(), p, null, false); };
  EB.rawSet= function(base, v){ return write(base, '', v, false); };
  EB.rawGet= function(base){ if (MOCK) return Promise.resolve(mockRead(base)); return fetch(url(base,'')).then(function(r){ return r.json(); }); };

  /* Écoute en direct de tout l'écran courant. */
  EB.listen = function(cb){
    EB._subs.push(cb);
    if (EB._started) { cb(EB.state); return; }
    EB._started=true;
    if (MOCK){
      EB.state=mockRead(root())||{}; emit();
      try{ EB._bc=new BroadcastChannel('eb_mock'); EB._bc.onmessage=function(e){ if (e.data===root()){ EB.state=mockRead(root())||{}; emit(); } }; }catch(e){}
      addEventListener('storage', function(e){ if (e.key===mockKey(root())){ EB.state=mockRead(root())||{}; emit(); } });
      return;
    }
    function open(){
      var es=EB._es=new EventSource(url(root(),''));
      function on(ev){ var d; try{ d=JSON.parse(ev.data); }catch(e){ return; } if (!d) return;
        if (ev.type==='put') EB.state = setAt(EB.state, d.path, d.data) || {};
        else { var base=d.path.replace(/\/$/,''); Object.keys(d.data||{}).forEach(function(k){ EB.state=setAt(EB.state, base+'/'+k, d.data[k])||{}; }); }
        emit(); }
      es.addEventListener('put', on); es.addEventListener('patch', on);
      es.onerror=function(){ EB.online=false; };
      es.onopen=function(){ EB.online=true; };
    }
    open();
  };
  /* Écoute d'un chemin libre (association de l'écran). */
  EB.watch = function(base, cb){
    if (MOCK){ var t=setInterval(function(){ var v=mockRead(base); if (v) cb(v); }, 700); return function(){ clearInterval(t); }; }
    var es=new EventSource(url(base,'')); es.addEventListener('put', function(ev){ try{ var d=JSON.parse(ev.data); if (d && d.data) cb(d.data); }catch(e){} });
    return function(){ es.close(); };
  };
  EB.cfg = function(){ var c=Object.assign({}, EB.DEFAULTS, EB.state.config||{}); c.bonusKinds=Object.assign({}, EB.DEFAULTS.bonusKinds, (EB.state.config||{}).bonusKinds||{}); return c; };
  /* Appel du script Google Drive. */
  EB.gas = function(params){
    var g=EB.cfg().gasUrl; if (!g) return Promise.reject(new Error('Script Google Drive non renseigné'));
    var q=Object.keys(params).map(function(k){ return k+'='+encodeURIComponent(params[k]); }).join('&');
    return fetch(g+(g.indexOf('?')<0?'?':'&')+q, { redirect:'follow' }).then(function(r){ return r.json(); }).then(function(j){ if (j && j.error) throw new Error(j.error); return j; });
  };
})();
