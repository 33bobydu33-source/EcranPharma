package fr.benauge.ecran;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Relance l'écran au démarrage de la TV (en plus du rôle d'écran d'accueil). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            Intent i = new Intent(context, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
        } catch (Exception ignored) { }
    }
}
