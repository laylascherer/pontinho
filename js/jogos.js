// Regras dos jogos que vão para a mesa: sequência e trinca.
//
// As funções recebem as "regras da rodada":
//   curinga   → qual carta é curinga nesta rodada (ou null)
//   podePonta → true só na jogada de bater: aí o curinga também pode ir na ponta

import { NAIPES, ehCuringa } from './cartas.js';

// Posição na sequência: o Ás pode ser 1 (antes do 2) ou 14 (depois do K).
export const posicoesDe = c => (c.valor === 1 ? [1, 14] : [c.valor]);
export const valorNaPosicao = pos => (pos === 14 ? 1 : pos);

// Todos os jeitos de escolher algumas cartas da lista, dos menores para os maiores.
function escolhas(lista) {
  const todas = [[]];
  for (const item of lista) {
    for (const atual of [...todas]) todas.push([...atual, item]);
  }
  return todas.sort((a, b) => a.length - b.length);
}

// Todas as combinações de posição para as cartas (só o Ás tem duas).
function* combinacoesDePosicao(cartas, i = 0, atual = []) {
  if (i === cartas.length) { yield atual; return; }
  for (const pos of posicoesDe(cartas.at(i))) yield* combinacoesDePosicao(cartas, i + 1, [...atual, pos]);
}

// Monta a sequência: as cartas fixas ficam nas suas posições, os curingas
// tapam os buracos e o que sobrar de curinga vai para as pontas (só se podePonta).
function montar(fixas, curingas, podePonta) {
  const posicoes = [...fixas.keys()];
  const min = Math.min(...posicoes);
  const max = Math.max(...posicoes);
  const buracos = max - min + 1 - fixas.size;
  const sobra = curingas.length - buracos;
  if (sobra < 0 || (sobra > 0 && !podePonta)) return null;
  const acima = Math.min(sobra, 14 - max);
  const abaixo = sobra - acima;
  if (min - abaixo < 1) return null;
  const inicio = min - abaixo;
  const livres = [...curingas];
  const cartas = [];
  for (let p = inicio; p <= max + acima; p++) cartas.push(fixas.get(p) ?? livres.shift());
  if (cartas.length < 3) return null;
  return { tipo: 'sequencia', cartas, inicio, curingas: curingas.map(c => c.id) };
}

// Sequência: 3 ou mais cartas seguidas do mesmo naipe.
// O Ás pode vir no começo (A-2-3) ou no fim (Q-K-A), mas não dá a volta (K-A-2).
// O curinga tapa um buraco no meio; na ponta, só para bater.
export function analisarSequencia(cartas, { curinga = null, podePonta = false } = {}) {
  if (cartas.length < 3) return null;
  const podemSerCuringa = cartas.filter(c => ehCuringa(curinga, c));
  // Tenta primeiro usar o mínimo de curingas (a carta curinga também vale como ela mesma).
  for (const curingas of escolhas(podemSerCuringa)) {
    const normais = cartas.filter(c => !curingas.includes(c));
    if (normais.length === 0 || !normais.every(c => c.naipe === normais[0].naipe)) continue;
    for (const posicoes of combinacoesDePosicao(normais)) {
      if (new Set(posicoes).size !== posicoes.length) continue;
      const jogo = montar(new Map(posicoes.map((p, i) => [p, normais.at(i)])), curingas, podePonta);
      if (jogo) return jogo;
    }
  }
  return null;
}

// Trinca: exatamente 3 cartas do mesmo número, de naipes diferentes (o 4º naipe fica de fora).
// O curinga não entra em trinca como curinga, só como a carta que ele é.
export function analisarTrinca(cartas) {
  if (cartas.length !== 3) return null;
  if (!cartas.every(c => c.valor === cartas[0].valor)) return null;
  if (new Set(cartas.map(c => c.naipe)).size !== cartas.length) return null;
  return { tipo: 'trinca', cartas: [...cartas] };
}

// Diz se as cartas formam um jogo válido (e qual). Devolve null se não formam.
export function analisarJogo(cartas, regras = {}) {
  return analisarSequencia(cartas, regras) ?? analisarTrinca(cartas);
}

// Onde a sequência começa (os jogos guardam isso; nos antigos, a 1ª carta diz).
export const inicioDe = jogo => jogo.inicio ?? jogo.cartas[0].valor;
export const naipeDe = jogo => jogo.cartas.find(c => !(c.id in (jogo.curingas ?? {}))).naipe;

// Tenta encaixar cartas num jogo que já está na mesa. Devolve o jogo novo ou null.
export function analisarEncaixe(jogo, novasCartas, { curinga = null, podePonta = false } = {}) {
  if (novasCartas.length === 0) return null;
  if (jogo.tipo === 'trinca') {
    // Trinca: já nasce completa (3 cartas, 3 naipes) e não aceita mais nenhuma carta.
    return null;
  }

  // Sequência: as cartas da mesa ficam onde estão; as novas entram pelas pontas.
  const inicio = inicioDe(jogo);
  const naipe = naipeDe(jogo);
  const naMesa = new Map(jogo.cartas.map((c, i) => [inicio + i, c]));
  const curingasDaMesa = Object.keys(jogo.curingas ?? {});
  const podemSerCuringa = novasCartas.filter(c => ehCuringa(curinga, c));
  for (const curingas of escolhas(podemSerCuringa)) {
    const normais = novasCartas.filter(c => !curingas.includes(c));
    if (!normais.every(c => c.naipe === naipe)) continue;
    for (const posicoes of combinacoesDePosicao(normais)) {
      if (new Set(posicoes).size !== posicoes.length || posicoes.some(p => naMesa.has(p))) continue;
      const fixas = new Map([...naMesa, ...posicoes.map((p, i) => [p, normais.at(i)])]);
      const novo = montar(fixas, curingas, podePonta);
      if (novo) return { ...novo, curingas: [...curingasDaMesa, ...novo.curingas] };
    }
  }
  return null;
}

// Descartar esta carta queima? Sim se ela encaixa em algum jogo da mesa, ou se é a
// repetida (mesmo número e naipe) de uma carta de alguma trinca da mesa.
export function queimaNaMesa(mesa, carta, regras = {}) {
  return mesa.some(jogo => analisarEncaixe(jogo, [carta], regras) ||
    (jogo.tipo === 'trinca' && jogo.cartas.some(c => c.valor === carta.valor && c.naipe === carta.naipe)));
}

// Procura jogos possíveis numa mão (usado pelos robôs e, mais tarde, pela dica).
// Devolve listas de cartas; um jogo pode repetir cartas de outro.
// Primeiro os jogos sem curinga; depois os que usam curinga no meio.
export function encontrarJogos(cartas, curinga = null) {
  const achados = [];

  // Trincas: 3 cartas do mesmo número, de naipes diferentes.
  for (let valor = 1; valor <= 13; valor++) {
    const porNaipe = new Map();
    for (const c of cartas) {
      if (c.valor === valor && !porNaipe.has(c.naipe)) porNaipe.set(c.naipe, c);
    }
    if (porNaipe.size >= 3) achados.push([...porNaipe.values()].slice(0, 3));
  }

  // Sequências: o maior trecho seguido de cada naipe (o Ás conta como 1 e como 14).
  for (const naipe of NAIPES) {
    const porPosicao = new Map();
    for (const c of cartas) {
      if (c.naipe !== naipe) continue;
      for (const pos of posicoesDe(c)) if (!porPosicao.has(pos)) porPosicao.set(pos, c);
    }
    let trecho = [];
    for (let pos = 1; pos <= 15; pos++) {
      const c = porPosicao.get(pos);
      if (c) {
        trecho.push(c);
      } else {
        if (trecho.length >= 3) achados.push(trecho);
        trecho = [];
      }
    }
  }

  // Sequências com curinga tapando buracos no meio.
  const curingas = cartas.filter(c => ehCuringa(curinga, c));
  if (curingas.length === 0) return achados;
  for (const naipe of NAIPES) {
    const porPosicao = new Map();
    for (const c of cartas) {
      if (c.naipe !== naipe || curingas.includes(c)) continue;
      for (const pos of posicoesDe(c)) if (!porPosicao.has(pos)) porPosicao.set(pos, c);
    }
    const posicoes = [...porPosicao.keys()].sort((a, b) => a - b);
    for (let i = 0; i < posicoes.length; i++) {
      for (let k = posicoes.length - 1; k > i; k--) {
        const a = posicoes.at(i);
        const b = posicoes.at(k);
        const normais = [...new Set(posicoes.filter(p => p >= a && p <= b).map(p => porPosicao.get(p)))];
        const faltam = b - a + 1 - normais.length;
        if (faltam < 1 || faltam > curingas.length || b - a < 2) continue;
        const grupo = [...normais, ...curingas.slice(0, faltam)];
        if (analisarSequencia(grupo, { curinga })) achados.push(grupo);
      }
    }
  }
  return achados;
}
