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
    for (const width of [320, 375, 390, 700, 768, 820, 1024, 1280, 1440, 1920]) {
      await page.setViewport({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Débordement ${width}px`);
    }
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].every(a => document.getElementById(a.hash.slice(1)))));
    await page.setViewport({ width: 390, height: 844 });
    await page.click('.menu-toggle');
    assert.equal(await page.$eval('.menu-toggle', e => e.getAttribute('aria-expanded')), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.menu-toggle', e => e.getAttribute('aria-expanded')), 'false');
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
    await page.click('#back');
    assert.equal(await page.$eval('input[name="reponse_1"]:checked', e => e.value), '2 à 10 véhicules');
    await page.click('.faq-list summary');
    assert.ok(await page.$eval('.faq-list details', e => e.open));
    assert.equal(net.posts.length, 0); assert.equal(net.tags, 0); assert.deepEqual(net.external, []);
    console.log('OK — responsive 320–1920 px, ancres, menu, onglets clavier, préremplissage, FAQ, retour et garde sans configuration.');
    await page.close();

    for (const measure of [false, true]) {
      const { page: p, net: n } = await pageWith(true);
      await stepOne(p); await p.click('#send');
      assert.equal(await p.$$eval('#step-two [aria-invalid="true"]', items => items.length), 7);
      assert.equal(n.posts.length, 0);
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
    console.log('OK — validation, honeypot, HTTP/JSON/refus/réseau/timeout, reprise sans doublon, succès confirmé, attribution et conversion soumises au choix facultatif. Aucun envoi réel.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
