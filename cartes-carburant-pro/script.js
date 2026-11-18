/* Sillage — static LP. No cookie, third-party script or lead request on load. */
(() => {
  'use strict';

  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('navigation');
  function toggleMenu(open) {
    nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }
  menu.addEventListener('click', () => toggleMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', () => toggleMenu(false));
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-head')) toggleMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      toggleMenu(false);
      menu.focus();
    }
  });
  // ARIA tabs: one keyboard stop, arrow keys switch profiles without moving the page.
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function selectTab(selected) {
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute('aria-selected', String(active));
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const next = { ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });

  const config = window.UBE_CONFIG || {};
  // Never send contact details in clear text, even if a deployment is misconfigured.
  let endpoint;
  try {
    const url = new URL(config.leadApiUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) endpoint = url.href;
  } catch { /* Missing endpoint: leave contact collection closed. */ }
  const canSend = Boolean(typeof config.formId === 'string' && config.formId.trim() && endpoint);
  const form = document.getElementById('lead-form');
  const card = document.getElementById('demande');
  const first = document.getElementById('step-one');
  const second = document.getElementById('step-two');
  const back = document.getElementById('back');
  const send = document.getElementById('send');
  const sendLabel = send.querySelector('span');
  const errorBox = document.getElementById('submit-error');
  const confirmation = document.getElementById('confirmation');
  const questions = [
    'Combien de véhicules souhaitez-vous équiper ?',
    'Quelle est votre activité professionnelle ?',
    'Quelle est votre priorité ?'
  ];
  let step = 1;
  let sending = false;
  let submissionId;

  function displayStep(next) {
    step = next;
    form.dataset.step = String(next);
    first.hidden = next !== 1;
    second.hidden = next !== 2;
    errorBox.hidden = true;
    document.getElementById('progress-label').textContent = `Étape ${next} sur 2`;
    card.scrollIntoView({ block: 'start' });
    (next === 1 ? first : second).querySelector('.form-title').focus({ preventScroll: true });
  }
  back.addEventListener('click', () => { if (!sending) displayStep(1); });
  document.querySelectorAll('[data-activity]').forEach(link => {
    link.addEventListener('click', () => {
      if (sending || form.hidden) return;
      form.elements.reponse_2.value = link.dataset.activity;
      markError('reponse_2', '');
      if (step === 2) displayStep(1);
    });
  });

  function value(name) { return form.elements.namedItem(name).value.trim(); }
  function telephone() { return value('telephone').replace(/[\s().-]/g, '').replace(/^(\+33|0033)0?/, '0'); }
  function message(name) {
    switch (name) {
      case 'reponse_1': return value(name) ? '' : 'Choisissez la taille de votre parc.';
      case 'reponse_2': return value(name) ? '' : 'Indiquez votre activité.';
      case 'prenom': return value(name) ? '' : 'Indiquez votre prénom.';
      case 'nom': return value(name) ? '' : 'Indiquez votre nom.';
      case 'societe': return value(name) ? '' : 'Indiquez le nom de votre entreprise.';
      case 'mail': return form.elements.mail.validity.valid && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(name)) ? '' : 'Indiquez une adresse e-mail valide.';
      case 'code_postal': return /^\d{5}$/.test(value(name)) ? '' : 'Saisissez un code postal à cinq chiffres.';
      case 'telephone': return /^0[1-9]\d{8}$/.test(telephone()) ? '' : 'Indiquez un numéro français à dix chiffres ou au format +33.';
      case 'consentement': return form.elements.consentement.checked ? '' : 'Votre accord est nécessaire pour traiter cette demande.';
      default: return '';
    }
  }
  function markError(name, text) {
    const hint = document.getElementById(`error-${name}`);
    if (!hint) return;
    hint.textContent = text;
    hint.hidden = !text;
    form.querySelectorAll(`[name="${name}"]`).forEach(control => {
      if (text) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', hint.id);
      } else {
        control.removeAttribute('aria-invalid');
        control.removeAttribute('aria-describedby');
      }
    });
  }
  function validate(fields) {
    let firstInvalid;
    fields.forEach(name => {
      const text = message(name);
      markError(name, text);
      if (text && !firstInvalid) firstInvalid = form.querySelector(`[name="${name}"]`);
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }
  form.addEventListener('input', event => {
    const { name } = event.target;
    if (event.target.getAttribute('aria-invalid') === 'true') markError(name, message(name));
  });

  // Only existing CRM attribution fields, only after a separate optional opt-in.
  // Do not copy a raw URL, click ID or any contact information into analytics.
  function attribution() {
    const url = new URL(window.location.href);
    const hash = url.hash.slice(1);
    const fragment = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash);
    const tracking = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'utm_category',
      'ltm_source', 'ltm_category', 'ltm_typ'].forEach(key => {
      const raw = url.searchParams.get(key) || fragment.get(key);
      if (raw) tracking[key] = raw.trim().replace(/[<>]/g, '').slice(0, 160);
    });
    return tracking;
  }
  function leadData(measure) {
    const tracking = measure ? attribution() : {};
    const data = {
      prenom: value('prenom'), nom: value('nom'), societe: value('societe'), code_postal: value('code_postal'),
      mail: value('mail').toLowerCase(), telephone: telephone(), telephone_verifie: 'non', consentement: 'oui', coordonnee: '1',
      source: tracking.ltm_source || tracking.utm_source || '', categorie: config.categorie || '', ...tracking
    };
    const recap = [];
    questions.forEach((question, i) => {
      const answer = value(`reponse_${i + 1}`);
      data[`question_${i + 1}`] = question;
      data[`reponse_${i + 1}`] = answer;
      if (answer) recap.push(`${question} : ${answer}`);
    });
    data.autre_info_fj = recap.join('\n');
    return data;
  }
  function makeId() {
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  async function sendLead(data) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Same HelloLead envelope as the repository's CORS handlers. Reuse the ID on retry.
      submissionId = submissionId || makeId();
      const response = await fetch(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        signal: controller.signal, body: JSON.stringify({ payload: { formId: config.formId, id: submissionId, data } })
      });
      if (!response.ok || (await response.json())?.status !== 'ok') throw new Error('CRM receipt missing');
    } finally { clearTimeout(timeout); }
  }
  function recordConversion(data) {
    const id = config.gtmContainerId;
    if (!/^GTM-[A-Z0-9]+$/.test(id || '')) return;
    const layer = window.dataLayer = window.dataLayer || [];
    function consentCommand() { layer.push(arguments); }
    consentCommand('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied' });
    layer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id);
    document.head.appendChild(tag);
    layer.push({ event: 'formulaire_lead', form_id: config.formId, lead_source: data.source, categorie: data.categorie });
  }
  function submitError(text) {
    errorBox.textContent = text;
    errorBox.hidden = false;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || form.hidden) return;
    if (step === 1) {
      if (validate(['reponse_1', 'reponse_2'])) displayStep(2);
      return;
    }
    if (!canSend) { submitError('La prise de contact en ligne n’est pas ouverte. Aucune donnée n’a été envoyée.'); return; }
    if (value('website')) { submitError('La demande ne peut pas être transmise.'); return; }
    if (!validate(['prenom', 'nom', 'societe', 'code_postal', 'mail', 'telephone', 'consentement'])) return;
    const measure = form.elements.mesure.checked;
    const data = leadData(measure);
    sending = true;
    second.disabled = true;
    form.setAttribute('aria-busy', 'true');
    sendLabel.textContent = 'Envoi en cours…';
    errorBox.hidden = true;
    try {
      await sendLead(data);
    } catch {
      submitError('L’envoi n’a pas pu être confirmé. Vos réponses restent sur cette page ; vous pouvez réessayer.');
      return;
    } finally {
      sending = false;
      second.disabled = false;
      form.removeAttribute('aria-busy');
      sendLabel.textContent = 'Envoyer ma demande';
    }
    form.reset();
    form.hidden = true;
    confirmation.hidden = false;
    confirmation.focus();
    if (measure) recordConversion(data);
  });
  // Enable the form only after attaching the submit handler. Without a campaign
  // ID the project can be explored, but no personal data is requested or sent.
  first.disabled = false;
  second.disabled = false;
  if (!canSend) {
    second.querySelectorAll('input').forEach(input => { input.disabled = true; });
    send.disabled = true;
    document.getElementById('not-configured').hidden = false;
  }
})();
