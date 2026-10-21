// Sons e vibração do jogo.
// Os sons são criados na hora com a Web Audio API (a "mesa de som" do navegador),
// sem arquivos de áudio: ruído filtrado para as cartas e notas para os avisos.
// O navegador só deixa tocar som depois do primeiro toque na tela (destravarSom).

export const preferencias = { som: true, vibrar: true };

// As preferências ficam guardadas no aparelho (se o navegador deixar).
try {
  const salvas = JSON.parse(localStorage.getItem('pontinho.preferencias') ?? '{}');
  Object.assign(preferencias, salvas);
} catch { /* sem armazenamento: fica o padrão */ }

export function mudarPreferencia(nome, valor) {
  preferencias[nome] = valor;
  try { localStorage.setItem('pontinho.preferencias', JSON.stringify(preferencias)); } catch { /* ignora */ }
}

let contexto = null;

function mesaDeSom() {
  if (!preferencias.som) return null;
  const Contexto = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Contexto) return null;
  contexto ??= new Contexto();
  if (contexto.state === 'suspended') contexto.resume();
  return contexto;
}

// Chamado no primeiro toque: a partir daí o navegador deixa tocar.
export function destravarSom() {
  mesaDeSom();
}

// Volume que sobe rápido e some aos poucos (o "envelope" do som).
function envelope(c, volume, inicio, duracao) {
  const ganho = c.createGain();
  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.005);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  ganho.connect(c.destination);
  return ganho;
}

// Ruído filtrado: o som de papel, de carta deslizando ou batendo.
function ruido(c, { duracao, frequencia, largura = 1, volume, depois = 0, desliza = false }) {
  const inicio = c.currentTime + depois;
  const amostras = Math.ceil(c.sampleRate * duracao);
  const buffer = c.createBuffer(1, amostras, c.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < amostras; i++) dados[i] = Math.random() * 2 - 1;
  const fonte = c.createBufferSource();
  fonte.buffer = buffer;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = largura;
  filtro.frequency.setValueAtTime(frequencia, inicio);
  if (desliza) filtro.frequency.exponentialRampToValueAtTime(frequencia * 0.4, inicio + duracao);
  fonte.connect(filtro).connect(envelope(c, volume, inicio, duracao));
  fonte.start(inicio);
  fonte.stop(inicio + duracao);
}

// Uma nota musical.
function nota(c, { frequencia, duracao, volume, depois = 0, forma = 'sine' }) {
  const inicio = c.currentTime + depois;
  const oscilador = c.createOscillator();
  oscilador.type = forma;
  oscilador.frequency.setValueAtTime(frequencia, inicio);
  oscilador.connect(envelope(c, volume, inicio, duracao));
  oscilador.start(inicio);
  oscilador.stop(inicio + duracao);
}

const SONS = {
  // "tic" de cada carta distribuída
  carta: c => ruido(c, { duracao: 0.05, frequencia: 3200, largura: 1.4, volume: 0.22 }),
  // "fsst" de carta deslizando (comprar)
  comprar: c => ruido(c, { duracao: 0.16, frequencia: 2400, largura: 0.7, volume: 0.16, desliza: true }),
  // "plac" de carta batendo na mesa (descartar)
  descartar: c => {
    ruido(c, { duracao: 0.07, frequencia: 1100, largura: 0.9, volume: 0.45 });
    nota(c, { frequencia: 150, duracao: 0.08, volume: 0.2, forma: 'triangle' });
  },
  // "plim" de jogo baixado
  baixar: c => {
    nota(c, { frequencia: 880, duracao: 0.14, volume: 0.14 });
    nota(c, { frequencia: 1320, duracao: 0.22, volume: 0.12, depois: 0.07 });
  },
  // sininho de "sua vez"
  suaVez: c => {
    nota(c, { frequencia: 660, duracao: 0.18, volume: 0.1 });
    nota(c, { frequencia: 990, duracao: 0.3, volume: 0.09, depois: 0.11 });
  },
  // fanfarra curta: você bateu
  bati: c => [523, 659, 784, 1047].forEach((f, i) =>
    nota(c, { frequencia: f, duracao: 0.28, volume: 0.13, depois: i * 0.09, forma: 'triangle' })),
  // outra pessoa bateu
  bateuOutro: c => [523, 392].forEach((f, i) =>
    nota(c, { frequencia: f, duracao: 0.3, volume: 0.12, depois: i * 0.14, forma: 'triangle' })),
  // som grave: estourou ou se queimou
  estourou: c => {
    nota(c, { frequencia: 98, duracao: 0.5, volume: 0.28, forma: 'triangle' });
    ruido(c, { duracao: 0.35, frequencia: 300, largura: 0.6, volume: 0.15 });
  },
  queimou: c => {
    nota(c, { frequencia: 165, duracao: 0.2, volume: 0.15, forma: 'sawtooth' });
    nota(c, { frequencia: 123, duracao: 0.35, volume: 0.15, depois: 0.15, forma: 'sawtooth' });
  },
  // "tum" de jogada que não vale
  erro: c => {
    nota(c, { frequencia: 220, duracao: 0.1, volume: 0.1, forma: 'square' });
    nota(c, { frequencia: 175, duracao: 0.14, volume: 0.1, depois: 0.1, forma: 'square' });
  },
};

// Padrões de vibração, em milissegundos (vibra, pausa, vibra…).
const VIBRACOES = {
  descartar: 20, baixar: 25, suaVez: 30,
  bati: [40, 60, 40], bateuOutro: [40, 60, 40],
  estourou: 300, queimou: 300, erro: [30, 40, 30],
};

// vibrar: false para jogadas dos robôs (só som, para o tablet não vibrar o tempo todo).
export function tocar(nome, { vibrar = true } = {}) {
  try {
    const c = mesaDeSom();
    if (c) SONS[nome]?.(c);
  } catch { /* sem som neste aparelho */ }
  if (vibrar && preferencias.vibrar && VIBRACOES[nome] && typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(VIBRACOES[nome]); } catch { /* sem vibração */ }
  }
}
