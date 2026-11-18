/**
 * Écran Pharmacie de la Benauge : lien avec Google Drive.
 *
 * 1. Lance une fois la fonction « installer » (menu Exécuter) : elle crée les dossiers
 *    « Ecran Pharmacie / Videos / Base » et « Ecran Pharmacie / Promos » dans ton Drive.
 * 2. Déployer > Nouveau déploiement > Application Web
 *    (Exécuter en tant que : moi ; Accès : tout le monde), puis copie l'adresse dans la page de contrôle.
 *
 * Dossiers :
 *   Videos/        vidéos du moment (.mp4). Claude ou toi pouvez les remplacer chaque mois.
 *   Videos/Base/   vidéos toujours diffusées (présentation, rappel des documents...).
 *   Promos/        publicités en PDF (1re page affichée) ou en image (PNG, JPG).
 */
var DOSSIER = 'Ecran Pharmacie';
/* Site de la pharmacie : ses actualités santé passent en premier. Vide = flux officiels seulement. */
var SITE = 'https://pharmacie-benauge.rocade.fr';
var SITE_JOURS = 60;   // les actualités plus anciennes ne sont pas reprises

var FLUX = [
  { nom: 'Santé publique France', url: 'https://www.santepubliquefrance.fr/rss/actualites.xml' },
  { nom: 'Ministère de la Santé', url: 'https://sante.gouv.fr/spip.php?page=backend' },
  { nom: 'ANSM', url: 'https://ansm.sante.fr/rss/actualites' }
];

function installer() {
  var racine = dossier_(DriveApp.getRootFolder(), DOSSIER, true);
  var videos = dossier_(racine, 'Videos', true);
  dossier_(videos, 'Base', true);
  dossier_(racine, 'Promos', true);
  Logger.log('Dossier prêt : ' + racine.getUrl());
}
function dossier_(parent, nom, creer) {
  var it = parent.getFoldersByName(nom);
  if (it.hasNext()) return it.next();
  return creer ? parent.createFolder(nom) : null;
}
function racine_() {
  var it = DriveApp.getFoldersByName(DOSSIER);
  if (!it.hasNext()) throw new Error('Dossier « ' + DOSSIER + ' » introuvable : lance la fonction installer.');
  return it.next();
}
function fichiers_(dossier, base, filtre) {
  var out = [], it = dossier.getFiles();
  while (it.hasNext()) {
    var f = it.next(), mime = f.getMimeType();
    if (!filtre(mime, f.getName())) continue;
    out.push({ id: f.getId(), name: f.getName(), size: f.getSize(), modified: f.getLastUpdated().getTime(), mime: mime, base: base });
  }
  return out;
}
function lister_() {
  var racine = racine_(), videos = dossier_(racine, 'Videos', true), promos = dossier_(racine, 'Promos', true);
  var estVideo = function (m, n) { return m.indexOf('video/') === 0 || /\.mp4$/i.test(n); };
  var estPromo = function (m, n) { return m === 'application/pdf' || m.indexOf('image/') === 0; };
  var v = fichiers_(videos, false, estVideo), b = dossier_(videos, 'Base', false);
  if (b) v = v.concat(fichiers_(b, true, estVideo));
  var p = fichiers_(promos, false, estPromo);
  var tri = function (a, c) { return a.name.localeCompare(c.name); };
  return { videos: v.sort(tri), promos: p.sort(tri), folder: racine.getUrl(), ts: Date.now() };
}
function autorise_(id) {
  var l = lister_(), tous = l.videos.concat(l.promos);
  for (var i = 0; i < tous.length; i++) if (tous[i].id === id) return tous[i];
  throw new Error('Fichier non autorisé');
}
function fichier_(id) {
  var meta = autorise_(id), blob = DriveApp.getFileById(id).getBlob();
  return { name: meta.name, mime: meta.mime, b64: Utilities.base64Encode(blob.getBytes()) };
}
/* PDF : première page convertie en image. Image : renvoyée telle quelle. */
function promo_(id) {
  var meta = autorise_(id);
  if (meta.mime !== 'application/pdf') return fichier_(id);
  var r = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + id + '&sz=w1920', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Aperçu du PDF indisponible (' + r.getResponseCode() + ')');
  var blob = r.getBlob();
  return { name: meta.name, mime: blob.getContentType() || 'image/png', b64: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- actualités ---------- */
function texte_(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;|&laquo;|&raquo;/g, '"').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,)])/g, '$1').replace(/\(\s+/g, '(').trim();
}
function couper_(s, n) { if (s.length <= n) return s; var c = s.slice(0, n), i = c.lastIndexOf(' '); return c.slice(0, i > 40 ? i : n).replace(/[ ,;:]+$/, '') + '…'; }
function lireFlux_(flux) {
  var r = UrlFetchApp.fetch(flux.url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return [];
  var doc = XmlService.parse(r.getContentText()), root = doc.getRootElement(), items = [], out = [];
  var ch = root.getChild('channel');
  if (ch) items = ch.getChildren('item');
  else { var ns = root.getNamespace(); items = root.getChildren('entry', ns); }
  for (var i = 0; i < items.length && out.length < 6; i++) {
    var it = items[i], ns2 = it.getNamespace();
    var titre = texte_(it.getChildText('title', ns2) || it.getChildText('title'));
    var desc = texte_(it.getChildText('description') || it.getChildText('summary', ns2) || it.getChildText('content', ns2));
    var date = it.getChildText('pubDate') || it.getChildText('updated', ns2) || it.getChildText('published', ns2) || '';
    if (!titre) continue;
    var phrases = desc.split(/(?<=[.!?])\s+/).filter(function (x) { return x.length > 25; }).slice(0, 4).map(function (x) { return couper_(x, 150); });
    out.push({ tag: flux.nom, titre: couper_(titre, 70), texte: couper_(desc || titre, 140), detail: phrases.length ? phrases : [couper_(desc || titre, 150)],
      source: flux.nom, t: date ? new Date(date).getTime() || 0 : 0 });
  }
  return out;
}
/* Actualités du site de la pharmacie : la liste, puis chaque article (titre, résumé, image, intertitres). */
function attr_(html, prop) {
  var m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)', 'i'))
       || html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i'));
  return m ? texte_(m[1]) : '';
}
function lireSite_() {
  if (!SITE) return [];
  var r = UrlFetchApp.fetch(SITE + '/actualites', { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return [];
  var html = r.getContentText(), vus = {}, liens = [], re = /href=["'](?:https?:\/\/[^"'\/]+)?\/actualites\/(\d+-[a-z0-9-]+)["']/gi, m;
  while ((m = re.exec(html)) && liens.length < 8) if (!vus[m[1]]) { vus[m[1]] = 1; liens.push(SITE + '/actualites/' + m[1]); }
  if (!liens.length) return [];
  var reps = UrlFetchApp.fetchAll(liens.map(function (u) { return { url: u, muteHttpExceptions: true, followRedirects: true }; }));
  var limite = Date.now() - SITE_JOURS * 864e5, out = [];
  reps.forEach(function (rp) {
    if (rp.getResponseCode() !== 200 || out.length >= 4) return;
    var h = rp.getContentText();
    var titre = attr_(h, 'og:title') || texte_((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
    var desc = attr_(h, 'og:description') || attr_(h, 'description');
    var d = h.match(/Publi[ée]+e? le\s*(\d{2})\/(\d{2})\/(\d{4})/i), t = d ? new Date(+d[3], +d[2] - 1, +d[1]).getTime() : 0;
    if (!titre || (t && t < limite)) return;
    var points = pointsCles_(h, desc);
    var MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    out.push({ tag: d ? (+d[1]) + ' ' + MOIS[+d[2] - 1] : 'Nouveau', titre: couper_(titre, 70), texte: couper_(desc || titre, 140), detail: points.length ? points : [couper_(desc || titre, 150)],
      source: 'Site de la pharmacie', image: attr_(h, 'og:image'), t: t });
  });
  return out;
}
/* Points clés d'un article : de vraies phrases courtes et utiles, jamais coupées.
   On préfère les listes à puces de l'article, puis les phrases avec un chiffre ou un conseil concret. */
var MOTS_UTILES = /(dépist|consult|médecin|pharmacien|prévention|prévenir|symptôme|signe|risque|conseil|vaccin|test|traitement|examen|appel|composez|gratuit|rembours|\d)/i;
var DEBUTS_FLOUS = /^(bien que|tout un chacun|en effet|ainsi|par ailleurs|de plus|cependant|néanmoins|il est|c'est|cette|ce mois|depuis|chaque année)/i;
function corps_(h) {
  var i = h.search(/<h1[\s>]/i); if (i > 0) h = h.slice(i);
  var j = h.search(/<footer[\s>]|>\s*Sources?\s*:?\s*</i); if (j > 0) h = h.slice(0, j);
  return h;
}
function pointsCles_(h, desc) {
  var b = corps_(h), cand = [], k, re;
  re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((k = re.exec(b))) { var t = texte_(k[1]); if (t.length >= 25 && t.length <= 130 && !/^(accueil|actualit|conseil|nos |mon compte)/i.test(t)) cand.push({ t: t.replace(/[;:,]$/, '') + (/[.!?]$/.test(t) ? '' : '.'), s: 3 }); }
  re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((k = re.exec(b))) texte_(k[1]).split(/(?<=[.!?])\s+/).forEach(function (t) {
    if (t.length < 40 || t.length > 130) return;
    var sc = (/\d/.test(t) ? 2 : 0) + (MOTS_UTILES.test(t) ? 1 : 0) - (DEBUTS_FLOUS.test(t) ? 2 : 0);
    cand.push({ t: t, s: sc });
  });
  var vus = {}, ordre = 0;
  cand = cand.filter(function (c) { var key = c.t.toLowerCase().slice(0, 40); if (vus[key]) return false; vus[key] = 1; c.o = ordre++; return c.s >= 0; });
  var choix = cand.slice().sort(function (a, c) { return c.s - a.s || a.o - c.o; }).slice(0, 3).sort(function (a, c) { return a.o - c.o; }).map(function (c) { return c.t; });
  if (choix.length < 2) choix = choix.concat(String(desc || '').split(/(?<=[.!?])\s+/).filter(function (x) { return x.length > 30 && x.length <= 130; })).slice(0, 3);
  return choix;
}
/* Conseil du mois du site : le lien /conseils/... mis en avant sur la page d'accueil, sinon le premier de /conseils. */
function lireArticle_(u) {
  var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return null;
  var h = r.getContentText(), titre = attr_(h, 'og:title') || texte_((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  if (!titre) return null;
  var desc = attr_(h, 'og:description') || attr_(h, 'description'), points = pointsCles_(h, desc);
  return { titre: couper_(titre.replace(/\s*-\s*Pharmacie de la Benauge.*$/i, ''), 90), texte: couper_(desc || titre, 160), detail: points, source: 'Site de la pharmacie' };
}
function conseil_() {
  if (!SITE) return null;
  var lien = function (url) {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return '';
    var m = r.getContentText().match(/href=["'](?:https?:\/\/[^"'\/]+)?\/conseils\/(\d+-[a-z0-9-]+)["']/i);
    return m ? SITE + '/conseils/' + m[1] : '';
  };
  var u = '';
  try { u = lien(SITE + '/'); } catch (e) {}
  if (!u) { try { u = lien(SITE + '/conseils'); } catch (e) {} }
  return u ? lireArticle_(u) : null;
}
function actualites_(src) {
  src = (src === 'officiel' || !SITE) ? 'officiel' : 'site';
  var cache = CacheService.getScriptCache(), cle = 'news_' + src, c = cache.get(cle);
  if (c) return JSON.parse(c);
  var tous = [];
  if (src === 'site') { try { tous = lireSite_(); } catch (e) {} }
  if (tous.length < 4) {   // complété par les flux officiels s'il n'y a pas assez d'actualités récentes sur le site
    var off = [];
    FLUX.forEach(function (f) { try { off = off.concat(lireFlux_(f).slice(0, 4)); } catch (e) {} });
    off.sort(function (a, b) { return b.t - a.t; });
    tous = tous.concat(off.slice(0, 4 - tous.length));
  }
  var res = { maj: Utilities.formatDate(new Date(), 'Europe/Paris', "d MMMM yyyy"), items: tous.slice(0, 4) };
  if (src === 'site') { try { res.conseil = conseil_(); } catch (e) {} }
  res.maj = res.maj.replace(/January/,'janvier').replace(/February/,'février').replace(/March/,'mars').replace(/April/,'avril').replace(/May/,'mai').replace(/June/,'juin')
    .replace(/July/,'juillet').replace(/August/,'août').replace(/September/,'septembre').replace(/October/,'octobre').replace(/November/,'novembre').replace(/December/,'décembre');
  if (res.items.length) cache.put(cle, JSON.stringify(res), 3 * 3600);
  return res;
}
/* À lancer à la main pour vérifier quels flux répondent. */
function testerActualites() {
  FLUX.forEach(function (f) { try { Logger.log(f.nom + ' : ' + lireFlux_(f).length + ' article(s)'); } catch (e) { Logger.log(f.nom + ' : erreur ' + e); } });
  try { Logger.log('Site de la pharmacie : ' + lireSite_().length + ' actualité(s) récente(s)'); } catch (e) { Logger.log('Site de la pharmacie : erreur ' + e); }
  CacheService.getScriptCache().removeAll(['news_site', 'news_officiel']);
  try { Logger.log('Conseil du mois : ' + JSON.stringify(conseil_())); } catch (e) { Logger.log('Conseil du mois : erreur ' + e); }
  Logger.log(JSON.stringify(actualites_('site'), null, 1));
}

function doGet(e) {
  var a = (e.parameter.action || 'list'), out;
  try {
    if (a === 'list') out = lister_();
    else if (a === 'file') out = fichier_(e.parameter.id);
    else if (a === 'promo') out = promo_(e.parameter.id);
    else if (a === 'news') out = actualites_(e.parameter.src);
    else out = { error: 'Action inconnue' };
  } catch (err) { out = { error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
