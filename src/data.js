// Coordinate standard delle basi nel loro sistema di riferimento (Å).
// Fonte: Olson et al. (2001) "A standard reference frame for the description of
// nucleic acid base-pair geometry", J. Mol. Biol. 313:229-237 (file Atomic_*.pdb di 3DNA).
// Asse x verso il solco maggiore, y verso il filamento I, z lungo l'elica.
export const STD_BASES = {
  A: {
    "C1'": [-2.479, 5.346, 0.0], N9: [-1.291, 4.498, 0.0], C8: [0.024, 4.897, 0.0], N7: [0.877, 3.902, 0.0],
    C5: [0.071, 2.771, 0.0], C6: [0.369, 1.398, 0.0], N6: [1.611, 0.909, 0.0], N1: [-0.668, 0.532, 0.0],
    C2: [-1.912, 1.023, 0.0], N3: [-2.32, 2.29, 0.0], C4: [-1.267, 3.124, 0.0],
  },
  G: {
    "C1'": [-2.477, 5.399, 0.0], N9: [-1.289, 4.551, 0.0], C8: [0.023, 4.962, 0.0], N7: [0.87, 3.969, 0.0],
    C5: [0.071, 2.833, 0.0], C6: [0.424, 1.46, 0.0], O6: [1.554, 0.955, 0.0], N1: [-0.7, 0.641, 0.0],
    C2: [-1.999, 1.087, 0.0], N2: [-2.949, 0.139, -0.001], N3: [-2.342, 2.364, 0.001], C4: [-1.265, 3.177, 0.0],
  },
  C: {
    "C1'": [-2.477, 5.402, 0.0], N1: [-1.285, 4.542, 0.0], C2: [-1.472, 3.158, 0.0], O2: [-2.628, 2.709, 0.001],
    N3: [-0.391, 2.344, 0.0], C4: [0.837, 2.868, 0.0], N4: [1.875, 2.027, 0.001], C5: [1.056, 4.275, 0.0],
    C6: [-0.023, 5.068, 0.0],
  },
  T: {
    "C1'": [-2.481, 5.354, 0.0], N1: [-1.284, 4.5, 0.0], C2: [-1.462, 3.135, 0.0], O2: [-2.562, 2.608, 0.0],
    N3: [-0.298, 2.407, 0.0], C4: [0.994, 2.897, 0.0], O4: [1.944, 2.119, 0.0], C5: [1.106, 4.338, 0.0],
    C7: [2.466, 4.961, 0.001], C6: [-0.024, 5.057, 0.0],
  },
  U: {
    "C1'": [-2.481, 5.354, 0.0], N1: [-1.284, 4.5, 0.0], C2: [-1.462, 3.135, 0.0], O2: [-2.562, 2.608, 0.0],
    N3: [-0.298, 2.407, 0.0], C4: [0.994, 2.897, 0.0], O4: [1.944, 2.119, 0.0], C5: [1.106, 4.338, 0.0],
    C6: [-0.024, 5.057, 0.0],
  },
};

export const BASE_BONDS = {
  A: [["C1'", "N9"], ["N9", "C8"], ["C8", "N7"], ["N7", "C5"], ["C5", "C6"], ["C6", "N6"], ["C6", "N1"], ["N1", "C2"], ["C2", "N3"], ["N3", "C4"], ["C4", "C5"], ["C4", "N9"]],
  G: [["C1'", "N9"], ["N9", "C8"], ["C8", "N7"], ["N7", "C5"], ["C5", "C6"], ["C6", "O6"], ["C6", "N1"], ["N1", "C2"], ["C2", "N2"], ["C2", "N3"], ["N3", "C4"], ["C4", "C5"], ["C4", "N9"]],
  C: [["C1'", "N1"], ["N1", "C2"], ["C2", "O2"], ["C2", "N3"], ["N3", "C4"], ["C4", "N4"], ["C4", "C5"], ["C5", "C6"], ["C6", "N1"]],
  T: [["C1'", "N1"], ["N1", "C2"], ["C2", "O2"], ["C2", "N3"], ["N3", "C4"], ["C4", "O4"], ["C4", "C5"], ["C5", "C7"], ["C5", "C6"], ["C6", "N1"]],
  U: [["C1'", "N1"], ["N1", "C2"], ["C2", "O2"], ["C2", "N3"], ["N3", "C4"], ["C4", "O4"], ["C4", "C5"], ["C5", "C6"], ["C6", "N1"]],
};

// Atomi dello scheletro (zucchero + fosfato) di ogni nucleotide.
export const BACKBONE_ATOMS = ["P", "OP1", "OP2", "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'"];
export const BACKBONE_BONDS = [
  ["P", "OP1"], ["P", "OP2"], ["P", "O5'"], ["O5'", "C5'"], ["C5'", "C4'"], ["C4'", "O4'"], ["O4'", "C1'"],
  ["C4'", "C3'"], ["C3'", "C2'"], ["C2'", "C1'"], ["C3'", "O3'"],
];

// Legami a idrogeno Watson-Crick: [atomo sulla base del filamento I, atomo sulla complementare]
export const HBONDS = {
  AT: [["N6", "O4"], ["N1", "N3"]], TA: [["O4", "N6"], ["N3", "N1"]],
  AU: [["N6", "O4"], ["N1", "N3"]], UA: [["O4", "N6"], ["N3", "N1"]],
  GC: [["O6", "N4"], ["N1", "N3"], ["N2", "O2"]], CG: [["N4", "O6"], ["N3", "N1"], ["O2", "N2"]],
};

export const COMPLEMENT = { A: "T", T: "A", G: "C", C: "G", U: "A" };
export const PURINES = new Set(["A", "G"]);

export const BASE_INFO = {
  A: { nome: "adenina", tipo: "purina (due anelli)", colore: "#4cc38a" },
  T: { nome: "timina", tipo: "pirimidina (un anello)", colore: "#e4606d" },
  G: { nome: "guanina", tipo: "purina (due anelli)", colore: "#e8b84a" },
  C: { nome: "citosina", tipo: "pirimidina (un anello)", colore: "#5a9be0" },
  U: { nome: "uracile", tipo: "pirimidina (un anello) — solo nell'RNA", colore: "#f08ac0" },
};

export const ELEMENTS = {
  C: { nome: "carbonio", colore: "#a9a399", vdw: 1.7, bs: 0.3 },
  N: { nome: "azoto", colore: "#6f8fff", vdw: 1.55, bs: 0.3 },
  O: { nome: "ossigeno", colore: "#ff5c5c", vdw: 1.52, bs: 0.3 },
  P: { nome: "fosforo", colore: "#ff9f1c", vdw: 1.8, bs: 0.42 },
};

// Nomi parlanti degli atomi (per la scheda informativa)
export const ATOM_ROLE = {
  P: "fosforo del gruppo fosfato (carica negativa: per questo il DNA è un acido)",
  OP1: "ossigeno del fosfato", OP2: "ossigeno del fosfato",
  "O5'": "ossigeno 5′ (lega il fosfato al carbonio 5′)",
  "C5'": "carbonio 5′ dello zucchero", "C4'": "carbonio 4′ dello zucchero",
  "O4'": "ossigeno dell'anello del desossiribosio", "C3'": "carbonio 3′ dello zucchero",
  "O3'": "ossigeno 3′ (si lega al fosfato del nucleotide successivo)",
  "C2'": "carbonio 2′: nel DNA non ha l'ossigeno (desossi-ribosio)",
  "C1'": "carbonio 1′: qui lo zucchero si attacca alla base (legame glicosidico)",
};

// Codice genetico standard (codoni sul filamento senso, 5'→3').
const AA = {
  F: "Phe", L: "Leu", I: "Ile", M: "Met", V: "Val", S: "Ser", P: "Pro", T: "Thr", A: "Ala", Y: "Tyr",
  H: "His", Q: "Gln", N: "Asn", K: "Lys", D: "Asp", E: "Glu", C: "Cys", W: "Trp", R: "Arg", G: "Gly", "*": "STOP",
};
export const AA_NOME = {
  F: "fenilalanina", L: "leucina", I: "isoleucina", M: "metionina (ATG è anche il segnale d'inizio)", V: "valina", S: "serina", P: "prolina",
  T: "treonina", A: "alanina", Y: "tirosina", H: "istidina", Q: "glutammina", N: "asparagina", K: "lisina",
  D: "acido aspartico", E: "acido glutammico", C: "cisteina", W: "triptofano", R: "arginina", G: "glicina", "*": "stop",
};
const BASES = "TCAG";
const CODE = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
export function translate(codon) {
  const i = BASES.indexOf(codon[0]) * 16 + BASES.indexOf(codon[1]) * 4 + BASES.indexOf(codon[2]);
  const a = CODE[i];
  return { lettera: a, sigla: AA[a], nome: AA_NOME[a] };
}

// Sequenze pronte (filamento I, 5'→3')
export const PRESETS = [
  {
    id: "hbb", nome: "Gene dell'emoglobina (HBB)",
    seq: "ATGGTGCATCTGACTCCTGAGGAGAAGTCT",
    nota: "Inizio del gene umano della β-globina (HBB): Met-Val-His-Leu-Thr-Pro-Glu-Glu-Lys-Ser.",
  },
  {
    id: "falciforme", nome: "Anemia falciforme (HBB mutato)",
    seq: "ATGGTGCATCTGACTCCTGTGGAGAAGTCT",
    nota: "Una sola lettera cambiata: A→T nel codone GAG→GTG, e l'acido glutammico diventa valina. È la mutazione dell'anemia falciforme (Glu6Val: in medicina si chiama codone 6 perché non si conta la metionina iniziale; nella striscia in basso è il 7° codone).",
    mutPos: 19,
  },
  { id: "ecori", nome: "Sito EcoRI (palindromo)", seq: "CGCGAATTCGCG", nota: "Il dodecamero di Dickerson (PDB 1BNA): contiene GAATTC, il sito tagliato dall'enzima di restrizione EcoRI. È palindromo: il complementare letto 5'→3' è identico." },
  { id: "tata", nome: "TATA box", seq: "GCTATAAAAGGGCA", nota: "Il «TATA box» degli eucarioti: una zona ricca di A e T circa 25–30 coppie prima del punto in cui inizia la trascrizione, dove si lega la proteina TBP. Con poche coppie G-C l'elica si apre più facilmente." },
  { id: "gc", nome: "Ricco di G-C", seq: "GCGGCCGCGGCCGGCG", nota: "Solo G e C: tre legami a idrogeno per coppia e un impilamento delle basi più forte, quindi più stabile (temperatura di fusione più alta)." },
  { id: "zdna", nome: "CGCGCG… (forma Z)", seq: "CGCGCGCGCGCGCGCGCGCGCGCG", nota: "Alternanza C-G: è la sequenza che forma più facilmente la forma Z, sinistrorsa." },
];
