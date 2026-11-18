/* Recette navigateur facultative, hors livraison publique. Voir README.md.
   Les appels CRM et Apps Script sont interceptés AVANT toute sortie réseau. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const puppeteer = require('puppeteer-core');

const base = new URL(process.env.LP_URL || 'http://127.0.0.1:8000/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Test local uniquement');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
const { leadApiUrl, googleScriptUrl, formId } = context.window.UBE_CONFIG;
assert.match(formId, /^c\d{14}o$/, 'formId au format c + 14 chiffres + o');
// Ces valeurs éphémères ne quittent pas le navigateur de test.
const fixture = randomUUID();
const data = { prenom: 'Test', nom: 'Recette', societe: 'Entreprise de test',
  code_postal: '75011', mail: 'recette@example.test', telephone: '+33 6 00 00 00 00' };

const widths = [320, 360, 390, 540, 680, 681, 768, 820, 959, 960, 1024, 1280, 1440, 1920, 2560];
async function checkHero(page, state) {
  for (const width of widths) {
    await page.setViewport({ width, height: width <= 680 ? 812 : 900 });
    const problems = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const [hero, copy, photo, panel, card] = ['.hero', '.hero-copy', '.hero-photo', '#demande', '.fuel-card'].map(rect);
      const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth || !inside(panel, hero) || !inside(card, hero)) issues.push('débordement');
      if (innerWidth <= 680) {
        if (photo.top < copy.bottom - 1 || panel.top < photo.bottom - 1) issues.push('ordre accroche, véhicule, formulaire');
      } else if (copy.right > panel.left + 1 || panel.top - hero.top > hero.height / 5) issues.push('position du formulaire');
      if (card.left < panel.left + panel.width / 2 || card.top >= panel.top) issues.push('ancrage de la carte');
      // La carte peut déborder sur la marge du panneau, jamais sur un libellé ni un contrôle.
      const content = '#demande :is(.form-kicker, .step-indicator, .form-title, .field-error, .notice, .fleet, .field, button, .consent, .privacy)';
      for (const el of document.querySelectorAll(content)) {
        if (!el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (!inside(r, panel) || intersects(card, r)) issues.push(el.id || el.className);
      }
      return issues;
    });
    assert.deepEqual(problems, [], `${state}, ${width} px : ${problems.join(', ')}`);
  }
}
async function checkSuspension(page) {
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.waitForFunction(() => document.querySelector('.fuel-card').getAnimations().length === 1);
  const swing = await page.$eval('.fuel-card', el => {
    const anim = el.getAnimations()[0];
    const css = getComputedStyle(el);
    const frames = anim.effect.getKeyframes();
    return { duration: anim.effect.getTiming().duration, direction: css.animationDirection, easing: css.animationTimingFunction,
      count: css.animationIterationCount, pivotY: parseFloat(css.transformOrigin.split(' ')[1]) / el.offsetHeight,
      start: frames[0].transform, end: frames.at(-1).transform, current: css.transform };
  });
  assert.ok(swing.duration >= 4000 && swing.pivotY <= .1);
  assert.equal(swing.direction, 'alternate'); assert.equal(swing.easing, 'ease-in-out');
  assert.equal(swing.count, 'infinite'); assert.notEqual(swing.start, swing.end);
  await page.waitForFunction(before => getComputedStyle(document.querySelector('.fuel-card')).transform !== before, {}, swing.current);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => {
    const el = document.querySelector('.fuel-card');
    return getComputedStyle(el).animationName === 'none' && el.getAnimations().length === 0;
  });
}

async function run() {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN, headless: true,
    args: process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [] });
  const errors = [];
  async function pageWith(configured, overrides = {}) {
    const page = await browser.newPage();
    const net = { mode: 'ok', crm: [], sheet: [], beacons: 0, external: [], gtm: 0 };
    const cors = { 'Access-Control-Allow-Origin': base.origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type' };
    page.on('pageerror', e => errors.push(e.message));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors });
      if (request.method() === 'POST') {
        // Modes explicites : chaque transport peut réussir, échouer ou ne jamais répondre.
        const crmFails = ['offline', 'http', 'json', 'negative', 'timeout'].includes(net.mode);
        const sheetFails = ['offline', 'http', 'json', 'negative', 'timeout', 'sheet-down'].includes(net.mode);
        if (url.href === leadApiUrl) {
          net.crm.push(JSON.parse(request.postData()).payload);
          if (net.mode === 'offline') return request.abort('failed');
          if (net.mode === 'timeout') return; // le délai doit libérer l'interface
          if (crmFails) return request.respond({ status: 503, headers: cors });
          if (net.mode === 'delay') await new Promise(resolve => setTimeout(resolve, 150));
          // Réponse opaque pour le navigateur : le CRM ne renvoie pas d'en-tête CORS.
          return request.respond({ status: 200, contentType: 'text/plain', body: 'ok' });
        }
        if (url.href === googleScriptUrl) {
          const body = new URLSearchParams(request.postData());
          net.sheet.push(Object.fromEntries(body.entries()));
          if (net.mode === 'offline') return request.abort('failed');
          if (net.mode === 'timeout') return;
          if (net.mode === 'sheet-down' || net.mode === 'http') return request.respond({ status: 500, headers: cors });
          if (net.mode === 'json') return request.respond({ status: 200, headers: cors,
            contentType: 'application/json', body: 'not-json' });
          if (net.mode === 'negative') return request.respond({ status: 200, headers: cors,
            contentType: 'application/json', body: JSON.stringify({ status: 'error' }) });
          return request.respond({ status: 200, headers: cors, contentType: 'application/json',
            body: JSON.stringify({ status: 'ok' }) });
        }
        net.external.push(url.origin); return request.abort();
      }
      if (/googletagmanager|google-analytics|gtag\/js/.test(url.href)) { net.gtm++; return request.abort(); }
      if (url.protocol === 'data:') return request.continue();
      if (url.origin !== base.origin || request.method() !== 'GET') { net.external.push(url.origin); return request.abort(); }
      if (url.pathname.endsWith('/config.js')) return request.respond({ contentType: 'text/javascript',
        body: 'window.UBE_CONFIG = ' + JSON.stringify(configured
          ? { formId, formName: 'recette', categorie: '', leadApiUrl, leadApiMode: 'nocors',
              googleScriptUrl, sheetTimeoutMs: 15000, source: '', ...overrides }
          : { ...context.window.UBE_CONFIG, formId: '' }) });
      return request.continue();
    });
    await page.goto(new URL('?utm_source=recette&utm_campaign=flotte&gclid=non#/?ltm_category=origine', base).href,
      { waitUntil: 'networkidle0' });
    return { page, net };
  }
  async function stepOne(page) {
    await page.click('input[value="2 à 10 véhicules"]');
    await page.select('#activite', 'TPE ou PME');
    await page.click('.form-next');
    await page.waitForSelector('#step-two:not([hidden])');
  }
  async function contact(page) {
    for (const [name, text] of Object.entries(data)) await page.type(`[name="${name}"]`, text);
    await page.click('[name="consentement"]');
  }
  try {
    const { page, net } = await pageWith(false);
    assert.equal(await page.$$eval('form', forms => forms.length), 1);
    assert.ok(await page.$('.hero #demande #lead-form'));
    // La carte ne porte que l'inscription générique demandée.
    assert.equal(await page.$eval('.fuel-card', el => el.textContent.trim()), 'carte carburant pro');
    assert.ok(await page.$eval('.fuel-card', el => !el.querySelector('img, use')));
    // Aucun GTM et aucun dataLayer, même à l'arrivée.
    assert.equal(await page.evaluate(() => typeof window.dataLayer), 'undefined');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('script[src*="googletagmanager"], script[src*="gtag"], script[src*="google-analytics"]'))), false);
    await checkHero(page, 'Flotte');
    await checkSuspension(page);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].every(a => document.getElementById(a.hash.slice(1)))));
    await page.setViewport({ width: 390, height: 844 });
    await page.click('.menu-toggle');
    assert.equal(await page.$eval('.menu-toggle', e => e.getAttribute('aria-expanded')), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.menu-toggle', e => e.getAttribute('aria-expanded')), 'false');
    await page.click('.menu-toggle'); await page.click('.head-cta');
    assert.equal(await page.$eval('.menu-toggle', e => e.getAttribute('aria-expanded')), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'demande');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.name), 'reponse_1');
    await page.click('#tab-independant'); await page.keyboard.press('ArrowRight');
    assert.ok(await page.$eval('#profil-pme', e => !e.hidden));
    await page.click('#profil-pme .text-link');
    assert.equal(await page.$eval('#activite', e => e.value), 'TPE ou PME');
    await page.click('.form-next');
    assert.ok(await page.$eval('#error-reponse_1', e => !e.hidden));
    await stepOne(page);
    assert.ok(await page.$eval('#send', e => e.disabled));
    assert.ok(await page.$eval('#prenom', e => e.disabled));
    assert.ok(await page.$eval('#not-configured', e => !e.hidden));
    await checkHero(page, 'Coordonnées sans configuration');
    await page.setViewport({ width: 390, height: 844 });
    await page.click('#back');
    assert.equal(await page.$eval('input[name="reponse_1"]:checked', e => e.value), '2 à 10 véhicules');
    await page.click('.faq-list summary');
    assert.ok(await page.$eval('.faq-list details', e => e.open));
    assert.equal(net.crm.length, 0); assert.equal(net.sheet.length, 0); assert.deepEqual(net.external, []);
    console.log('OK : Hero 320 à 2 560 px, deux étapes lisibles, suspension et mouvement réduit, CTA, clavier, menu, FAQ, garde sans configuration, aucun GTM.');
    await page.close();

    const { page: p, net: n } = await pageWith(true);
    // Le suivi d'URL est capturé à l'arrivée (query + fragment) puis conservé après un CTA interne.
    assert.deepEqual(await p.evaluate(() => window.UBEPRO_CARBURANT.tracking()),
      // Les alias se complètent comme sur les autres LP : ltm_source reprend utm_source.
      { source: 'recette', categorie: 'origine', utm_source: 'recette', utm_campaign: 'flotte',
        utm_category: 'origine', ltm_source: 'recette', ltm_category: 'origine' });
    await p.click('.hero-actions .btn'); assert.equal(await p.evaluate(() => location.hash), '#demande');
    assert.equal(await p.evaluate(() => window.UBEPRO_CARBURANT.tracking().utm_campaign), 'flotte');
    // Les champs masqués portent le suivi, jamais un code de clic.
    const hidden = await p.$$eval('.tracking-fields input', items => Object.fromEntries(items.map(i => [i.name, i.value])));
    assert.equal(hidden.utm_campaign, 'flotte'); assert.equal(hidden.ltm_category, 'origine');
    assert.ok(hidden.page_url.startsWith(base.origin)); assert.equal(hidden.gclid, undefined);
    assert.equal(await p.$$eval('.tracking-fields input', items => items.every(i => i.type === 'hidden')), true);
    await stepOne(p); await p.click('#send');
    // Six coordonnées + le consentement obligatoire restent à remplir.
    assert.equal(await p.$$eval('#step-two [aria-invalid="true"]', items => items.length), 7);
    assert.equal(n.crm.length, 0); assert.equal(n.sheet.length, 0);
    await contact(p);
    await p.evaluate(() => {
      const fields = document.getElementById('lead-form').elements;
      fields.mail.value = 'invalide'; fields.telephone.value = '123'; fields.code_postal.value = '75'; fields.consentement.checked = false;
    });
    await p.click('#send');
    assert.equal(await p.$$eval('#step-two [aria-invalid="true"]', items => items.length), 4);
    assert.equal(n.crm.length, 0);
    await p.evaluate(({ mail, telephone, code_postal }) => {
      const fields = document.getElementById('lead-form').elements;
      fields.mail.value = mail; fields.telephone.value = telephone; fields.code_postal.value = code_postal;
    }, data);
    await p.click('[name="consentement"]');
    await p.$eval('[name="website"]', e => { e.value = 'robot'; }); await p.click('#send');
    assert.equal(n.crm.length, 0); await p.$eval('[name="website"]', e => { e.value = ''; });
    // Les deux destinations en échec : pas de succès, réponses conservées.
    for (const mode of ['offline', 'http', 'json', 'negative', 'timeout']) {
      n.mode = mode; await p.click('#send');
      await p.waitForFunction(() => !document.getElementById('submit-error').hidden && !document.querySelector('[aria-busy="true"]'),
        { timeout: 25000 });
      assert.ok(await p.$eval('#confirmation', e => e.hidden), `pas de succès en mode ${mode}`);
      assert.equal(await p.$eval('#mail', e => e.value), data.mail, `réponses conservées en mode ${mode}`);
    }
    // CRM transmis mais feuille en échec : aucun accusé lisible (nocors), donc
    // pas de confirmation ; le message reste honnête et les réponses sont conservées.
    n.mode = 'sheet-down';
    const crmSent = n.crm.length;
    await p.click('#send');
    await p.waitForFunction(() => !document.getElementById('submit-error').hidden, { timeout: 25000 });
    assert.equal(n.crm.length, crmSent + 1, 'le CRM a bien reçu la demande');
    assert.ok(await p.$eval('#confirmation', e => e.hidden));
    assert.equal(await p.$eval('#mail', e => e.value), data.mail);
    // Reprise : un seul envoi par soumission, identifiant stable, données stables.
    const before = n.crm.length;
    n.mode = 'ok'; await p.click('#send');
    await p.$eval('form', f => f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await p.waitForSelector('#confirmation:not([hidden])');
    assert.equal(n.crm.length, before + 1, 'un seul envoi par tentative');
    assert.equal(new Set(n.crm.map(item => item.id)).size, 1, 'identifiant stable en cas de reprise');
    const payload = n.crm.at(-1);
    assert.equal(payload.formId, formId);
    assert.equal(payload.data.telephone_verifie, 'non'); assert.equal(payload.data.telephone, '0600000000');
    assert.equal(payload.data.consentement, 'oui');
    assert.equal(payload.data.question_1, 'Combien de véhicules souhaitez-vous équiper ?');
    assert.equal(payload.data.reponse_1, '2 à 10 véhicules'); assert.equal(payload.data.reponse_2, 'TPE ou PME');
    assert.equal(payload.data.source, 'recette'); assert.equal(payload.data.categorie, 'origine');
    assert.equal(payload.data.utm_campaign, 'flotte'); assert.equal(payload.data.ltm_category, 'origine');
    assert.equal(payload.data.gclid, undefined);
    assert.ok(payload.data.page_url.startsWith(base.origin));
    // Feuille : mêmes informations, en form-urlencoded, avec l'identifiant du lead.
    const sheet = n.sheet.at(-1);
    assert.equal(sheet.form_id, formId); assert.equal(sheet.id_lead, payload.id);
    assert.equal(sheet.nom, 'Recette'); assert.equal(sheet.telephone, '0600000000');
    assert.equal(sheet.reponse_1, '2 à 10 véhicules'); assert.equal(sheet.reponse_2, 'TPE ou PME');
    assert.equal(sheet.source, 'recette'); assert.equal(sheet.utm_campaign, 'flotte');
    assert.equal(sheet.categorie, 'origine');
    await p.waitForNetworkIdle({ idleTime: 70 });
    assert.equal(n.gtm, 0, 'aucune requête Google Tag Manager');
    assert.deepEqual(n.external, []);
    assert.ok(await p.evaluate(() => window.dataLayer === undefined));
    await p.close();
    assert.deepEqual(errors, []);
    console.log('OK : suivi d’URL (query et fragment, champs masqués), CRM HelloLead, Google Sheet, reprise sans doublon, succès seulement après envoi accepté, aucun GTM. Aucun envoi réel.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
