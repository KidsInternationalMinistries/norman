// Site settings shared by every talk page.
window.TALKS_CONFIG = {
  owner: "KidsInternationalMinistries",
  repo: "norman",
  branch: "main",
  root: "talks",                       // folder in the repo that holds one folder per talk
  relay: "https://norman.normandenler.workers.dev", // our Cloudflare relay (repo folder relay/; was https://ntfy.sh) that carries the presenter's "Next" to every monitor
  // SHA-256 of the presenter/editor password (light lock, not real security)
  passHash: "e71254c198a09cf653bf5e3657100763e6976012a25dea03ea3f34207882d7dd"
};
