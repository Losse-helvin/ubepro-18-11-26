# UBEPRO : cartes carburant professionnelles

Landing page d’acquisition en marque blanche. **La collecte est branchée : CRM HelloLead, Google Sheet et suivi d’URL, sans Google Tag Manager.** La page ne commande pas de carte. Aucun projet antérieur n’a été modifié.

## Héberger la page

Publier `index.html`, `style.css`, `config.js`, `script.js`, `img/` et `assets/` dans le même répertoire sur un serveur HTTPS. Pas de build, de CDN, de jQuery ni de compte Webflow. Les URL d’assets relatives permettent aussi un déploiement en sous-répertoire. `tests/` et ce guide sont destinés à l’intégrateur, pas à la publication.

Aperçu depuis la racine du dépôt :

```sh
python3 -m http.server 8000 --bind 0.0.0.0 --directory cartes-carburant-pro
```

## Ce qu’il faut obtenir avant d’ouvrir la campagne

| Élément | Action de l’intégrateur |
| --- | --- |
| Identifiant de formulaire | `config.js` → `formId` vaut `c24877692384950o` (format maison : `c` + 14 chiffres + `o`). **À faire enregistrer dans HelloLead** avant d’ouvrir la campagne : tant qu’il n’existe pas côté CRM, les leads arrivent dans la feuille mais pas dans la bonne campagne. |
| Routage | Faire confirmer le destinataire, le code `categorie` éventuel et le mapping des trois questions ci-dessous. Aucun code n’est déduit de l’URL. Le `400` des formulaires TYP ne s’applique pas à cette LP. |
| Envoi au CRM | L’endpoint HelloLead du dépôt (`leadApiUrl`) est utilisé en mode `nocors` : aucun prévol CORS n’est nécessaire. Vérifier en préproduction qu’il accepte bien un `POST` `text/plain` contenant l’enveloppe JSON (c’est ce que font déjà les autres LP). Aucun secret dans `config.js`. |
| Accusé de réception | L’accusé lisible vient du Google Sheet (`{"status":"ok"}`). Le CRM en `nocors` ne renvoie aucune réponse exploitable. Si vous exigez un accusé du CRM lui-même, passer `leadApiMode` à `cors` et faire autoriser l’origine HTTPS finale (prévol `OPTIONS`, `Content-Type: application/json`, JSON `status:"ok"`). |
| Google Sheet | Le script Apps Script partagé du dépôt est déjà renseigné (`config.js` → `googleScriptUrl`). Faire confirmer que l’onglet de cette campagne doit recevoir `form_id = c24877692384950o`, ou fournir une URL dédiée. Le script doit répondre en CORS avec `{"status":"ok"}`. |
| Vérification SMS | `smsApiUrl` pointe sur l’API HelloLead / SMS Partner déjà utilisée par les 97 autres pages du dépôt (`envoi_code_verification.php`). Faire confirmer que la campagne autorise l’envoi de SMS depuis le domaine publié, et le quota. `smsCooldown` vaut 120 s. |
| Aucun GTM | **Pas de Google Tag Manager, pas de `dataLayer`, pas de balise Google.** `gtmContainerId` a été supprimé du code, de la recette et de la configuration. Ne pas le réintroduire sans décision explicite. |
| Information des prospects | Les liens légaux sont les pages UbePro déjà utilisées dans le dépôt. Faire valider leur applicabilité au domaine publié, le responsable de traitement, le destinataire, les finalités, la conservation, les droits et le contact DPO. Faire valider le nom de présentation et les conditions de l’offre. |
| Recette partenaire | En préproduction, vérifier un lead autorisé de bout en bout : réception dans la bonne campagne, coordonnées et réponses correctement mappées, preuve d’accord, dédoublonnage sur `id`, refus sans conversion. Confirmer si la campagne impose une vérification SMS ou une seconde destination. |

### Formulaire et contrat

- **Étape 1, dans le hero :** taille du parc, activité, priorité facultative. Tous les CTA d’étude pointent vers le même `#demande` ; il n’y a qu’un `#lead-form` pour toutes les tailles d’écran. L’action depuis un profil métier présélectionne l’activité ; le retour conserve les choix.
- **Étape 2 :** prénom, nom, entreprise, code postal français, e-mail professionnel et téléphone. Les erreurs sont associées aux champs et le focus rejoint le premier champ à corriger. La case d’accord de transmission reste obligatoire et non précochée.
- **Sans configuration :** première étape explorable, message d’indisponibilité avant la saisie des coordonnées, champs personnels et envoi désactivés. Sans JavaScript les champs restent désactivés ; pas de soumission de secours en GET.
- **CRM HelloLead :** enveloppe `payload: { formId, id, data }` identique aux autres LP, envoyée en mode `nocors` (`fetch` POST `text/plain`, `keepalive`, sans prévol CORS) comme `vehicules-de-societe/lead-handler.js`. Les champs sont `prenom`, `nom`, `societe`, `code_postal`, `mail`, `telephone`, `telephone_verifie` (`non`), `consentement` (`oui`), `coordonnee`, `source`, `categorie`, les paires `question_1/reponse_1` (flotte), `question_2/reponse_2` (activité), `question_3/reponse_3` (priorité) et le récapitulatif `autre_info_fj`. Le téléphone est normalisé à dix chiffres ; la LP ne prétend pas l’avoir authentifié par SMS. En `nocors`, la réponse est illisible : le CRM n’apporte pas d’accusé, il est choisi pour ne pas exiger d’autorisation CORS.
- **Google Sheet :** POST `application/x-www-form-urlencoded` vers le script Apps Script partagé, avec `form_id`, `form_name`, `id_lead`, coordonnées, trois paires question/réponse, `autre_info_fj`, `source`, `categorie`, tous les `utm_*`/`ltm_*`, `page_url`, `page_referrer`, `user_agent` et `langue`. Seul un JSON `{"status":"ok"}` compte comme accusé de réception.
- **Exigence de vérification :** quand le service SMS est configuré, l’envoi de la demande est bloqué tant que le numéro saisi n’est pas vérifié, avec le message « Vérifiez votre numéro par SMS avant d’envoyer la demande. ».
- **Confirmation :** elle n’apparaît **que sur un accusé positif du Sheet**. Si les deux transports échouent, ou si le Sheet échoue alors que le CRM ne peut rien confirmer, la page affiche un message d’échec honnête et conserve les réponses.
- **Vérification du numéro par SMS :** sous le champ téléphone, « Vérifier ce numéro par SMS » envoie `action=envoyer_code&telephone=` en `form-urlencoded` vers l’API SMS Partner du dépôt ; un champ « Code reçu » (6 chiffres, `autocomplete="one-time-code"`) apparaît ensuite et appelle `action=verifier_code&telephone=&code=`. Le code vaut 10 minutes, un nouveau remplace l’ancien, le renvoi est bloqué 120 s avec compte à rebours (délai serveur respecté en cas de 429). Seuls les mobiles 06/07 sont acceptés. Une fois vérifié : badge « Numéro vérifié », aide masquée, `telephone_verifie = 'oui'` dans le CRM et la feuille. Changer le numéro après vérification annule la vérification et réaffiche le message. Si l’API ou la campagne n’est pas configurée, le bouton est désactivé avec une phrase honnête plutôt qu’une invitation à un envoi impossible.
- **Suivi d’URL :** lu à l’arrivée dans la query **et** le fragment (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`, `utm_category`, `ltm_source`, `ltm_category`, `ltm_typ`), conservé en `sessionStorage` (`ccp_tracking_v1`) pour survivre à un clic sur un CTA, puis recopié dans les champs masqués du formulaire (`source`, `categorie`, `page_url`, `utm_*`, `ltm_*`). Les identifiants de clic (`gclid`, `msclkid`, `fbclid`) ne sont pas collectés. L’URL d’arrivée vient de l’entrée de navigation, sans paramètre brut au-delà des clés connues.
- **Réception :** un seul envoi à la fois ; identifiant (`id`) conservé en mémoire pour une nouvelle tentative. Les deux transports partent ensemble ; le premier accusé positif affiche la confirmation. Rejet métier, erreur HTTP, corps illisible, coupure réseau ou délai (15 s pour la feuille, 12 s pour le CRM) : pas de succès ; les réponses restent dans le formulaire. Un honeypot rempli bloque la demande. Aucun stockage local de lead, aucune redirection temporisée, aucun `sendBeacon` (il masquerait une coupure réseau).
- **Aucune mesure publicitaire :** pas de GTM, pas de GA4, pas de pixel, pas de `dataLayer`, aucun cookie. Le seul stockage est la clé `sessionStorage` du suivi d’URL, effacée à la fermeture de l’onglet.
- **Mesure de l’origine :** la case facultative a été retirée puisque le suivi ne sert qu’au routage du lead vers la feuille et le CRM. La case de consentement à la transmission reste obligatoire et non précochée.

## Audit préalable et choix de conception

**Base analysée :** `d06ead5` ; inventaire récursif des 3 553 fichiers, 131 répertoires de premier niveau, 359 répertoires au total. Le dépôt contient 181 fichiers HTML (160 comportent un formulaire), 176 CSS, 376 JS, 175 répertoires `img/` et trois polices WOFF2. Il mêle campagnes indépendantes, variantes, formulaires embarqués (`formulaires-audi/`, `formulaires-typ/`), arborescence `fuso/`, remerciements, pages légales, modèles, e-mails et tests. Pas de système de build partagé.

| Référence interne | Ce qui a guidé cette LP |
| --- | --- |
| `vehicules-de-societe/`, `formulaires-typ/formulaire-vehicules/` | Qualification du véhicule avant les coordonnées, CTA courts, réponses structurées pour le CRM. La nouvelle LP réduit le parcours à deux étapes, sans recopier les chiffres, identifiants ou témoignages. |
| `agv_amr/` | Direction artistique B2B dédiée, police locale, progression lisible, erreurs proches des champs, FAQ et navigation responsive. Reprise de DM Sans, sans ses composants de campagne ni ses tags. |
| `ecomobility-geolocalisation/`, `assurance-tns-pro/`, `ticket-restaurant/` | Demandes orientées métier et CTA proches du besoin. Les exports s’appuient souvent sur Webflow, jQuery, Formly, des breakpoints autour de 991/767/479 px et de nombreuses ressources de marque. Ici : HTML sémantique, CSS et JS natifs, ressources locales et deux compositions photographiques selon l’écran. |
| `lead-handler.js`, `verification-sms.js`, `docs/gtm-mapping.md` et `.csv` | 99 handlers dédiés, 97 modules SMS, enveloppe HelloLead `{ payload: { formId, id, data } }`, `googleScriptUrl` commun et plusieurs groupes GTM. Les autorisations et identifiants ne sont pas interchangeables. Cette LP reprend le transport `nocors` du CRM et l’accusé du Sheet, sans SMS et sans GTM. |
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

`LP_URL` permet de viser un sous-répertoire **sur loopback uniquement**. Le test utilise une configuration éphémère, intercepte tous les POST et bloque les ressources tierces : il ne contacte ni le CRM ni le script Google réel. `QA_NO_SANDBOX=1` est réservé aux environnements de test isolés qui l’exigent.

**Vérifications effectuées sur la version UBEPRO :**

- Géométrie sur 15 largeurs de 320 à 2 560 px : un seul formulaire dans le hero, carte dans le cadre, contrôles non recouverts, absence de débordement horizontal aux deux étapes, y compris avec les erreurs affichées. Vérification visuelle de la place de l’utilitaire sur ordinateur, tablette et téléphone ; contrôle de la rotation normale et du mode sans animation.
- CTA du hero et du header, fermeture du menu mobile, ancres sous le header, accès clavier, onglets métier, présélection, FAQ, aller et retour entre les étapes. Sans JavaScript ou sans configuration, pas d’envoi de secours.
- Vérification SMS : envoi refusé sans vérification, code erroné refusé (422 lu et affiché), bon code accepté, numéro modifié après vérification, `telephone_verifie = oui` transmis au CRM et au Sheet, vérification conservée après un échec d’envoi.
- Validations, consentement obligatoire, honeypot, refus HTTP/JSON/métier, réseau indisponible, expiration et nouvelle tentative sans doublon. Vérification du POST CRM (`nocors`) et du POST Sheet, identifiant de lead stable, confirmation uniquement sur accusé positif du Sheet, `page_url` et paramètres `utm_*`/`ltm_*` transmis, champs masqués non modifiables, absence totale de requête Google Tag Manager et de `window.dataLayer`. Aucun envoi au CRM réel ni au script Google.

**Accessibilité et poids :** axe-core 4.10.3 dans Chromium sur les vues flotte, coordonnées et erreurs à 320, 390, 768, 820 et 1 440 px : aucune violation automatique relevée sur ces états. Ce contrôle ne vaut pas certification. Mesure locale à froid, cache désactivé : environ 358 Kio à 1 440 px et 292 Kio à 390/820 px, avec un seul cadrage de la photo téléchargé par écran. Les trois illustrations de la section avantages restent en chargement différé. Mesurer les temps réseau sur le domaine final.
