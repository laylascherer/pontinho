// Chance de vencer a partida a partir do placar, consultando a tabela
// gerada por ferramentas/gerar-tabela-chance.mjs.

import { TABELA_DE_CHANCE } from './tabela-chance.js';
import { CALIBRACAO } from './calibracao-chance.js';

// Os placares que a tabela conhece. Entre eles, a chance é interpolada.
export const PONTOS_DA_TABELA = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

// Cada jogador na tabela = índice do placar + "v" se já gastou a volta.
// Com 2 jogadores ninguém volta (precisa de 2 salvos), então ali a volta não entra.
const jogadorNaChave = (indice, voltou, n) => `${indice}${voltou && n >= 3 ? 'v' : ''}`;

// Chave de uma linha da tabela: eu primeiro, depois os outros em ordem
// (a ordem dos outros não muda a minha chance).
export function chaveDaTabela(eu, outros, n) {
  const ordenados = [...outros].sort((a, b) => a.indice - b.indice || Number(a.voltou) - Number(b.voltou));
  return [eu, ...ordenados].map(j => jogadorNaChave(j.indice, j.voltou, n)).join(',');
}

// Entre quais placares da tabela o valor está, e o peso de cada lado.
function vizinhos(pontos) {
  const p = Math.min(Math.max(pontos, 0), 99);
  const i = PONTOS_DA_TABELA.findIndex(x => x >= p);
  if (PONTOS_DA_TABELA.at(i) === p) return [[i, 1]];
  const a = PONTOS_DA_TABELA.at(i - 1);
  const b = PONTOS_DA_TABELA.at(i);
  const peso = (p - a) / (b - a);
  return [[i - 1, 1 - peso], [i, peso]];
}

// pontos: o placar de cada jogador que ainda está na partida; eu: a posição de quem
// queremos saber; voltou: para cada um, se já gastou a volta (opcional).
// Devolve um número de 0 a 1, com a soma de todos os jogadores dando 1.
export function chanceDeVencer(pontos, eu, voltou = []) {
  const n = pontos.length;
  if (n === 1) return 1;
  const a = CALIBRACAO[n]?.a ?? 1;
  // Corrige cada chance "crua" e reparte para a soma de todos dar 100%.
  const corrigidas = pontos.map((_, i) => calibrar(chanceCrua(pontos, i, voltou), a));
  const total = corrigidas.reduce((s, x) => s + x, 0);
  return corrigidas.at(eu) / total;
}

// Estica (a > 1) ou encolhe (a < 1) a chance na escala de "chances contra" (logit).
export function calibrar(chance, a) {
  if (a === 1) return chance;
  const p = Math.min(Math.max(chance, 0.001), 0.999);
  return 1 / (1 + Math.exp(-a * Math.log(p / (1 - p))));
}

// A chance como a tabela diz, sem calibrar.
export function chanceCrua(pontos, eu, voltou = []) {
  const n = pontos.length;
  if (n === 1) return 1;
  const linhas = TABELA_DE_CHANCE[n];
  const ordem = [eu, ...[...pontos.keys()].filter(x => x !== eu)];
  // Interpolação: mistura as linhas da tabela em volta do placar, cada uma com o seu peso.
  let combinacoes = [[[], 1]];
  for (const jogador of ordem) {
    combinacoes = combinacoes.flatMap(([indices, peso]) =>
      vizinhos(pontos.at(jogador)).map(([i, w]) => [[...indices, i], peso * w]));
  }
  let chance = 0;
  for (const [indices, peso] of combinacoes) {
    if (peso === 0) continue;
    const jogadores = indices.map((indice, k) => ({ indice, voltou: !!voltou.at(ordem.at(k)) }));
    const [meu, ...dosOutros] = jogadores;
    chance += (peso * linhas[chaveDaTabela(meu, dosOutros, n)]) / 1000; // a tabela guarda milésimos
  }
  return chance;
}
