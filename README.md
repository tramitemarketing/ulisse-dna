# Ulisse — un viaggio dentro il DNA

Sito in 3D per esplorare la doppia elica del DNA atomo per atomo: misure con il righello, forme A/B/Z, mutazioni con effetto sul codone, formula chimica della coppia scelta, replicazione animata e confronto di scala dal DNA al capello.

**Sito online:** vedi il link nella descrizione del repository.

## Come è fatto

- `src/` — il codice (JavaScript + [three.js](https://threejs.org/)):
  - `main.js` interfaccia e modalità · `view.js` disegno della molecola · `model.js` costruzione degli atomi
  - `replication.js` replicazione · `scale.js` confronto di scala · `formula.js` formule chimiche
  - `data.js` basi standard, codice genetico, sequenze di esempio · `forms.json` geometria delle forme
  - `index.html` e `style.css` pagina e grafica
- `tools/derive.mjs` ricava la geometria dai cristalli in `pdb/` (1BNA, 440D, 1DCG); `tools/refine.mjs` richiude i legami O3′–P; `tools/check.mjs` stampa le misure di controllo.
- `dist/dna-elica.html` — il sito finito: **un solo file** che funziona anche senza internet.

## Modificarlo

```bash
npm install          # una volta sola
node build.mjs       # ricostruisce dist/dna-elica.html da src/
node tools/check.mjs # controlla le misure (salita, solchi, legami H…)
```

Per vederlo basta aprire `dist/dna-elica.html` nel browser.

## Pubblicarlo

Il sito sta su Cloudflare (Workers con file statici, la versione nuova di Pages): https://ulisse-dna.tramitemarketing-it.workers.dev

```bash
npm run pubblica     # ricostruisce e pubblica (serve `npx wrangler login` sull'account giusto)
```

## Fonti

- Coordinate: PDB 1BNA (Drew et al., PNAS 1981), 440D (A-DNA, 1999), 1DCG (Z-DNA, Gessner et al. 1989).
- Basi: Olson et al. (2001), *J. Mol. Biol.* 313:229 — sistema di riferimento standard delle coppie di basi.

Costruito con Claude (Anthropic).
