// O treinador: avalia as escolhas da pessoa simulando o resto da rodada.
//
// Uma "decisão" guarda uma foto da partida no momento da escolha, quem escolheu,
// o tipo (compra | descarte | baixar), as opções que havia e qual foi escolhida.
// Para cada opção, o resto da rodada é jogado muitas vezes pelos robôs Espertos;
// o placar do fim vira chance de vencer a partida pela tabela (js/chance.js).
//
// O treinador só usa o que a pessoa sabia: a cada simulação, as cartas que ela não
// via (mãos dos outros e monte) são sorteadas de novo.

import { criarBaralho, embaralhar, sorteioComSemente, textoDaCarta, ehCuringa } from './cartas.js';
import { encontrarJogos, posicoesDe, valorNaPosicao } from './jogos.js';
import { decidirVolta, jogadoresAtivos, podeAmeacar } from './partida.js';
import { proximaAcao, executarAcao, planoParaBater, jogadaCom, descarteSegurando } from './robo.js';
import { chanceDeVencer } from './chance.js';

// ---------- Registrar uma decisão ----------

// Devolve null quando não há o que analisar (nenhuma opção, ou a jogada feita não está entre elas).
export function registrarDecisao(partida, id, tipo, acaoFeita) {
  const foto = structuredClone(partida);
  const opcoes = opcoesDaDecisao(foto, id, tipo, acaoFeita);
  const escolhida = opcoes.findIndex(o => mesmaAcao(o.acao, acaoFeita) || (o.segurar && acaoFeita.tipo !== 'baixarJogo'));
  if (opcoes.length === 0 || escolhida < 0) return null;
  return { foto, id, tipo, opcoes, escolhida };
}

const mesmaAcao = (a, b) =>
  a.tipo === b.tipo && a.cartaId === b.cartaId &&
  (a.ids ?? []).slice().sort().join() === (b.ids ?? []).slice().sort().join();

export function opcoesDaDecisao(partida, id, tipo, acaoFeita) {
  const mao = partida.jogadores[id].mao;
  if (tipo === 'compra') {
    const opcoes = [{ rotulo: 'Comprar do monte', acao: { tipo: 'comprarDoMonte' } }];
    const deCima = partida.lixo.at(-1);
    if (deCima && !partida.jogadores[id].queimado && jogadaCom(partida, [...mao, deCima], deCima)) {
      opcoes.push({ rotulo: `Pegar o ${textoDaCarta(deCima)} do lixo`, acao: { tipo: 'comprarDoLixo' } });
    }
    return opcoes;
  }
  if (tipo === 'descarte') {
    // Uma opção por carta diferente (as duas cópias do mesmo 7♥ dão no mesmo).
    const vistas = new Set();
    const opcoes = [];
    for (const c of mao) {
      const nome = textoDaCarta(c);
      if (c.id === partida.cartaDoLixo || vistas.has(nome)) continue;
      vistas.add(nome);
      // A carta feita usa o id exato; a cópia, se houver, cai na mesma opção.
      const feita = mao.find(x => x.id === acaoFeita?.cartaId);
      const cartaId = feita && textoDaCarta(feita) === nome ? feita.id : c.id;
      opcoes.push({ rotulo: `Descartar ${nome}`, acao: { tipo: 'descartar', cartaId } });
    }
    return opcoes;
  }
  // baixar: segurar (o que a pessoa fez em seguida, ou o descarte do Esperto) ou baixar cada jogo.
  const segurar = acaoFeita && acaoFeita.tipo !== 'baixarJogo' ? acaoFeita : descarteSegurando(partida, id);
  const opcoes = [{ rotulo: 'Segurar os jogos na mão', acao: segurar, segurar: true }];
  for (const jogo of encontrarJogos(mao, partida.curinga)) {
    opcoes.push({ rotulo: `Baixar ${jogo.map(textoDaCarta).join(' ')}`, acao: { tipo: 'baixarJogo', ids: jogo.map(c => c.id) } });
  }
  return opcoes;
}

// ---------- Sortear o que a pessoa não via ----------

// Cartas que a pessoa viu: a própria mão, a mesa, o lixo e a carta virada.
function idsVistos(partida, id) {
  return new Set([
    ...partida.jogadores[id].mao, ...partida.lixo, ...partida.mesa.flatMap(j => j.cartas), partida.virada,
  ].filter(Boolean).map(c => c.id));
}

// Cartas que com certeza estão na mão de cada adversário: pegou do lixo e não apareceram de novo.
function cartasCertas(partida, id, vistos) {
  const certas = {};
  for (const j of partida.jogadores) {
    if (j.id === id) continue;
    certas[j.id] = (partida.pegasDoLixo?.[j.id] ?? []).filter(c => !vistos.has(c.id));
  }
  return certas;
}

// Uma versão da partida com as mãos dos outros e o monte sorteados de novo,
// respeitando o que a pessoa sabia (quantas cartas cada um tem, o que ele pegou do lixo).
export function sortearEscondidas(foto, id, sorteio) {
  const p = structuredClone(foto);
  const vistos = idsVistos(p, id);
  const certas = cartasCertas(p, id, vistos);
  const conhecidos = new Set([...vistos, ...Object.values(certas).flat().map(c => c.id)]);
  const escondidas = embaralhar(criarBaralho().filter(c => !conhecidos.has(c.id)), sorteio);
  for (const j of p.jogadores) {
    if (j.id === id || j.situacao !== 'jogando') continue;
    const fixas = certas[j.id];
    j.mao = [...fixas, ...escondidas.splice(0, j.mao.length - fixas.length)];
  }
  p.monte = escondidas;
  p.tentativa = null;
  return p;
}

// ---------- Jogar o resto da rodada ----------

// ultimoLixo: a carta que já estava em cima do lixo antes da jogada (ninguém pifou com ela).
export function jogarAteOFimDaRodada(p, ultimoLixo) {
  for (let passos = 0; passos < 20000; passos++) {
    if (!['comprar', 'jogar', 'batendo'].includes(p.fase)) break;
    if (p.fase === 'batendo') {
      executarAcao(p, p.vez, proximaAcao(p, p.vez));
      continue;
    }
    // Pifado: alguém bate fora da vez com a carta nova do lixo?
    const deCima = p.lixo.at(-1);
    if (deCima && deCima.id !== ultimoLixo) {
      ultimoLixo = deCima.id;
      const quem = p.jogadores.find(j => podeAmeacar(p, j.id) && planoParaBater(p, j.id, deCima));
      if (quem) {
        executarAcao(p, quem.id, { tipo: 'ameacar' });
        continue;
      }
    }
    executarAcao(p, p.vez, proximaAcao(p, p.vez, 'esperto'));
  }
  while (p.fase === 'decidirVolta') {
    const j = p.jogadores.find(x => x.situacao === 'estourou');
    decidirVolta(p, j.id, true);
  }
  return p;
}

// Resultado de uma simulação, do ponto de vista de quem decidiu.
function resultado(p, id) {
  const eu = p.jogadores[id];
  let chance;
  if (p.fase === 'fimDoJogo') chance = p.vencedor === id ? 1 : 0;
  else if (eu.situacao !== 'jogando') chance = 0;
  else {
    const ativos = jogadoresAtivos(p);
    const voltou = ativos.map(j => j.voltas >= p.config.maxVoltas);
    chance = chanceDeVencer(ativos.map(j => j.pontos), ativos.findIndex(j => j.id === id), voltou);
  }
  return { chance, somou: p.ultimaRodada?.somou?.[id] ?? 0, bateu: p.ultimaRodada?.quemBateu === id ? 1 : 0 };
}

export function simularOpcao(decisao, opcao, semente) {
  const p = sortearEscondidas(decisao.foto, decisao.id, sorteioComSemente(semente));
  executarAcao(p, decisao.id, opcao.acao);
  jogarAteOFimDaRodada(p, decisao.foto.lixo.at(-1)?.id);
  return resultado(p, decisao.id);
}

// ---------- Analisar uma decisão ----------

const LIMITE_BOA = 0.01; // perdeu até 1 ponto percentual de chance: boa
const LIMITE_OK = 0.03;  // até 3 pontos: ok; mais que isso (e fora da margem): dava melhor

const media = (lista, campo) => lista.reduce((s, r) => s + r[campo], 0) / lista.length;

// Todas as opções jogam com os mesmos sorteios (a diferença vem da escolha, não da sorte).
// Etapa curta: poucas simulações para todas, só para escolher as finalistas (as 3 melhores
// e a escolhida). Etapa longa: sorteios NOVOS, só para as finalistas. A nota usa só a etapa
// longa, para a sorte que fez uma opção parecer boa na etapa curta não inflar o resultado.
export function analisarDecisao(decisao, { simulacoes = 200, semente = 1, aoProgredir = () => {} } = {}) {
  const { opcoes, escolhida } = decisao;
  const rodadas = opcoes.map(() => []); // resultado de cada simulação, na mesma ordem para todas
  const curta = Math.max(1, Math.min(40, Math.floor(simulacoes / 4)));
  let total = curta * opcoes.length + (simulacoes - curta) * Math.min(opcoes.length, 4);
  let feitas = 0;

  const rodar = (indices, de, ate) => {
    for (let k = de; k < ate; k++) {
      for (const i of indices) {
        rodadas[i].push(simularOpcao(decisao, opcoes.at(i), semente * 100003 + k));
        aoProgredir(++feitas / total);
      }
    }
  };

  rodar([...opcoes.keys()], 0, curta);
  const finalistas = [...opcoes.keys()].sort((a, b) => media(rodadas[b], 'chance') - media(rodadas[a], 'chance')).slice(0, 3);
  if (!finalistas.includes(escolhida)) finalistas.push(escolhida);
  total = curta * opcoes.length + (simulacoes - curta) * finalistas.length; // a barra chega a 100%
  rodar(finalistas, curta, simulacoes);

  // Finalistas: números da etapa longa. As outras: só da etapa curta (menos certos).
  const usadas = i => (finalistas.includes(i) && rodadas[i].length > curta ? rodadas[i].slice(curta) : rodadas[i]);
  const resumo = opcoes.map((opcao, i) => ({
    rotulo: opcao.rotulo,
    simulacoes: usadas(i).length,
    finalista: finalistas.includes(i),
    chance: media(usadas(i), 'chance'),
    pontosEsperados: media(usadas(i), 'somou'),
    chanceDeBater: media(usadas(i), 'bateu'),
  }));
  const melhor = finalistas.reduce((a, b) => (resumo[b].chance > resumo[a].chance ? b : a));

  // Diferença entre a melhor e a escolhida, simulação a simulação (mesmos sorteios), e a
  // margem de erro dessa diferença. Como a melhor foi escolhida entre várias finalistas,
  // a margem é mais larga (correção de Bonferroni: 2,4 em vez de 1,96 com 3 comparações).
  const a = usadas(melhor);
  const b = usadas(escolhida);
  const n = Math.min(a.length, b.length);
  const diferencas = Array.from({ length: n }, (_, k) => a.at(k).chance - b.at(k).chance);
  const custo = diferencas.reduce((s, x) => s + x, 0) / n;
  const variancia = diferencas.reduce((s, x) => s + (x - custo) ** 2, 0) / Math.max(n - 1, 1);
  const z = finalistas.length > 2 ? 2.4 : 1.96;
  const margem = z * Math.sqrt(variancia / n);

  let selo;
  if (custo <= LIMITE_BOA) selo = 'boa';
  else if (custo <= margem) selo = 'empate técnico'; // diferença dentro da margem: não dá para dizer
  else if (custo <= LIMITE_OK) selo = 'ok';
  else selo = 'dava melhor';

  return { opcoes: resumo, escolhida, melhor, custo, margem, selo, estatisticas: estatisticasDaMao(decisao.foto, decisao.id) };
}

// ---------- Estatísticas da mão ----------

const nomeDaCarta = (valor, naipe) => textoDaCarta({ valor, naipe });

// Quantas cópias de uma carta (valor + naipe) a pessoa ainda não viu.
function copiasEscondidas(conhecidas, valor, naipe) {
  return 2 - conhecidas.filter(c => c.valor === valor && c.naipe === naipe).length;
}

export function estatisticasDaMao(partida, id) {
  const eu = partida.jogadores[id];
  const vistos = idsVistos(partida, id);
  const certas = cartasCertas(partida, id, vistos);
  const conhecidas = [
    ...eu.mao, ...partida.lixo, ...partida.mesa.flatMap(j => j.cartas), partida.virada, ...Object.values(certas).flat(),
  ].filter(Boolean);
  const naoVistas = 104 - conhecidas.length;

  const curingasEscondidos = partida.curinga
    ? ['♠', '♥', '♦', '♣'].filter(n => ehCuringa(partida.curinga, { valor: partida.curinga.valor, naipe: n }))
      .reduce((s, n) => s + copiasEscondidas(conhecidas, partida.curinga.valor, n), 0)
    : 0;

  // Quase-jogos: pares que ficam a 1 carta de virar trinca ou sequência.
  const emJogo = new Set(encontrarJogos(eu.mao, partida.curinga).flat().map(c => c.id));
  const soltas = eu.mao.filter(c => !emJogo.has(c.id) && !ehCuringa(partida.curinga, c));
  const quaseJogos = [];
  const completam = new Map(); // carta que completa algum quase-jogo → cópias escondidas
  for (let i = 0; i < soltas.length; i++) {
    for (let k = i + 1; k < soltas.length; k++) {
      const a = soltas.at(i);
      const b = soltas.at(k);
      let precisa = [];
      let temBuraco = false;
      if (a.valor === b.valor && a.naipe !== b.naipe) {
        precisa = ['♠', '♥', '♦', '♣'].filter(n => n !== a.naipe && n !== b.naipe).map(n => [a.valor, n]);
      } else if (a.naipe === b.naipe) {
        // O Ás pode ser 1 ou 14: testa as duas posições (A-2 pede o 3; K-A pede o Q).
        for (const pa of posicoesDe(a)) {
          for (const pb of posicoesDe(b)) {
            const [baixo, alto] = [pa, pb].sort((x, y) => x - y);
            if (alto - baixo === 1) precisa.push(...[baixo - 1, alto + 1].filter(p => p >= 1 && p <= 14).map(p => [valorNaPosicao(p), a.naipe]));
            if (alto - baixo === 2) {
              precisa.push([valorNaPosicao(baixo + 1), a.naipe]);
              temBuraco = true;
            }
          }
        }
        precisa = precisa.filter(([v, n], i) => precisa.findIndex(([v2, n2]) => v2 === v && n2 === n) === i);
      }
      if (!precisa.length) continue;
      const faltam = precisa.map(([valor, naipe]) => ({ carta: nomeDaCarta(valor, naipe), escondidas: copiasEscondidas(conhecidas, valor, naipe) }));
      const buraco = a.naipe === b.naipe && faltam.length === 1 && temBuraco;
      const emOrdem = [a, b].sort((x, y) => Math.min(...posicoesDe(x)) - Math.min(...posicoesDe(y)) || x.naipe.localeCompare(y.naipe));
      quaseJogos.push({
        cartas: emOrdem.map(textoDaCarta), faltam, curingaServe: buraco,
        outs: faltam.reduce((s, f) => s + f.escondidas, 0) + (buraco ? curingasEscondidos : 0),
      });
      for (const f of faltam) completam.set(f.carta, f.escondidas);
    }
  }
  // Cartas escondidas que melhoram a mão (cada carta conta uma vez, mesmo servindo a dois
  // quase-jogos). O curinga tapa buraco no meio sem precisar bater: conta se houver buraco.
  const outs = [...completam.values()].reduce((s, x) => s + x, 0) +
    (quaseJogos.some(q => q.curingaServe) ? curingasEscondidos : 0);

  const perigo = jogadoresAtivos(partida)
    .filter(j => j.id !== id && j.mao.length <= 3)
    .map(j => ({ nome: j.nome, cartas: j.mao.length, pegouDoLixo: certas[j.id].map(textoDaCarta) }));

  return {
    naoVistas,
    quaseJogos,
    outs,
    chanceNaProximaCompra: naoVistas ? outs / naoVistas : 0,
    curingasEscondidos,
    perigo,
  };
}
