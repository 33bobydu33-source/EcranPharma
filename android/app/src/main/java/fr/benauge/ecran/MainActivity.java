package fr.benauge.ecran;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Coquille de l'écran : affiche le lecteur (player.html) en plein écran, garde les vidéos et les promos
 * dans la mémoire de la TV, et récupère toute seule les mises à jour du lecteur.
 *
 *   https://appassets.androidplatform.net/app/...    pages du lecteur (copie mise à jour, sinon celle de l'appli)
 *   https://appassets.androidplatform.net/media/...  vidéos et images téléchargées depuis Google Drive
 */
public class MainActivity extends Activity {
    private static final String HOST = "https://appassets.androidplatform.net";
    private static final String[] WEB_FILES = { "player.html", "store.js", "config.js" };

    private WebView web;
    private File mediaDir, webDir;
    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private final ExecutorService pool2 = Executors.newSingleThreadExecutor();
    private final AtomicBoolean syncing = new AtomicBoolean(false);
    private final Handler ui = new Handler(Looper.getMainLooper());
    private int backCount = 0;
    private long backTime = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        mediaDir = new File(getFilesDir(), "media");
        webDir = new File(getFilesDir(), "web");
        mediaDir.mkdirs();
        webDir.mkdirs();

        web = new WebView(this);
        web.setBackgroundColor(0xFF1D2A44);
        setContentView(web);
        hideBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/media/", new WebViewAssetLoader.InternalStoragePathHandler(this, mediaDir))
                .addPathHandler("/app/", new AppHandler())
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });
        web.addJavascriptInterface(new Shell(), "Shell");
        web.loadUrl(HOST + "/app/player.html");
        updateWeb();
    }

    /** Sert la copie mise à jour du lecteur si elle existe, sinon celle livrée dans l'appli. */
    private class AppHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(String path) {
            try {
                if (path.contains("..")) return null;
                File f = new File(webDir, path);
                InputStream in = f.isFile() && f.length() > 0 ? new FileInputStream(f) : getAssets().open(path);
                String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".html") ? "text/html"
                        : path.endsWith(".css") ? "text/css" : path.endsWith(".json") ? "application/json" : "application/octet-stream";
                return new WebResourceResponse(mime, "utf-8", in);
            } catch (Exception e) {
                return null;
            }
        }
    }

    /** Fonctions offertes à la page du lecteur. */
    private class Shell {
        @JavascriptInterface
        public boolean ready(String name) {
            if (name == null || name.contains("/") || name.contains("..")) return false;
            File f = new File(mediaDir, name);
            return f.isFile() && f.length() > 0;
        }

        /** Vrai si cette appli est bien l'écran d'accueil de la TV (sinon l'accueil Google a repris la main). */
        @JavascriptInterface
        public boolean isHome() {
            try {
                Intent i = new Intent(Intent.ACTION_MAIN);
                i.addCategory(Intent.CATEGORY_HOME);
                ResolveInfo r = getPackageManager().resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
                return r != null && r.activityInfo != null && getPackageName().equals(r.activityInfo.packageName);
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public int version() {
            return BuildConfig.VERSION_CODE;
        }

        /** Télécharge les fichiers manquants et supprime ceux qui ne servent plus. */
        @JavascriptInterface
        public void sync(final String json) {
            if (!syncing.compareAndSet(false, true)) return;
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        JSONObject o = new JSONObject(json);
                        String gas = o.optString("gas", "");
                        JSONArray items = o.optJSONArray("items");
                        if (gas.length() == 0 || items == null) return;
                        Set<String> keep = new HashSet<String>();
                        for (int i = 0; i < items.length(); i++) keep.add(items.getJSONObject(i).getString("file"));
                        File[] old = mediaDir.listFiles();
                        if (old != null && items.length() > 0) {
                            for (File f : old) if (!keep.contains(f.getName())) f.delete();
                        }
                        for (int i = 0; i < items.length(); i++) {
                            JSONObject it = items.getJSONObject(i);
                            String name = it.getString("file");
                            if (name.contains("/") || name.contains("..")) continue;
                            File target = new File(mediaDir, name);
                            if (target.isFile() && target.length() > 0) continue;
                            try {
                                String sep = gas.contains("?") ? "&" : "?";
                                String body = new String(download(gas + sep + "action=" + it.getString("action")
                                        + "&id=" + Uri.encode(it.getString("id"))), "UTF-8");
                                JSONObject r = new JSONObject(body);
                                String b64 = r.optString("b64", "");
                                if (b64.length() == 0) continue;
                                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                                File tmp = new File(mediaDir, name + ".part");
                                FileOutputStream out = new FileOutputStream(tmp);
                                out.write(data);
                                out.close();
                                tmp.renameTo(target);
                            } catch (Throwable e) {
                                // Fichier ignoré pour ce tour : il sera retenté au prochain passage.
                            }
                        }
                    } catch (Throwable ignored) {
                    } finally {
                        syncing.set(false);
                    }
                }
            });
        }
    }

    private static byte[] download(String address) throws Exception {
        String current = address;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(120000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new Exception("redirection vide");
                current = new URL(new URL(current), loc).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new Exception("HTTP " + code);
            }
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            c.disconnect();
            return out.toByteArray();
        }
        throw new Exception("trop de redirections");
    }

    /** Récupère la dernière version du lecteur publiée ; elle servira au prochain rechargement. */
    private void updateWeb() {
        final String base = BuildConfig.WEB_BASE;
        if (base == null || base.length() == 0) return;
        pool2.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[][] got = new byte[WEB_FILES.length][];
                    for (int i = 0; i < WEB_FILES.length; i++) {
                        got[i] = download(base + WEB_FILES[i] + "?t=" + System.currentTimeMillis());
                        if (got[i].length < 20) return;
                    }
                    if (!new String(got[0], "UTF-8").contains("LIAISON AVEC LA PAGE DE CONTR")) return;
                    for (int i = 0; i < WEB_FILES.length; i++) {
                        File tmp = new File(webDir, WEB_FILES[i] + ".part");
                        FileOutputStream out = new FileOutputStream(tmp);
                        out.write(got[i]);
                        out.close();
                        tmp.renameTo(new File(webDir, WEB_FILES[i]));
                    }
                } catch (Throwable ignored) { }
            }
        });
        ui.postDelayed(new Runnable() {
            @Override
            public void run() { updateWeb(); }
        }, 6 * 3600 * 1000L);
    }

    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideBars();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    /** Retour ne quitte pas l'écran. Cinq appuis rapides ouvrent les réglages Android (sortie de secours). */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            long now = System.currentTimeMillis();
            backCount = (now - backTime < 1500) ? backCount + 1 : 1;
            backTime = now;
            if (backCount >= 5) {
                backCount = 0;
                try { startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignored) { }
            }
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
            web.evaluateJavascript("try{togglePause()}catch(e){}", null);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_MEDIA_NEXT) {
            web.evaluateJavascript("try{advance()}catch(e){}", null);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_MEDIA_PREVIOUS) {
            web.evaluateJavascript("try{prev()}catch(e){}", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
