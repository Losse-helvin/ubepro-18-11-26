/* Configuration publique de la campagne. Ne jamais y placer de secret.
   Voir la recette de mise en service dans README.md. */
window.UBE_CONFIG = Object.freeze({
  formId: '',          // Identifiant enregistré pour CETTE campagne ; vide = aucun envoi.
  categorie: '',       // Code de routage uniquement s'il est fourni par le CRM.
  leadApiUrl: 'https://mc.hellolead.pro/mon_compte/api/webflow/get_information.php',
  gtmContainerId: ''   // Facultatif ; aucun tag chargé par défaut.
});
