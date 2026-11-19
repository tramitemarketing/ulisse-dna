// Costruisce un unico file HTML autosufficiente (funziona anche senza internet e da file://).
import * as esbuild from "esbuild";
import fs from "node:fs";
const r = await esbuild.build({ entryPoints: ["src/main.js"], bundle: true, minify: true, format: "iife", write: false, target: "es2020", legalComments: "none" });
const js = r.outputFiles[0].text;
const font = (f) => fs.readFileSync(f).toString("base64");
const fonts = `@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${font("node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2")}) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Geist Mono";src:url(data:font/woff2;base64,${font("node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2")}) format("woff2");font-weight:100 900;font-display:swap}`;
const css = fs.readFileSync("src/style.css", "utf8").replace("/*FONTS*/", () => fonts);
let html = fs.readFileSync("src/index.html", "utf8");
// il programma parte dopo il primo disegno della pagina: così la schermata di caricamento
// compare subito anche sulle LIM lente, invece di restare bianca finché il 3D non è pronto
const start = `window.__ulisseStart=function(){${js}};requestAnimationFrame(function(){setTimeout(function(){window.__ulisseStart()},0)});`;
html = html.replace("/*CSS*/", () => css).replace("/*JS*/", () => start.replace(/<\/script/gi, "<\\/script"));
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/dna-elica.html", html);
fs.mkdirSync("deploy", { recursive: true });
fs.writeFileSync("deploy/index.html", html); // cartella pubblicata su Cloudflare
console.log("dist/dna-elica.html", (html.length / 1024).toFixed(0), "KB");
