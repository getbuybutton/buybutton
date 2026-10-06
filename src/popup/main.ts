import { CHAINS, CHAIN_ICONS, CHAIN_IDS } from '../shared/chains'
import { terminalUrl } from '../shared/terminals'
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../shared/settings'

// Dev-only: lets the popup run as a plain page on the test server, backed by localStorage.
if (import.meta.env.DEV && !globalThis.chrome?.storage) await import('../../test/storage-shim')

const SAMPLE_CA = '0x39dBED3a2bd333467115dE45665cC57F813C4571'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const form = $<HTMLFormElement>('form')
const enabled = $<HTMLInputElement>('enabled')
const ref = $<HTMLInputElement>('axiomRef')
const gref = $<HTMLInputElement>('gmgnRef')
const pref = $<HTMLInputElement>('padreRef')
const termInputs = [...document.querySelectorAll<HTMLInputElement>('input[name=terminal]')]
const buy = $<HTMLInputElement>('buyPageUrl')
const tpl = $<HTMLInputElement>('axiomUrlTemplate')
const preview = $<HTMLAnchorElement>('preview')
const status = $<HTMLParagraphElement>('status')
const chainBox = $<HTMLDivElement>('chains')
for (const id of CHAIN_IDS) {
  const chip = document.createElement('label')
  chip.className = 'chip'
  chip.title = CHAINS[id].name
  chip.innerHTML = `<input type="checkbox" value="${id}">${CHAIN_ICONS[id]}<span></span>`
  chip.querySelector('span')!.textContent = CHAINS[id].name
  chainBox.append(chip)
}
const chainInputs = [...chainBox.querySelectorAll<HTMLInputElement>('input')]

const REF_RE = /^[A-Za-z0-9_.-]*$/

// Returns an error message per invalid field, keyed by input id.
function validate(s: Settings): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!REF_RE.test(s.axiomRef)) errors.axiomRef = 'Referral code: letters, digits, _ . - only.'
  if (!REF_RE.test(s.padreRef)) errors.padreRef = 'Referral code: letters, digits, _ . - only.'
  if (!REF_RE.test(s.gmgnRef)) errors.gmgnRef = 'Referral code: letters, digits, _ . - only.'
  if (s.buyPageUrl && !/^https:\/\/[^\s]+$/.test(s.buyPageUrl)) errors.buyPageUrl = 'Buy page URL must start with https://'
  if (!/^https:\/\/[^\s]+$/.test(s.axiomUrlTemplate) || !s.axiomUrlTemplate.includes('{ca}')) errors.axiomUrlTemplate = 'Template must be an https:// URL containing {ca}.'
  if (!s.chains.length) errors.chains = 'Pick at least one chain.'
  return errors
}

function read(): Settings {
  return {
    enabled: enabled.checked,
    chains: chainInputs.filter((i) => i.checked).map((i) => i.value as Settings['chains'][number]),
    axiomRef: ref.value.trim().replace(/^@/, ''),
    terminal: (termInputs.find((i) => i.checked)?.value ?? 'axiom') as Settings['terminal'],
    gmgnRef: gref.value.trim(),
    padreRef: pref.value.trim(),
    buyPageUrl: buy.value.trim(),
    axiomUrlTemplate: tpl.value.trim(),
  }
}

let timer = 0
function save(persist = true) {
  const s = read()
  const errors = validate(s)
  for (const input of [ref, gref, pref, buy, tpl]) input.setAttribute('aria-invalid', String(input.id in errors))
  form.classList.toggle('off', !s.enabled)
  preview.textContent = preview.href = terminalUrl(s, s.terminal === 'gmgn' ? 'base' : 'robinhood', SAMPLE_CA)
  const msgs = Object.values(errors)
  status.className = msgs.length ? 'status err' : 'status'
  // An error in a folded field would be invisible: unfold the section.
  if (Object.keys(errors).some((k) => k !== 'chains')) ($('advanced') as HTMLDetailsElement).open = true
  if (msgs.length) return void (status.textContent = msgs[0])
  if (!persist) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    await chrome.storage.sync.set(s)
    status.textContent = 'Saved'
  }, 250) as unknown as number
}

const s = await loadSettings()
enabled.checked = s.enabled
for (const i of chainInputs) i.checked = s.chains.includes(i.value as Settings['chains'][number])
ref.value = s.axiomRef
gref.value = s.gmgnRef
pref.value = s.padreRef
for (const i of termInputs) i.checked = i.value === s.terminal
buy.value = s.buyPageUrl
tpl.value = s.axiomUrlTemplate
save(false)

for (const el of [enabled, ref, gref, pref, buy, tpl, ...chainInputs, ...termInputs]) el.addEventListener('input', () => save())
$('reset').addEventListener('click', () => {
  tpl.value = DEFAULT_SETTINGS.axiomUrlTemplate
  save()
})
form.addEventListener('submit', (e) => e.preventDefault())
