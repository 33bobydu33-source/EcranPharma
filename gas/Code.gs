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
    var cat = texte_((h.match(/(Alertes sanitaires|[ÉE]v[èe]nements|Epid[ée]mies|Nouveaut[ée]s|Nature et sant[ée]|Recherche m[ée]dicale)/i) || [])[1]);
    // points clés : la première phrase sous chacun des intertitres de l'article
    var points = [], reh = /<h2[^>]*>[\s\S]*?<\/h2>\s*(?:<[^p][^>]*>\s*)*<p[^>]*>([\s\S]*?)<\/p>/gi, k;
    while ((k = reh.exec(h)) && points.length < 4) {
      var ph = texte_(k[1]).split(/(?<=[.!?])\s+/)[0];
      if (ph && ph.length > 30) points.push(couper_(ph, 150));
    }
    if (!points.length) points = desc.split(/(?<=[.!?])\s+/).filter(function (x) { return x.length > 25; }).slice(0, 3).map(function (x) { return couper_(x, 150); });
    out.push({ tag: cat || 'Votre pharmacie', titre: couper_(titre, 70), texte: couper_(desc || titre, 140), detail: points.length ? points : [couper_(desc || titre, 150)],
      source: 'Site de la pharmacie', image: attr_(h, 'og:image'), t: t });
  });
  return out;
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
