/* Configuration publique de la campagne. Ne jamais y placer de secret.
   Voir la recette de mise en service dans README.md. */
window.UBE_CONFIG = Object.freeze({
  formId: 'c24877692384950o',  // Identifiant de CETTE campagne dans HelloLead (à faire enregistrer côté CRM).
  formName: 'carte-carburant-pro-form-ubepro',
  categorie: '',               // Code de routage uniquement s'il est fourni par le CRM.
  leadApiUrl: 'https://mc.hellolead.pro/mon_compte/api/webflow/get_information.php',
  leadApiMode: 'nocors',       // 'nocors' comme les autres LP du dépôt ; 'cors' seulement si l'origine est autorisée.
  googleScriptUrl: 'https://script.google.com/macros/s/AKfycbwrbyCb9-cAmIRPGNvnb-aM-CkhQAerrkfP3_HSw-ewmThxsn4vbZt5daaq2aOnL01a1w/exec',
  sheetTimeoutMs: 15000,
  // Vérification du numéro par SMS : même API que les autres LP du dépôt.
  smsApiUrl: 'https://mc.hellolead.pro/mon_compte/api/smspartner/envoi_code_verification.php',
  smsCooldown: 120,
  source: ''                   // Source de secours quand aucune campagne n'est présente.
});
