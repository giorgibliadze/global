// Run after building: node apps/extension/scripts/verify-ui.mjs
// Uses an isolated Chrome profile and local fixtures; does not visit auction sites.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const assets = await readdir(join(dist, 'assets'))
const entry = assets.find((file) => file.startsWith('src-content-index') && file.endsWith('.js'))
assert.ok(entry, 'Built content entry exists')
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'))
assert.equal(manifest.manifest_version, 3)
assert.equal(manifest.content_scripts[0].all_frames, false)
assert.deepEqual(manifest.content_scripts[0].matches.sort(), [
  '*://*.adesa.com/*', '*://*.edgepipeline.com/*', '*://*.manheim.com/*',
])
for (const size of [16, 32, 48, 128]) {
  const png = await readFile(join(dist, manifest.action.default_icon[size]))
  assert.equal(manifest.action.default_icon[size], `icons/auto-importer-${size}.png`)
  assert.equal(png.readUInt32BE(16), size)
  assert.equal(png.readUInt32BE(20), size)
  assert.equal(manifest.icons[size], manifest.action.default_icon[size])
}
assert.deepEqual(await readFile(join(dist, 'images/global-auto-transporter-logo.png')),
  await readFile(new URL('../public/images/global-auto-transporter-logo.png', import.meta.url)))

assert.ok(manifest.web_accessible_resources.some(entry => entry.resources.includes('icons/auto-importer-128.png')))
assert.ok(manifest.web_accessible_resources.some(entry => entry.resources.includes('images/global-auto-transporter-logo.png')))
assert.deepEqual(await readFile(join(dist, 'icons/auto-importer-original.png')),
  await readFile(new URL('../public/icons/auto-importer-original.png', import.meta.url)))

const monitor = `<script>
  window.fixtureErrors = [];
  window.addEventListener('error', event => window.fixtureErrors.push(event.message));
  window.addEventListener('unhandledrejection', event => window.fixtureErrors.push(String(event.reason)));
  const originalConsoleError = console.error;
  console.error = (...args) => { window.fixtureErrors.push(args.map(String).join(' ')); originalConsoleError.apply(console, args); };
</script>`

function fixture(popup, supported, state = 'ready') {
  return `<script type="module">
    const check = (value, label) => { if (!value) throw new Error(label) }
    const wait = () => new Promise(resolve => setTimeout(resolve, 100))
    const checkGeorgian = (root) => {
      const values = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        if (!walker.currentNode.parentElement?.closest('style, script')) values.push(walker.currentNode.textContent)
      }
      for (const element of root.querySelectorAll('[title], [aria-label], [alt]')) {
        for (const attr of ['title', 'aria-label', 'alt']) values.push(element.getAttribute(attr) || '')
      }
      for (let value of values) {
        for (const brand of ['GLOBAL AUTO TRANSPORTER', 'Auto Importer', 'MyAuto', 'Manheim', 'ADESA', 'Edge Pipeline']) value = value.replaceAll(brand, '')
        value = value.replace(/[a-z0-9.-]+\\.(?:com|ge|org)/gi, '')
        check(!/[a-z]/i.test(value), 'No English interface text: ' + value)
      }
      for (const element of root.querySelectorAll('.import-button, .guidance, .notice, .section-label, .panel-footer, .detection')) {
        check(element.scrollWidth <= element.clientWidth + 1, 'Georgian text fits: ' + element.className)
      }
    }
    try {
      await wait(); await wait()
      ${popup ? `
        const button = document.querySelector('.import-button')
        check(!!button, 'Popup renders')
        check(button.disabled === ${!supported}, 'Popup supported/disabled state')
        check(document.querySelector('h1').textContent === 'Auto Importer', 'Popup title')
        const logo = document.querySelector('.brand-logo img')
        check(logo.complete && logo.naturalWidth > 0, 'Original logo loads')
        check(document.querySelector('footer').textContent.includes('1.0.0'), 'Manifest version')
        check(document.body.getBoundingClientRect().width === 380, 'Popup width')
        check(document.documentElement.lang === 'ka', 'Georgian popup language')
        check(button.textContent.includes('MyAuto-ზე გადატანა'), 'Georgian button label')
        check(document.querySelector('.detection').textContent.includes(${JSON.stringify(
          state === 'loading' ? 'მოწმდება ვებსაიტი' : state === 'error' ? 'ვებსაიტის ამოცნობა ვერ მოხერხდა' : supported ? 'მხარდაჭერილი ვებსაიტი' : ''
        )}), 'Localized detection state')
        checkGeorgian(document.querySelector('.popup'))
        if (!button.disabled) {
          button.click(); await wait()
          check(document.querySelector('.notice').textContent === 'ავტომობილის მონაცემების გადატანის ფუნქცია მალე დაემატება.', 'Popup feedback')
          checkGeorgian(document.querySelector('.popup'))
        }
      ` : `
        await import('/assets/${entry}')
        await wait()
        const host = document.getElementById('global-auto-transporter-launcher')
        check(!!host === ${supported}, 'Only supported domains inject')
        if (host) {
          const shadow = host.shadowRoot
          const launcher = shadow.querySelector('.launcher')
          check(!!launcher, 'Launcher renders in Shadow DOM')
          check(!shadow.querySelector('.panel'), 'Starts closed')
          const icon = launcher.querySelector('img')
          for (let attempt = 0; attempt < 10 && !icon.complete; attempt++) await wait()
          check(icon.complete, 'Launcher image finishes loading')
          check(icon.naturalWidth === 128 && icon.naturalHeight === 128, 'New launcher image loads')
          check(icon.src.endsWith('/icons/auto-importer-128.png'), 'Official icon used')
          const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
          check(getComputedStyle(launcher, '::before').animationName === (reducedMotion ? 'none' : 'launcher-glow'), 'Glow respects motion preferences')
          check(getComputedStyle(launcher).backgroundColor === 'rgb(37, 99, 235)', 'Page styles cannot override button')
          const launcherRect = launcher.getBoundingClientRect()
          check(Math.abs(launcherRect.top - 100) < 1, 'Launcher 100px from top')
          check(Math.abs(innerWidth - launcherRect.right - 16) < 1, 'Launcher 16px from right edge')
          const before = launcher.getBoundingClientRect().bottom
          window.scrollTo(0, 500); await wait()
          check(launcher.getBoundingClientRect().bottom === before, 'Fixed while scrolling')
          launcher.click(); await wait()
          check(!!shadow.querySelector('.panel'), 'Panel opens')
          check(launcher.getAttribute('aria-expanded') === 'true', 'Expanded accessibility state')
          check(shadow.activeElement === shadow.querySelector('.close-button'), 'Panel focus')
          check(shadow.querySelector('.website-name').textContent.length > 0, 'Platform shown')
          check(!!shadow.querySelector('.popup .supported-sites'), 'Shared popup interface rendered')
          check(shadow.querySelector('h1').textContent === 'Auto Importer', 'Shared popup title')
          const companyLogo = shadow.querySelector('.brand-logo img')
          for (let attempt = 0; attempt < 10 && !companyLogo.complete; attempt++) await wait()
          check(companyLogo.complete && companyLogo.naturalWidth > 0, 'Popup company logo loads inside page')
          shadow.querySelector('.import-button').click(); await wait()
          check(shadow.querySelector('.notice').textContent === 'ავტომობილის მონაცემების გადატანის ფუნქცია მალე დაემატება.', 'Panel feedback')
          checkGeorgian(shadow)
          check(shadow.querySelector('.dock').lang === 'ka', 'Georgian panel language')
          const panel = shadow.querySelector('.panel').getBoundingClientRect()
          check(panel.left >= 0 && panel.right <= innerWidth, 'Panel stays within viewport')
          check(panel.right < launcher.getBoundingClientRect().left, 'Panel opens to left of launcher')
          check(Math.abs(panel.width - Math.min(390, innerWidth - 92)) < 1, 'Responsive panel width')
          check(panel.top >= 0 && panel.bottom <= innerHeight, 'Panel stays vertically within viewport')
          shadow.querySelector('.notice').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
          await wait()
          check(!!shadow.querySelector('.panel'), 'Inside click does not close panel')
          shadow.querySelector('.close-button').click(); await wait()
          check(!shadow.querySelector('.panel'), 'Panel closes')
          check(shadow.activeElement === launcher, 'Focus returns to launcher')
          launcher.click(); await wait()
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await wait()
          check(!shadow.querySelector('.panel'), 'Escape closes panel even outside Shadow DOM')
          launcher.click(); await wait()
          const pageControl = document.querySelector('#auction-control')
          pageControl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
          pageControl.focus()
          pageControl.click()
          await wait()
          check(!shadow.querySelector('.panel'), 'Outside pointer closes panel')
          check(document.activeElement === pageControl, 'Outside click preserves page focus')
          check(pageControl.textContent === 'Working', 'Outside click also activates page control')
          launcher.click(); await wait()
          launcher.click(); await wait()
          check(!shadow.querySelector('.panel'), 'Launcher toggles panel closed')
          history.pushState({}, '', '/spa-route')
          await import('/assets/${entry}?reinjection=1'); await wait()
          check(document.querySelectorAll('#global-auto-transporter-launcher').length === 1, 'No duplicates on SPA navigation/reinjection')
          window.scrollTo(0,0); await wait()
          const control = document.querySelector('#auction-control')
          check(document.elementFromPoint(30,30) === control, 'Page controls remain hit-testable')
          control.click()
          check(control.textContent === 'Working', 'Page controls remain functional')
        }
      `}
      check(window.fixtureErrors.length === 0, 'No runtime/console errors: ' + window.fixtureErrors.join('; '))
      document.body.dataset.result = 'PASS'
    } catch (error) { document.body.dataset.result = 'FAIL: ' + error.message }
  </script>`
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const supported = /^(?:[^.]+\.)*(?:manheim\.com|adesa\.com|edgepipeline\.com)$/.test(req.headers.host.split(':')[0])
    if (url.pathname === '/fixture') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html>${monitor}<style>body{height:2000px}button{background:red!important;color:red!important}#auction-control{position:absolute;top:16px;left:16px;width:120px;height:40px}</style><button id="auction-control" onclick="this.textContent='Working'">Auction control</button>${fixture(false, supported)}`)
    } else if (url.pathname === '/popup-fixture') {
      let html = await readFile(join(dist, 'index.html'), 'utf8')
      const state = url.searchParams.get('state') ?? 'ready'
      const query = state === 'loading' ? '()=>new Promise(()=>{})'
        : state === 'error' ? 'async()=>{throw new Error("Fixture error")}'
        : `async()=>[{url:${JSON.stringify(url.searchParams.get('tab'))}}]`
      html = html.replace('<head>', `<head>${monitor}<script>window.chrome={tabs:{query:${query}},runtime:{getManifest:()=>({version:'1.0.0'})}}</script>`)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html.replace('</body>', fixture(true, state === 'ready' && url.searchParams.get('tab') === 'https://manheim.com', state) + '</body>'))
    } else {
      const file = resolve(dist, '.' + url.pathname)
      if (!file.startsWith(dist)) throw new Error('Invalid path')
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(file)] ?? 'text/html')
      res.end(await readFile(file))
    }
  } catch { res.writeHead(404); res.end('Not found') }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = await mkdtemp(join(tmpdir(), 'auto-importer-ui-'))
try {
  const urls = [
    ...['manheim.com','buy.manheim.com','adesa.com','buy.adesa.com','edgepipeline.com','www.edgepipeline.com','myauto.ge','notmanheim.com','manheim.com.example.org'].map(host => `http://${host}:${port}/fixture`),
    ...['https://manheim.com','https://myauto.ge','https://example.com','chrome://extensions','invalid-url'].map(tab => `http://localhost:${port}/popup-fixture?tab=${encodeURIComponent(tab)}`),
    `http://manheim.com:${port}/fixture?motion=reduce`,
    `http://manheim.com:${port}/fixture?viewport=small`,
    ...['loading', 'error'].map(state => `http://localhost:${port}/popup-fixture?state=${state}`),
  ]
  for (const url of urls) {
    const output = await new Promise((resolve, reject) => {
      const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-proxy-server', '--disable-background-networking', `--user-data-dir=${profile}`, '--host-resolver-rules=MAP * 127.0.0.1', ...(url.includes('motion=reduce') ? ['--force-prefers-reduced-motion=reduce'] : []), url.includes('viewport=small') ? '--window-size=390,640' : '--window-size=1000,900', '--virtual-time-budget=5000', '--dump-dom', url], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Chrome timed out')) }, 20000)
      child.on('error', reject)
      child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve(stdout) : reject(new Error(`Chrome exited ${code}: ${stderr.slice(-1500)}`)) })
    })
    const result = output.match(/<body[^>]*data-result="([^"]+)"/)?.[1]
    assert.equal(result, 'PASS', `Browser fixture failed: ${url}: ${result ?? 'Fixture did not finish'}`)
    console.log('PASS', url)
  }
  console.log('Manifest, PNG dimensions, logo integrity, and Georgian text/layout checks in 18 built-UI Chrome fixtures passed.')
} finally {
  server.close()
  await rm(profile, { recursive: true, force: true })
}
