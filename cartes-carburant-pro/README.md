# Sillage — Cartes carburant professionnelles

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

- **Étape 1 :** taille du parc, activité, priorité facultative. L’action depuis un profil métier présélectionne l’activité ; le retour conserve les choix.
- **Étape 2 :** prénom, nom, entreprise, code postal français, e-mail professionnel et téléphone. Les erreurs sont associées aux champs et le focus rejoint le premier champ à corriger. Deux choix distincts, non précochés : accord de transmission obligatoire et attribution facultative.
- **Sans configuration :** première étape explorable, message d’indisponibilité avant la saisie des coordonnées, champs personnels et envoi désactivés. Sans JavaScript les champs restent désactivés ; pas de soumission de secours en GET.
- **Avec configuration :** reprise du contrat `payload: { formId, id, data }` du mode CORS de `lead-handler.js`. Les champs CRM sont `prenom`, `nom`, `societe`, `code_postal`, `mail`, `telephone`, `telephone_verifie` (`non`), `consentement` (`oui`), `coordonnee`, `source`, `categorie`, les paires `question_1/reponse_1` (flotte), `question_2/reponse_2` (activité), `question_3/reponse_3` (priorité) et le récapitulatif `autre_info_fj`. Le téléphone est normalisé à dix chiffres ; la LP ne prétend pas l’avoir authentifié par SMS.
- **Réception :** un seul envoi à la fois ; identifiant conservé en mémoire pour une nouvelle tentative. Seul le JSON positif du CRM déclenche la confirmation. Rejet métier, erreur HTTP, corps illisible, coupure réseau ou délai de 15 s : pas de succès ni de conversion ; les réponses restent dans le formulaire. Un honeypot rempli bloque la demande. Aucun `sendBeacon`, succès opaque en `no-cors`, stockage local de leads, redirection temporisée ni duplication dans le Google Sheet d’une autre LP.
- **Attribution :** uniquement avec l’accord facultatif, lecture des paramètres connus `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`, `utm_category`, `ltm_source`, `ltm_category`, `ltm_typ` (query ou fragment). `source` privilégie `ltm_source` puis `utm_source`. Pas d’URL brute ni d’identifiant de clic transmis. Les catégories de campagne restent distinctes du routage CRM.
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

### Références marché — note interne, non affichée sur la LP

- **DKV Mobility** : partir du problème des avances et des reçus ; expliquer la facturation, la lecture des transactions et la demande adaptée au parc. Les détails de réseau, de plafonds et de services sont propres aux formules. [1](https://www.dkv-mobility.com/fr/fr/fuelling/fuel-card/fuel-cards-overview) [3](https://www.dkv-mobility.com/fr/fr/fuelling/fuel-card/carte-essence)
- **TotalEnergies Fleet** : distinguer les usages et la taille du parc avant le parcours commercial. Le formulaire distingue le besoin, l’entreprise et le contact ; une simple étude ne nécessite pas de reprendre tous les champs de souscription. [2](https://services.totalenergies.fr/professionnels/conseils/gestion-flotte/avantages-carte-carburant-criteres-choix) [4](https://services.totalenergies.fr/professionnels/gestion-flotte/formulaire/contact-mobility)
- **Ticket Fleet Pro** : guidage par nombre de véhicules, énergie et besoin, avec un réseau à apprécier en fonction des déplacements. Retenir cette logique de choix, pas les économies chiffrées ni l’identité visuelle. [2](https://www.edenred.fr/ticket-fleet-pro)

**Positionnement et wireframe :** « Votre carburant, sous contrôle. » → étude accessible depuis le hero et la navigation → bénéfices concrets (justificatifs, dépenses, itinéraires) → profils métier interactifs → fonctionnement et formulaire → objections et liens légaux. Une demande de contact, pas une souscription bancaire. Pas de remise garantie, pourcentage d’économie, nombre de stations, délai de rappel, avis client ni certification inventés.

**Direction artistique :** identité Sillage, encre bleu nuit et orange signal, signe de voie et courbes de route dessinés pour cette page. Photographies d’illustration générées pour la campagne, recadrées et compressées en WebP ; aucun logo de pétrolier, aucune reproduction de carte commerciale. DM Sans est auto-hébergée avec sa licence OFL dans `assets/fonts/`.

## Recette

`tests/recette.cjs` est un test de développement, pas une dépendance du site. Avec un serveur statique local lancé comme ci-dessus, un Chrome/Chromium disponible et Node récent :

```sh
QA_DEPS=$(mktemp -d)
npm install --prefix "$QA_DEPS" --no-audit --no-fund puppeteer-core@24.2.0
NODE_PATH="$QA_DEPS/node_modules" CHROME_BIN=/chemin/vers/chromium \
  node cartes-carburant-pro/tests/recette.cjs
```

`LP_URL` permet de viser un sous-répertoire **sur loopback uniquement**. Le test utilise une configuration éphémère, intercepte tous les POST et bloque les ressources tierces : il ne contacte ni le CRM ni un conteneur GTM réel. `QA_NO_SANDBOX=1` est réservé aux environnements de test isolés qui l’exigent.

**Vérifications effectuées :** rendu et absence de débordement de 320 à 1 920 px, menu mobile, ancres, onglets au clavier, FAQ native, présélection métier, retour, erreurs de saisie, refus de consentement, absence de configuration, honeypot, erreurs HTTP/JSON/métier/réseau/timeout, maintien des réponses, anti-double-envoi, normalisation et contenu du POST, confirmation et déclenchement unique conditionnel de la conversion. Les deux pages légales référencées ont été consultées. Aucun envoi de test en production.

**Accessibilité et poids :** contrôles axe-core dans Chromium sur les étapes flotte/coordonnées (y compris les erreurs) à 320, 390, 820 et 1 440 px ; aucune violation automatique relevée sur ces états, sans prétendre à une certification. Vérification visuelle desktop/tablette/mobile. En chargement local à froid, environ 350 Kio sur ordinateur et 284 Kio sur mobile, carte illustrative comprise ; l’image principale mobile pèse environ 46 Kio. Les images hors hero utilisent `loading="lazy"`. Temps réseau réels à mesurer après hébergement.
