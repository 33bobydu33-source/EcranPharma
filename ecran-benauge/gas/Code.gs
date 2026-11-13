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
/* Flux d'actualités officiels (RSS). Modifiable. Le premier qui répond avec des articles est utilisé en priorité. */
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
    .replace(/&quot;|&laquo;|&raquo;/g, '"').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
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
function actualites_() {
  var cache = CacheService.getScriptCache(), c = cache.get('news');
  if (c) return JSON.parse(c);
  var tous = [];
  FLUX.forEach(function (f) { try { tous = tous.concat(lireFlux_(f).slice(0, 4)); } catch (e) {} });
  tous.sort(function (a, b) { return b.t - a.t; });
  var res = { maj: Utilities.formatDate(new Date(), 'Europe/Paris', "d MMMM yyyy"), items: tous.slice(0, 4) };
  res.maj = res.maj.replace(/January/,'janvier').replace(/February/,'février').replace(/March/,'mars').replace(/April/,'avril').replace(/May/,'mai').replace(/June/,'juin')
    .replace(/July/,'juillet').replace(/August/,'août').replace(/September/,'septembre').replace(/October/,'octobre').replace(/November/,'novembre').replace(/December/,'décembre');
  if (res.items.length) cache.put('news', JSON.stringify(res), 3 * 3600);
  return res;
}
/* À lancer à la main pour vérifier quels flux répondent. */
function testerActualites() {
  FLUX.forEach(function (f) { try { Logger.log(f.nom + ' : ' + lireFlux_(f).length + ' article(s)'); } catch (e) { Logger.log(f.nom + ' : erreur ' + e); } });
  CacheService.getScriptCache().remove('news');
  Logger.log(JSON.stringify(actualites_(), null, 1));
}

function doGet(e) {
  var a = (e.parameter.action || 'list'), out;
  try {
    if (a === 'list') out = lister_();
    else if (a === 'file') out = fichier_(e.parameter.id);
    else if (a === 'promo') out = promo_(e.parameter.id);
    else if (a === 'news') out = actualites_();
    else out = { error: 'Action inconnue' };
  } catch (err) { out = { error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
