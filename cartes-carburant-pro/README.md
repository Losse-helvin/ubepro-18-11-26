# UBEPRO : cartes carburant professionnelles

Landing page d’acquisition en marque blanche. **Le dossier est prêt à être hébergé ; la collecte réelle est fermée tant que le `formId` de campagne n’a pas été fourni.** La page ne commande pas de carte. Aucun projet antérieur n’a été modifié.

## Héberger la page

Publier `index.html`, `style.css`, `config.js`, `script.js`, `img/` et `assets/` dans le même répertoire sur un serveur HTTPS. Pas de build, de CDN, de jQuery ni de compte Webflow. Les URL d’assets relatives permettent aussi un déploiement en sous-répertoire. `tests/` et ce guide sont destinés à l’intégrateur, pas à la publication.

Aperçu depuis la racine du dépôt :

```sh
python3 -m http.server 8000 --bind 0.0.0.0 --directory cartes-carburant-pro
```

## Ce qu’il faut obtenir avant d’ouvrir la campagne

| Élément | Action de l’intégrateur |
| --- | --- |
| Identifiant de formulaire | Faire enregistrer cette LP dans HelloLead, puis renseigner son identifiant **exact** dans `config.js` → `formId`. Un ID HTML, un widget Typeform et un identifiant d’une autre campagne ne sont pas des substituts. |
| Routage | Faire confirmer le destinataire, le code `categorie` éventuel et le mapping des trois questions ci-dessous. Aucun code n’est déduit de l’URL. Le `400` des formulaires TYP ne s’applique pas à cette LP. |
| Transport avec accusé de réception | Faire autoriser **l’origine HTTPS finale** sur l’endpoint HelloLead du dépôt (`leadApiUrl`). Le serveur doit accepter le prévol `OPTIONS`, `POST` et `Content-Type: application/json`, puis répondre en CORS avec un HTTP 2xx et un JSON `{"status":"ok"}` pour un lead effectivement pris en charge. Si un relais serveur est nécessaire, utiliser uniquement une URL approuvée répondant à ce contrat. Aucun secret dans `config.js`. |
| Mesure facultative | Faire confirmer le groupe et le conteneur GTM de cette campagne. `gtmContainerId` vide = aucun tag Google. Contrôler les déclencheurs du conteneur, la CMP et les textes de consentement avec l’équipe acquisition/DPO. Ne pas activer de balise publicitaire avec le seul accord de mesure d’audience. |
| Information des prospects | Les liens légaux sont les pages UbePro déjà utilisées dans le dépôt. Faire valider leur applicabilité au domaine publié, le responsable de traitement, le destinataire, les finalités, la conservation, les droits et le contact DPO. Faire valider le nom de présentation et les conditions de l’offre. |
| Recette partenaire | En préproduction, vérifier un lead autorisé de bout en bout : réception dans la bonne campagne, coordonnées et réponses correctement mappées, preuve d’accord, dédoublonnage sur `id`, refus sans conversion. Confirmer si la campagne impose une vérification SMS ou une seconde destination. |

### Formulaire et contrat

- **Étape 1, dans le hero :** taille du parc, activité, priorité facultative. Tous les CTA d’étude pointent vers le même `#demande` ; il n’y a qu’un `#lead-form` pour toutes les tailles d’écran. L’action depuis un profil métier présélectionne l’activité ; le retour conserve les choix.
- **Étape 2 :** prénom, nom, entreprise, code postal français, e-mail professionnel et téléphone. Les erreurs sont associées aux champs et le focus rejoint le premier champ à corriger. Deux choix distincts, non précochés : accord de transmission obligatoire et attribution facultative.
- **Sans configuration :** première étape explorable, message d’indisponibilité avant la saisie des coordonnées, champs personnels et envoi désactivés. Sans JavaScript les champs restent désactivés ; pas de soumission de secours en GET.
- **Avec configuration :** reprise du contrat `payload: { formId, id, data }` du mode CORS de `lead-handler.js`. Les champs CRM sont `prenom`, `nom`, `societe`, `code_postal`, `mail`, `telephone`, `telephone_verifie` (`non`), `consentement` (`oui`), `coordonnee`, `source`, `categorie`, les paires `question_1/reponse_1` (flotte), `question_2/reponse_2` (activité), `question_3/reponse_3` (priorité) et le récapitulatif `autre_info_fj`. Le téléphone est normalisé à dix chiffres ; la LP ne prétend pas l’avoir authentifié par SMS.
- **Réception :** un seul envoi à la fois ; identifiant conservé en mémoire pour une nouvelle tentative. Seul le JSON positif du CRM déclenche la confirmation. Rejet métier, erreur HTTP, corps illisible, coupure réseau ou délai de 15 s : pas de succès ni de conversion ; les réponses restent dans le formulaire. Un honeypot rempli bloque la demande. Aucun `sendBeacon`, succès opaque en `no-cors`, stockage local de leads, redirection temporisée ni duplication dans le Google Sheet d’une autre LP.
- **Attribution :** uniquement avec l’accord facultatif, lecture des paramètres connus `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`, `utm_category`, `ltm_source`, `ltm_category`, `ltm_typ` (query ou fragment). Si un lien interne a remplacé le fragment par `#demande` par exemple, la fonction utilise le fragment d’arrivée fourni par le navigateur, sans stockage supplémentaire. `source` privilégie `ltm_source` puis `utm_source`. Pas d’URL brute ni d’identifiant de clic transmis. Les catégories de campagne restent distinctes du routage CRM.
- **Conversion :** si l’accord de mesure est donné **et** le conteneur approuvé est renseigné, chargement de GTM après l’accusé de réception et un seul `formulaire_lead` avec `form_id`, `lead_source`, `categorie`. Pas de nom, e-mail ou téléphone dans le `dataLayer`. Consent Mode : stockage analytique accordé, signaux publicitaires refusés. Aucun tag, cookie ou stockage de session de cette LP au chargement.

## Audit préalable et choix de conception

**Base analysée :** `d06ead5` ; inventaire récursif des 3 553 fichiers, 131 répertoires de premier niveau, 359 répertoires au total. Le dépôt contient 181 fichiers HTML (160 comportent un formulaire), 176 CSS, 376 JS, 175 répertoires `img/` et trois polices WOFF2. Il mêle campagnes indépendantes, variantes, formulaires embarqués (`formulaires-audi/`, `formulaires-typ/`), arborescence `fuso/`, remerciements, pages légales, modèles, e-mails et tests. Pas de système de build partagé.

| Référence interne | Ce qui a guidé cette LP |
| --- | --- |
| `vehicules-de-societe/`, `formulaires-typ/formulaire-vehicules/` | Qualification du véhicule avant les coordonnées, CTA courts, réponses structurées pour le CRM. La nouvelle LP réduit le parcours à deux étapes, sans recopier les chiffres, identifiants ou témoignages. |
| `agv_amr/` | Direction artistique B2B dédiée, police locale, progression lisible, erreurs proches des champs, FAQ et navigation responsive. Reprise de DM Sans, sans ses composants de campagne ni ses tags. |
| `ecomobility-geolocalisation/`, `assurance-tns-pro/`, `ticket-restaurant/` | Demandes orientées métier et CTA proches du besoin. Les exports s’appuient souvent sur Webflow, jQuery, Formly, des breakpoints autour de 991/767/479 px et de nombreuses ressources de marque. Ici : HTML sémantique, CSS et JS natifs, ressources locales et deux compositions photographiques selon l’écran. |
| `lead-handler.js`, `verification-sms.js`, `docs/gtm-mapping.md` et `.csv` | 99 handlers dédiés, 97 modules SMS, enveloppe HelloLead, variantes Sheets et plusieurs groupes GTM, dont un sans balisage. Les autorisations et identifiants ne sont pas interchangeables. Seule la branche de transport vérifiable est adaptée à l’exigence de confirmation. |
| `thank-you/index.html` | Un ancien onglet carburant embarque un questionnaire Typeform : il ne constitue ni un identifiant CRM approuvé pour cette campagne, ni une justification pour reprendre ses promesses de prix. |

### Références marché (note interne, non affichée sur la LP)

- **DKV Mobility** : partir du problème des avances et des reçus ; expliquer la facturation, la lecture des transactions et la demande adaptée au parc. Les détails de réseau, de plafonds et de services sont propres aux formules. [1](https://www.dkv-mobility.com/fr/fr/fuelling/fuel-card/fuel-cards-overview) [3](https://www.dkv-mobility.com/fr/fr/fuelling/fuel-card/carte-essence)
- **TotalEnergies Fleet** : distinguer les usages et la taille du parc avant le parcours commercial. Le formulaire distingue le besoin, l’entreprise et le contact ; une simple étude ne nécessite pas de reprendre tous les champs de souscription. [2](https://services.totalenergies.fr/professionnels/conseils/gestion-flotte/avantages-carte-carburant-criteres-choix) [4](https://services.totalenergies.fr/professionnels/gestion-flotte/formulaire/contact-mobility)
- **Ticket Fleet Pro** : guidage par nombre de véhicules, énergie et besoin, avec un réseau à apprécier en fonction des déplacements. Retenir cette logique de choix, pas les économies chiffrées ni l’identité visuelle. [2](https://www.edenred.fr/ticket-fleet-pro)

**Textes :** relecture complète des titres, sous-titres, CTA, descriptions, profils et FAQ. Aucun tiret cadratin, double tiret ou trait décoratif ne sert de séparateur ; les numéros d’index, pastilles et barres ornementales des surtitres ont été retirés au profit du seul libellé de section. Les phrases restent courtes et concrètes, sans superlatif ni promesse chiffrée.

**Parcours :** « Votre carburant, sous contrôle. » ouvre sur une demande d’étude, pas sur une souscription. Les avantages, profils métier, étapes du parcours et FAQ restent accessibles après le hero. Aucune promesse de remise, de délai de rappel ou de couverture de réseau chiffrée.

**Identité :** `img/ubepro.png` est la copie à l’identique de `assurance-tns-pro/img/674fff79418f54ebd2611b02_Ubepro-2-bleu.png` (923 × 235 px). Le header et le pied de page utilisent le fichier original, sans filtre ni déformation. La page conserve ses couleurs bleu nuit et orange, ses photographies d’illustration locales en WebP et DM Sans avec sa licence OFL.

**Composition du hero :**

- À partir de 960 px, la grille réserve la gauche à l’accroche, le centre au véhicule et le haut du bloc de droite au formulaire. L’illustration de la carte déborde uniquement sur l’angle libre du panneau, jamais sur un champ. Le panneau grandit avec les erreurs, les coordonnées ou la confirmation ; pas de hauteur fixe ni de défilement interne.
- De 681 à 959 px, l’utilitaire a une rangée sous l’accroche, à côté du formulaire. Jusqu’à 680 px, l’ordre est accroche, photo, formulaire ; le CTA permet de rejoindre directement les champs sous le header fixe. Le `<picture>` sélectionne le cadrage mobile jusqu’à 959 px.
- La carte est décorative : puce, rainures, tranche et la seule inscription générique « carte carburant pro », sans logo, sans marque et sans promesse. Son pivot est à 88 % du bord supérieur, avec un aller de 5,8 s et un retour de même durée. L’inclinaison reste fixe avec `prefers-reduced-motion: reduce`.
- Le panneau de demande est légèrement translucide (`rgba(250, 250, 246, .88)` et flou d’arrière-plan) alors que les champs, les choix et les boutons restent opaques : le texte garde son contraste. La largeur du panneau et celle de la carte ont été augmentées d’environ 6 % aux trois paliers d’écran.

## Recette

`tests/recette.cjs` est un test de développement, pas une dépendance du site. Avec un serveur statique local lancé comme ci-dessus, un Chrome/Chromium disponible et Node récent :

```sh
QA_DEPS=$(mktemp -d)
npm install --prefix "$QA_DEPS" --no-audit --no-fund puppeteer-core@24.2.0
NODE_PATH="$QA_DEPS/node_modules" CHROME_BIN=/chemin/vers/chromium \
  node cartes-carburant-pro/tests/recette.cjs
```

`LP_URL` permet de viser un sous-répertoire **sur loopback uniquement**. Le test utilise une configuration éphémère, intercepte tous les POST et bloque les ressources tierces : il ne contacte ni le CRM ni un conteneur GTM réel. `QA_NO_SANDBOX=1` est réservé aux environnements de test isolés qui l’exigent.

**Vérifications effectuées sur la version UBEPRO :**

- Géométrie sur 15 largeurs de 320 à 2 560 px : un seul formulaire dans le hero, carte dans le cadre, contrôles non recouverts, absence de débordement horizontal aux deux étapes, y compris avec les erreurs affichées. Vérification visuelle de la place de l’utilitaire sur ordinateur, tablette et téléphone ; contrôle de la rotation normale et du mode sans animation.
- CTA du hero et du header, fermeture du menu mobile, ancres sous le header, accès clavier, onglets métier, présélection, FAQ, aller et retour entre les étapes. Sans JavaScript ou sans configuration, pas d’envoi de secours.
- Validations, consentement obligatoire, honeypot, refus HTTP/JSON/métier, réseau indisponible, expiration et nouvelle tentative sans doublon. Vérification du POST, confirmation uniquement sur accusé positif, attribution après un clic sur le CTA et conversion uniquement avec l’accord facultatif. Aucun envoi au CRM réel.

**Accessibilité et poids :** axe-core 4.10.3 dans Chromium sur les vues flotte, coordonnées et erreurs à 320, 390, 768, 820 et 1 440 px : aucune violation automatique relevée sur ces états. Ce contrôle ne vaut pas certification. Mesure locale à froid, cache désactivé : environ 358 Kio à 1 440 px et 292 Kio à 390/820 px, avec un seul cadrage de la photo téléchargé par écran. Les trois illustrations de la section avantages restent en chargement différé. Mesurer les temps réseau sur le domaine final.
