// Cartas e baralho do Pontinho: 2 baralhos, sem coringa (104 cartas).

export const NAIPES = ['♠', '♥', '♦', '♣'];

// Posição de cada carta na ordem do baralho: A=1 … K=13.
export const NOMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

export function nomeDoValor(valor) {
  return NOMES[valor] ?? String(valor);
}

export const PONTOS_DO_CURINGA = 15;

export const corDoNaipe = naipe => (naipe === '♥' || naipe === '♦' ? 'vermelha' : 'preta');

// O curinga da rodada: mesmo número da carta virada, nos dois naipes da cor contrária.
// Virou 7♥ (vermelha) → 7♠ e 7♣ são curinga.
export function curingaDaVirada(virada) {
  return { valor: virada.valor, cor: corDoNaipe(virada.naipe) === 'vermelha' ? 'preta' : 'vermelha' };
}

export function ehCuringa(curinga, carta) {
  return !!curinga && carta.valor === curinga.valor && corDoNaipe(carta.naipe) === curinga.cor;
}

// Pontos que a carta vale na mão: número = o próprio número; A, J, Q, K = 10; curinga = 15.
export function pontosDaCarta(carta, curinga = null) {
  if (ehCuringa(curinga, carta)) return PONTOS_DO_CURINGA;
  return carta.valor >= 2 && carta.valor <= 10 ? carta.valor : 10;
}

export function pontosNaMao(cartas, curinga = null) {
  return cartas.reduce((soma, c) => soma + pontosDaCarta(c, curinga), 0);
}

export function textoDaCarta(carta) {
  return nomeDoValor(carta.valor) + carta.naipe;
}

// Cria os 2 baralhos. O id diferencia as cartas repetidas (ex.: os dois 7♥).
export function criarBaralho() {
  const cartas = [];
  for (let baralho = 0; baralho < 2; baralho++) {
    for (const naipe of NAIPES) {
      for (let valor = 1; valor <= 13; valor++) {
        cartas.push({ id: `${nomeDoValor(valor)}${naipe}-${baralho}`, valor, naipe });
      }
    }
  }
  return cartas;
}

// Embaralha no lugar (algoritmo de Fisher-Yates). O sorteio pode vir de fora para os testes.
export function embaralhar(cartas, sorteio = Math.random) {
  for (let i = cartas.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [cartas[i], cartas[j]] = [cartas[j], cartas[i]];
  }
  return cartas;
}

// Sorteio com "semente": sempre gera a mesma ordem para a mesma semente (útil em testes).
export function sorteioComSemente(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
