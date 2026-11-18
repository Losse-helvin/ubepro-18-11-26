/* Carte carburant pro : formulaire, CRM HelloLead, Google Sheet et suivi d'URL.
   Aucun Google Tag Manager, aucun dataLayer, aucun script tiers au chargement. */
(() => {
  'use strict';

  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('navigation');
  function toggleMenu(open) {
    nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }
  menu.addEventListener('click', () => toggleMenu(menu.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) toggleMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      toggleMenu(false);
      menu.focus();
    }
  });

  // ARIA tabs : un seul arrêt clavier, les flèches changent de profil.
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

  /* ---------------- Suivi d'URL (utm_ / ltm_), query et fragment ---------------- */
  // Même liste de paramètres que les autres LP du dépôt. Lecture à l'arrivée,
  // conservation en sessionStorage pour ne pas perdre la campagne après un CTA.
  const TRACKING_KEY = 'ccp_tracking_v1';
  const PAGE_URL_KEY = 'ccp_tracking_page_url_v1';
  const TRACKING_PARAMS = [
    ['source', ['source', 'utm_source', 'ltm_source']],
    ['categorie', ['categorie', 'utm_category', 'ltm_category', 'category']],
    ['utm_source', ['utm_source', 'ltm_source', 'source']],
    ['utm_medium', ['utm_medium', 'medium']],
    ['utm_campaign', ['utm_campaign', 'campaign']],
    ['utm_content', ['utm_content', 'content']],
    ['utm_term', ['utm_term', 'term']],
    ['utm_id', ['utm_id', 'campaign_id']],
    ['utm_category', ['utm_category', 'ltm_category', 'categorie', 'category']],
    ['ltm_source', ['ltm_source', 'utm_source', 'source']],
    ['ltm_category', ['ltm_category', 'utm_category', 'categorie', 'category']],
    ['ltm_typ', ['ltm_typ', 'utm_typ', 'typ']]
  ];
  function cleanValue(value, limit = 160) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, limit);
  }
  function readStored(key) {
    try { return JSON.parse(window.sessionStorage.getItem(key) || '{}') || {}; } catch { return {}; }
  }
  function storeTracking(values) {
    try { window.sessionStorage.setItem(TRACKING_KEY, JSON.stringify(values)); } catch { /* mode privé */ }
  }
  function parseParams(rawUrl) {
    const params = Object.create(null);
    try {
      const url = new URL(rawUrl || window.location.href, window.location.href);
      function collect(search) {
        new URLSearchParams(search || '').forEach((value, key) => {
          const name = String(key).trim().toLowerCase();
          const clean = cleanValue(value);
          if (name && clean) params[name] = clean;
        });
      }
      collect(url.search);
      const hash = url.hash.slice(1);
      const separator = hash.indexOf('?');
      collect(separator >= 0 ? hash.slice(separator + 1) : (hash.includes('=') && !hash.startsWith('/') ? hash : ''));
    } catch { /* URL inhabituelle : aucun paramètre */ }
    return params;
  }
  // L'URL d'arrivée n'est pas toujours lisible après un CTA interne (#demande) :
  // l'entrée de navigation garde alors la campagne d'origine.
  function entryUrl() {
    try {
      return window.performance.getEntriesByType('navigation')[0].name || window.location.href;
    } catch { return window.location.href; }
  }
  let tracking = readStored(TRACKING_KEY);
  let trackedPageUrl = (() => {
    try { return window.sessionStorage.getItem(PAGE_URL_KEY) || ''; } catch { return ''; }
  })();
  function captureTracking(rawUrl) {
    const params = parseParams(rawUrl);
    const found = {};
    TRACKING_PARAMS.forEach(([key, aliases]) => {
      const alias = aliases.find(name => params[name]);
      if (alias) found[key] = params[alias];
    });
    if (Object.keys(found).length) {
      tracking = { ...tracking, ...found };
      storeTracking(tracking);
      trackedPageUrl = cleanValue(rawUrl || window.location.href, 1000);
      try { window.sessionStorage.setItem(PAGE_URL_KEY, trackedPageUrl); } catch { /* mode privé */ }
    }
    return found;
  }
  function trackingPayload() {
    captureTracking(window.location.href);
    captureTracking(entryUrl());
    const values = {};
    TRACKING_PARAMS.forEach(([key]) => { if (tracking[key]) values[key] = tracking[key]; });
    return values;
  }
  const pageUrl = () => {
    const url = trackedPageUrl || window.location.href;
    try {
      const clean = new URL(url);
      return cleanValue(clean.origin + clean.pathname + clean.search, 1000);
    } catch { return cleanValue(url, 1000); }
  };

  // Champs masqués du formulaire : le suivi accompagne la demande sans être saisi.
  function fillHiddenFields() {
    const values = { ...trackingPayload(), page_url: pageUrl() };
    document.querySelectorAll('.tracking-fields input[name]').forEach(input => {
      const value = values[input.name];
      input.value = value ? cleanValue(value, 1000) : '';
    });
  }
  fillHiddenFields();

  /* ---------------- Formulaire ---------------- */
  let endpoint;
  try {
    const url = new URL(config.leadApiUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) endpoint = url.href;
  } catch { /* URL absente : collecte fermée */ }
  let sheetUrl;
  try {
    const url = new URL(config.googleScriptUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) sheetUrl = url.href;
  } catch { /* feuille absente : seul le CRM est utilisé */ }
  const canSend = Boolean(typeof config.formId === 'string' && config.formId.trim() && endpoint);

  /* ---------------- Vérification du numéro par SMS ----------------
     Même API que les 97 pages du dépôt (HelloLead / SMS Partner) :
     POST action=envoyer_code|verifier_code, form-urlencoded. Le code a
     6 chiffres, vaut 10 minutes, un nouveau remplace l'ancien. */
  const SMS_MOBILE = /^0[67]\d{8}$/;
  let smsUrl;
  try {
    const url = new URL(config.smsApiUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) smsUrl = url.href;
  } catch { /* pas de vérification possible : le champ reste informatif */ }
  const smsBox = document.getElementById('verification-sms');
  const smsSend = document.getElementById('sms-send');
  const smsRow = document.getElementById('sms-code-row');
  const smsCode = document.getElementById('sms-code');
  const smsCheck = document.getElementById('sms-check');
  const smsMessage = document.getElementById('sms-message');
  const smsBody = smsBox ? smsBox.parentElement : null;
  let requestedPhone = '';
  let verifiedPhone = '';
  let smsTimer = null;
  let smsBusy = false;
  function smsPhone(value) { return String(value || '').replace(/[\s().-]/g, '').replace(/^(?:\+33|0033)0?/, '0'); }
  function smsSay(text, kind) {
    if (!smsMessage) return;
    smsMessage.textContent = text || '';
    smsMessage.classList.toggle('is-error', kind === 'error');
    smsMessage.classList.toggle('is-success', kind === 'success');
  }
  function smsStopCountdown() {
    if (smsTimer) window.clearInterval(smsTimer);
    smsTimer = null;
  }
  function smsCountdown(seconds) {
    smsStopCountdown();
    let left = seconds;
    smsSend.disabled = true;
    const tick = () => {
      if (left <= 0) {
        smsStopCountdown();
        smsSend.disabled = false;
        smsSend.textContent = 'Renvoyer le code';
        return;
      }
      smsSend.textContent = `Renvoyer le code (${left} s)`;
      left -= 1;
    };
    tick();
    smsTimer = window.setInterval(tick, 1000);
  }
  function smsReset() {
    verifiedPhone = '';
    requestedPhone = '';
    smsStopCountdown();
    if (smsRow) smsRow.hidden = true;
    if (smsCode) smsCode.value = '';
    if (smsSend) { smsSend.hidden = false; smsSend.disabled = false; smsSend.textContent = 'Vérifier ce numéro par SMS'; }
    document.querySelectorAll('.sms-verified').forEach(node => node.remove());
    const help = document.querySelector('.sms-help');
    if (help) help.hidden = false;
    const tel = document.getElementById('tel');
    if (tel) tel.removeAttribute('aria-invalid');
    smsSay('');
  }
  async function smsRequest(params) {
    const body = new URLSearchParams({ action: params.action, telephone: params.telephone });
    if (params.code != null) body.set('code', params.code);
    const response = await fetch(smsUrl, { method: 'POST', mode: 'cors', credentials: 'omit', body });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text ? { message: text.slice(0, 300) } : null; }
    return { status: response.status, ok: response.ok, data: json || {} };
  }
  function smsFailed(result) {
    const code = result.status >= 400 ? result.status
      : parseInt(result.data.http_status || result.data.status_code || result.data.error_code, 10);
    if (!result.ok || code >= 400) return true;
    if (result.data.ok === false || result.data.success === false) return true;
    return /^(error|erreur|ko|failed|fail)$/.test(String(result.data.status || result.data.statut || '').toLowerCase());
  }
  function smsError(result) {
    const fallback = {
      422: 'Numéro ou code invalide.',
      404: 'Aucun code envoyé pour ce numéro. Demandez un nouveau code.',
      410: 'Le code a expiré. Demandez-en un nouveau.',
      409: 'Ce code a déjà été utilisé. Demandez-en un nouveau.',
      429: 'Veuillez patienter avant de redemander un code.',
      502: 'L’envoi du SMS a échoué. Réessayez dans un instant.'
    };
    return result.data.message || result.data.error || fallback[result.status] || 'La vérification a échoué.';
  }
  function smsVerified() {
    const tel = document.getElementById('tel');
    if (!tel) return;
    tel.removeAttribute('aria-invalid');
    let badge = smsBody.querySelector('.sms-verified');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sms-verified';
      badge.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#check"/></svg>Numéro vérifié';
      smsSend.insertAdjacentElement('afterend', badge);
    }
    badge.hidden = false;
    const help = document.querySelector('.sms-help');
    if (help) help.hidden = true;
  }
  if (smsBox) {
    if (!smsUrl || !config.formId) {
      // Sans API ou sans campagne, dire la vérité au lieu d'inviter à un envoi impossible.
      smsSend.disabled = true;
      smsSend.textContent = 'Vérification par SMS indisponible';
      smsSay('La vérification automatique n’est pas encore ouverte. Vous pouvez envoyer votre demande, le conseiller confirmera le numéro.');
    } else {
      smsSend.addEventListener('click', async () => {
        if (smsBusy) return;
        const tel = document.getElementById('tel');
        const number = smsPhone(tel.value);
        if (!SMS_MOBILE.test(number)) {
          smsSay('Saisissez un mobile français valide : 10 chiffres commençant par 06 ou 07.', 'error');
          return;
        }
        smsBusy = true;
        requestedPhone = number;
        smsSend.disabled = true;
        smsSay('Envoi du code en cours…');
        try {
          const result = await smsRequest({ action: 'envoyer_code', telephone: number });
          if (!smsFailed(result)) {
            smsRow.hidden = false;
            smsCode.value = '';
            smsCode.focus();
            smsSay('Code envoyé par SMS.', 'success');
            smsCountdown(config.smsCooldown || 120);
          } else if (result.status === 429) {
            const wait = parseInt(result.data.retry_after || result.data.delai || result.data.delai_restant, 10) || (config.smsCooldown || 120);
            smsSay(`${smsError(result)} Délai restant : ${wait} s.`, 'error');
            smsCountdown(wait);
          } else {
            smsSay(smsError(result), 'error');
            smsSend.disabled = false;
            smsSend.textContent = 'Recevoir le code';
          }
        } catch {
          smsSay('Connexion impossible au service SMS. Vérifiez votre connexion puis réessayez.', 'error');
          smsSend.disabled = false;
          smsSend.textContent = 'Recevoir le code';
        } finally { smsBusy = false; }
      });
      smsCode.addEventListener('input', () => {
        smsCode.value = smsCode.value.replace(/\D/g, '').slice(0, 6);
      });
      const verify = async () => {
        if (smsBusy) return;
        const tel = document.getElementById('tel');
        const number = smsPhone(tel.value);
        const code = smsCode.value.replace(/\D/g, '');
        if (!requestedPhone || number !== requestedPhone) {
          smsSay('Le numéro a changé. Demandez un nouveau code.', 'error');
          return;
        }
        if (code.length !== 6) { smsSay('Le code comporte 6 chiffres.', 'error'); return; }
        smsBusy = true;
        smsCheck.disabled = true;
        try {
          const result = await smsRequest({ action: 'verifier_code', telephone: number, code });
          if (!smsFailed(result)) {
            verifiedPhone = number;
            smsStopCountdown();
            smsRow.hidden = true;
            smsSend.hidden = true;
            smsSay('');
            smsVerified();
            markError('telephone', '');
          } else {
            smsSay(smsError(result), 'error');
            if (result.status === 404) {
              smsStopCountdown();
              smsSend.disabled = false;
              smsSend.textContent = 'Recevoir le code';
            }
          }
        } catch {
          smsSay('Connexion impossible au service de vérification. Réessayez.', 'error');
        } finally { smsBusy = false; smsCheck.disabled = false; }
      };
      smsCheck.addEventListener('click', verify);
      smsCode.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); verify(); }
      });
    }
    document.getElementById('tel').addEventListener('input', () => {
      const number = smsPhone(document.getElementById('tel').value);
      if ((verifiedPhone && number !== verifiedPhone) || (requestedPhone && number !== requestedPhone)) {
        smsReset();
        smsSay('Le numéro a changé. Demandez un nouveau code.', 'error');
      }
    });
  }
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

  function value(name) {
    const field = form.elements.namedItem(name);
    return field ? String(field.value || '').trim() : '';
  }
  function telephone() { return value('telephone').replace(/[\s().-]/g, '').replace(/^(?:\+33|0033)0?/, '0'); }
  function message(name) {
    switch (name) {
      case 'reponse_1': return value(name) ? '' : 'Choisissez la taille de votre parc.';
      case 'reponse_2': return value(name) ? '' : 'Indiquez votre activité.';
      case 'prenom': return value(name) ? '' : 'Indiquez votre prénom.';
      case 'nom': return value(name) ? '' : 'Indiquez votre nom.';
      case 'societe': return value(name) ? '' : 'Indiquez le nom de votre entreprise.';
      case 'mail': return form.elements.mail.validity.valid && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(name)) ? '' : 'Indiquez une adresse e-mail valide.';
      case 'code_postal': return /^\d{5}$/.test(value(name)) ? '' : 'Saisissez un code postal à cinq chiffres.';
      case 'telephone':
        if (!/^0[1-9]\d{8}$/.test(telephone())) return 'Indiquez un numéro français à dix chiffres ou au format +33.';
        // Quand le service SMS est disponible, la demande exige un numéro vérifié.
        if (smsUrl && config.formId && verifiedPhone !== telephone()) return 'Vérifiez votre numéro par SMS avant d’envoyer la demande.';
        return '';
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

  /* ---------------- Données du lead ---------------- */
  function leadData() {
    const track = trackingPayload();
    const data = {
      prenom: value('prenom'), nom: value('nom'), societe: value('societe'), code_postal: value('code_postal'),
      mail: value('mail').toLowerCase(), telephone: telephone(),
      telephone_verifie: verifiedPhone && verifiedPhone === telephone() ? 'oui' : 'non',
      consentement: 'oui', coordonnee: '1',
      source: track.ltm_source || track.utm_source || track.source || config.source || '',
      categorie: track.categorie || config.categorie || '',
      ...track
    };
    const recap = [];
    questions.forEach((question, i) => {
      const answer = value(`reponse_${i + 1}`);
      data[`question_${i + 1}`] = question;
      data[`reponse_${i + 1}`] = answer;
      if (answer) recap.push(`${question} : ${answer}`);
    });
    data.autre_info_fj = recap.join('\n');
    data.page_url = pageUrl();
    data.page_referrer = cleanValue(document.referrer, 1000);
    data.user_agent = cleanValue(navigator.userAgent, 300);
    data.langue = cleanValue(navigator.language || '', 20);
    return data;
  }
  // Même feuille plate que les autres LP du dépôt (champs form-urlencoded).
  function sheetData(data) {
    return {
      form_id: config.formId,
      form_name: config.formName || '',
      id_lead: submissionId,
      nom: data.nom, prenom: data.prenom, mail: data.mail, telephone: data.telephone,
      telephone_verifie: data.telephone_verifie, societe: data.societe, code_postal: data.code_postal,
      question_1: data.question_1, reponse_1: data.reponse_1,
      question_2: data.question_2, reponse_2: data.reponse_2,
      question_3: data.question_3, reponse_3: data.reponse_3,
      autre_info_fj: data.autre_info_fj,
      source: data.source, categorie: data.categorie,
      utm_source: data.utm_source || '', utm_medium: data.utm_medium || '', utm_campaign: data.utm_campaign || '',
      utm_content: data.utm_content || '', utm_term: data.utm_term || '', utm_id: data.utm_id || '',
      utm_category: data.utm_category || '',
      ltm_source: data.ltm_source || '', ltm_category: data.ltm_category || '', ltm_typ: data.ltm_typ || '',
      page_url: data.page_url, page_referrer: data.page_referrer,
      user_agent: data.user_agent, langue: data.langue
    };
  }
  function makeId() {
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  /* ---------------- Envois ---------------- */
  // CRM : enveloppe HelloLead identique aux autres LP. En mode "nocors" le
  // navigateur ne peut pas lire la réponse : l'envoi reste non confirmé. C'est
  // l'accusé du Google Sheet qui confirme la réception.
  async function sendCrm(data) {
    const body = JSON.stringify({ payload: { formId: config.formId, id: submissionId, data } });
    if (config.leadApiMode === 'cors') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
          referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          signal: controller.signal, body
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || json?.status !== 'ok') throw new Error('CRM sans accusé positif');
        return { target: 'crm', state: 'ok' };
      } finally { clearTimeout(timer); }
    }
    // keepalive : le POST survit à une navigation. Une coupure réseau est
    // détectée (contrairement à sendBeacon) et donne un message honnête.
    // Le délai évite un formulaire bloqué si le CRM ne répond jamais.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      await fetch(endpoint, {
        method: 'POST', mode: 'no-cors', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, keepalive: true,
        signal: controller.signal
      });
    } finally { clearTimeout(timer); }
    return { target: 'crm', state: 'unverified', via: 'fetch-no-cors' };
  }
  // Google Sheet : script Apps Script partagé du dépôt, réponse JSON vérifiée.
  async function sendSheet(data) {
    if (!sheetUrl) throw new Error('URL Google Apps Script absente');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.sheetTimeoutMs || 15000);
    const body = new URLSearchParams();
    Object.entries(sheetData(data)).forEach(([key, raw]) => body.append(key, String(raw == null ? '' : raw)));
    try {
      const response = await fetch(sheetUrl, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', body, signal: controller.signal
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || json?.status !== 'ok') throw new Error((json && json.message) || 'Google Sheet sans accusé positif');
      return { target: 'sheet', state: 'ok' };
    } finally { clearTimeout(timer); }
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
    fillHiddenFields();
    const data = leadData();
    submissionId = submissionId || makeId();
    const results = [];
    sending = true;
    second.disabled = true;
    form.setAttribute('aria-busy', 'true');
    sendLabel.textContent = 'Envoi en cours…';
    errorBox.hidden = true;
    const attempt = promise => promise.then(result => result, () => ({ state: 'error' }));
    const crmDelivery = attempt(sendCrm(data));
    const sheetDelivery = attempt(sendSheet(data));
    // Le premier accusé positif suffit pour afficher la confirmation ; l'autre
    // envoi continue en arrière-plan. Sans aucun accusé, message d'échec.
    const confirmed = await new Promise(resolve => {
      let pending = 2;
      const settle = result => {
        results.push(result);
        pending -= 1;
        if (result.state === 'ok') resolve(true);
        else if (pending === 0) resolve(false);
      };
      crmDelivery.then(settle);
      sheetDelivery.then(settle);
    });
    sending = false;
    second.disabled = false;
    form.removeAttribute('aria-busy');
    sendLabel.textContent = 'Envoyer ma demande';
    // Aucun succès affiché sans accusé de réception d'une destination.
    if (!confirmed) {
      submitError('L’envoi n’a pas pu être confirmé. Vos réponses restent sur cette page ; vous pouvez réessayer.');
      return;
    }
    form.reset();
    form.hidden = true;
    confirmation.hidden = false;
    confirmation.focus();
  });
  // Le formulaire n'est activé qu'après l'attachement des gestionnaires.
  first.disabled = false;
  second.disabled = false;
  if (!canSend) {
    second.querySelectorAll('input').forEach(input => { input.disabled = true; });
    send.disabled = true;
    document.getElementById('not-configured').hidden = false;
  }
  // API de contrôle pour la recette locale, sans aucun effet sur la page.
  window.UBEPRO_CARBURANT = Object.freeze({
    tracking: () => ({ ...trackingPayload() }),
    pageUrl,
    lastSubmissionId: () => submissionId || null
  });
})();
