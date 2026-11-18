/* Recette navigateur facultative, hors livraison publique. Voir README.md.
   Les POST, les prévols et les tags sont interceptés AVANT toute sortie réseau. */
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
const { leadApiUrl } = context.window.UBE_CONFIG;
// These ephemeral fixture values never leave the test browser.
const fixture = randomUUID();
const dummyContainer = 'GTM-' + fixture.slice(0, 8).toUpperCase();
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
      // The card may overlap the blank paper but never a label, progress, error or control.
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
  async function pageWith(configured) {
    const page = await browser.newPage();
    const net = { mode: 'ok', posts: [], tags: 0, external: [] };
    const cors = { 'Access-Control-Allow-Origin': base.origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true' };
    page.on('pageerror', e => errors.push(e.message));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors });
      if (request.method() === 'POST') {
        if (url.href !== leadApiUrl) { net.external.push(url.origin); return request.abort(); }
        net.posts.push(JSON.parse(request.postData()).payload);
        if (net.mode === 'offline') return request.abort('failed');
        if (net.mode === 'timeout') return; // AbortController must release the UI, even without a reply.
        if (net.mode === 'delay') await new Promise(resolve => setTimeout(resolve, 150));
        return request.respond({ status: net.mode === 'http' ? 503 : 200, headers: cors,
          contentType: 'application/json', body: net.mode === 'json' ? 'not-json' :
            JSON.stringify({ status: net.mode === 'negative' ? 'error' : 'ok' }) });
      }
      if (url.origin === 'https://www.googletagmanager.com') {
        net.tags++; return request.respond({ contentType: 'text/javascript', body: '/* test local */' });
      }
      if (url.protocol === 'data:') return request.continue();
      if (url.origin !== base.origin || request.method() !== 'GET') {
        net.external.push(url.origin); return request.abort();
      }
      if (url.pathname.endsWith('/config.js')) return request.respond({ contentType: 'text/javascript',
        body: 'window.UBE_CONFIG = ' + JSON.stringify({ leadApiUrl, formId: configured ? fixture : '', categorie: '',
          gtmContainerId: configured ? dummyContainer : '' }) });
      return request.continue();
    });
    await page.goto(new URL('?utm_source=recette&utm_campaign=flotte&categorie=intrus&gclid=non#/?ltm_category=origine', base).href,
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
    // The card carries only the generic inscription requested, no brand or logo.
    assert.equal(await page.$eval('.fuel-card', el => el.textContent.trim()), 'carte carburant pro');
    assert.ok(await page.$eval('.fuel-card', el => !el.querySelector('img, use')));
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
    assert.ok(await page.evaluate(() => document.querySelector('#demande').getBoundingClientRect().top >= document.querySelector('.site-head').getBoundingClientRect().bottom));
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
    assert.equal(net.posts.length, 0); assert.equal(net.tags, 0); assert.deepEqual(net.external, []);
    console.log('OK : Hero 320 à 2 560 px, deux étapes lisibles, suspension et mouvement réduit, CTA, clavier, menu, préremplissage, FAQ et garde sans configuration.');
    await page.close();

    for (const measure of [false, true]) {
      const { page: p, net: n } = await pageWith(true);
      // A prospect following a CTA must not lose the opt-in fragment attribution.
      await p.click('.hero-actions .btn'); assert.equal(await p.evaluate(() => location.hash), '#demande');
      await stepOne(p); await p.click('#send');
      assert.equal(await p.$$eval('#step-two [aria-invalid="true"]', items => items.length), 7);
      assert.equal(n.posts.length, 0); assert.equal(n.tags, 0);
      if (measure) { await checkHero(p, 'Erreurs de coordonnées'); await p.setViewport({ width: 1024, height: 768 }); }
      await contact(p);
      await p.evaluate(() => {
        const fields = document.getElementById('lead-form').elements;
        fields.mail.value = 'invalide'; fields.telephone.value = '123'; fields.code_postal.value = '75'; fields.consentement.checked = false;
      });
      await p.click('#send');
      assert.equal(await p.$$eval('#step-two [aria-invalid="true"]', items => items.length), 4);
      assert.equal(n.posts.length, 0);
      await p.evaluate(({ mail, telephone, code_postal }) => {
        const fields = document.getElementById('lead-form').elements;
        fields.mail.value = mail; fields.telephone.value = telephone; fields.code_postal.value = code_postal;
      }, data);
      await p.click('[name="consentement"]');
      if (measure) await p.click('[name="mesure"]');
      if (!measure) {
        await p.$eval('[name="website"]', e => { e.value = 'robot'; }); await p.click('#send');
        assert.equal(n.posts.length, 0); await p.$eval('[name="website"]', e => { e.value = ''; });
        for (const mode of ['http', 'json', 'negative', 'offline', 'timeout']) {
          n.mode = mode; await p.click('#send');
          await p.waitForFunction(() => !document.getElementById('submit-error').hidden && !document.querySelector('[aria-busy="true"]'),
            { timeout: 20000 });
          assert.ok(await p.$eval('#confirmation', e => e.hidden));
          assert.equal(await p.$eval('#mail', e => e.value), data.mail);
          assert.equal(n.tags,0);
        }
      }
      const before = n.posts.length;
      n.mode = 'delay'; await p.click('#send');
      await p.$eval('form', f => f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await p.waitForSelector('#confirmation:not([hidden])');
      assert.equal(n.posts.length, before + 1, 'One POST per attempt, even on double submit');
      assert.equal(new Set(n.posts.map(p => p.id)).size, 1, 'Stable id on retry');
      const payload = n.posts.at(-1);
      assert.equal(payload.formId, fixture);
      assert.equal(payload.data.telephone_verifie, 'non'); assert.equal(payload.data.question_1, 'Combien de véhicules souhaitez-vous équiper ?');
      assert.equal(payload.data.telephone, '0600000000'); assert.equal(payload.data.consentement, 'oui');
      assert.equal(payload.data.reponse_1, '2 à 10 véhicules'); assert.equal(payload.data.reponse_2, 'TPE ou PME');
      assert.equal(payload.data.categorie, ''); assert.equal(payload.data.gclid, undefined);
      assert.equal(payload.data.utm_campaign, measure ? 'flotte' : undefined);
      assert.equal(payload.data.ltm_category, measure ? 'origine' : undefined);
      if (measure) await p.waitForFunction(() => window.dataLayer?.some(e => e.event === 'formulaire_lead'));
      const events = await p.evaluate(() => (window.dataLayer || []).filter(e => e.event === 'formulaire_lead'));
      assert.equal(events.length, measure ? 1 : 0);
      if (measure) assert.deepEqual(events[0], { event:'formulaire_lead', form_id:fixture, lead_source:'recette', categorie:'' });
      await p.waitForNetworkIdle({ idleTime: 70 });
      assert.equal(n.tags, measure ? 1 : 0); assert.deepEqual(n.external, []);
      assert.ok(await p.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0)); await p.close();
    }
    assert.deepEqual(errors, []);
    console.log('OK : validation, honeypot, HTTP/JSON/refus/réseau/timeout, reprise sans doublon, succès confirmé, attribution et conversion soumises au choix facultatif. Aucun envoi réel.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
