# Écran Benauge : mise en route

Trois morceaux travaillent ensemble :

- **L'appli TV** (`android/`) : affiche le lecteur en plein écran, garde les vidéos dans la TV, démarre toute seule.
- **La page de contrôle** (`docs/admin.html`) : sur ton téléphone ou ton PC, pour tout régler.
- **Le script Google Drive** (`gas/Code.gs`) : donne à l'écran l'accès à tes vidéos et à tes promos.

Les réglages vivent dans Firebase : un changement sur le téléphone arrive sur la TV en quelques secondes.

Compte une heure pour la première installation. Fais les étapes dans l'ordre.

## 1. Firebase (10 min)

1. Sur console.firebase.google.com, crée un projet (ou réutilise un projet existant).
2. Menu **Realtime Database** > Créer une base > région Europe.
3. Onglet **Règles** : remplace tout par le contenu de `firebase/database.rules.json`, puis Publier.
4. Copie l'adresse de la base (elle ressemble à `https://xxxx-default-rtdb.europe-west1.firebasedatabase.app`).
5. Colle-la dans `docs/config.js`, entre les guillemets de `dbUrl`.

## 2. Google Drive (10 min)

1. Sur script.google.com, crée un projet et colle le contenu de `gas/Code.gs`.
2. Lance une fois la fonction **installer** et accepte les autorisations. Elle crée dans ton Drive :
   - `Ecran Pharmacie/Videos` : les vidéos du moment ;
   - `Ecran Pharmacie/Videos/Base` : les vidéos toujours diffusées ;
   - `Ecran Pharmacie/Promos` : les publicités en PDF ou en image.
3. **Déployer > Nouveau déploiement > Application Web** : exécuter en tant que *moi*, accès *tout le monde*. Copie l'adresse qui finit par `/exec`.
4. Dépose tes vidéos et tes PDF dans les dossiers. Une vidéo dont le nom contient « Rappel » devient la vidéo de rappel.
5. Lance **testerActualites** pour voir quels flux d'actualités répondent. La liste `FLUX` en haut du script se modifie.

## 3. GitHub (15 min)

1. Crée un dépôt **public** sur github.com et envoie-y tout ce dossier (bouton « uploading an existing file », ou GitHub Desktop).
2. **Settings > Pages** : Source « Deploy from a branch », branche `main`, dossier `/docs`.
   La page de contrôle sera à `https://TON-COMPTE.github.io/NOM-DU-DEPOT/`.
3. Onglet **Actions** : la fabrication de l'appli démarre toute seule. Quand elle est verte, récupère `EcranBenauge.apk` dans **Releases**.

Chaque modification envoyée sur GitHub refabrique l'appli et met à jour la page de contrôle. La TV récupère seule la nouvelle version du lecteur, sans réinstallation.

## 4. Page de contrôle (5 min)

1. Ouvre `https://TON-COMPTE.github.io/NOM-DU-DEPOT/` sur ton téléphone.
2. **Créer mon écran**. Garde le lien d'accès (onglet Réglages) : c'est la clé de toute l'équipe.
3. Onglet **Réglages** : colle l'adresse du script Google Drive, puis **Tester**.
4. Ajoute la page à l'écran d'accueil du téléphone pour la retrouver.

## 5. La TV (20 min)

1. Sur la TV : active le mode développeur et le débogage (les étapes s'affichent quand tu lances le kit).
2. Sur ton PC : mets `EcranBenauge.apk` dans le dossier `kit/`, puis lance `installer.bat`.
   Il faut `adb` : c'est le dossier `platform-tools` de Google, à placer dans `kit/`.
3. La TV affiche un **code à 6 caractères**. Sur le téléphone : onglet En direct > **Associer un écran**.
4. Les vidéos se téléchargent dans la TV (quelques minutes la première fois), puis la boucle démarre.
5. Réponds « o » à la question sur l'écran d'accueil pour que l'appli se lance à chaque allumage. `restaurer.bat` annule.
   Le kit coupe aussi les pubs et le mode démo TCL. Il vérifie que la télé accepte bien le nouvel accueil et remet tout
   en place tout seul si elle le refuse. Laisse le fichier `tv.sh` à côté de `installer.bat`.
6. Si la page de contrôle affiche « La télé ne démarre plus sur l'écran Benauge », l'accueil Google est revenu
   (souvent après une mise à jour de la télé) : relance `installer.bat` et réponds « o ».

Sortie de secours sur la TV : cinq appuis rapides sur Retour ouvrent les paramètres Android.

## Au quotidien

| Je veux… | Où |
|---|---|
| Ajouter ou retirer une vidéo ou une promo | Google Drive, dans les dossiers |
| Choisir les vidéos, leur ordre, leur titre | Onglet Vidéos |
| Garder une vidéo en permanence | Dossier `Videos/Base`, ou rôle « Base » |
| Régler le nombre de promos, les durées, la vitesse | Onglets Promos, Vidéos, Écrans |
| Mettre une date de fin à une promo | Onglet Promos |
| Montrer un produit (PDF) juste après une vidéo | Onglet Vidéos : cocher « Afficher une pub produit après cette vidéo » et choisir le PDF du dossier `Promos` |
| Changer les noms, avatars ou photos de l'équipe | Onglet Équipe |
| Mettre en pause, passer, lancer une vidéo | Onglet En direct |
| Éteindre l'écran le soir | Onglet Écrans > Horaires |
| Écrire un message rapide (fermeture…) | Onglet En direct > Message spécial |
| Changer les horaires affichés | Onglet Écrans > Horaires de la pharmacie |

L'écran relit Google Drive toutes les 10 minutes. « Relire Google Drive » le fait tout de suite.

## Essayer sans rien installer

Ouvre `docs/admin.html` puis `docs/player.html?bar=1` dans le même navigateur, depuis un petit serveur local
(`python -m http.server` dans le dossier `docs`). Sans adresse Firebase, tout reste dans le navigateur.
