// Robôs do Pontinho. Cada chamada devolve UMA ação, para a tela mostrar
// as jogadas uma de cada vez. O robô só olha o que um jogador de verdade veria:
// a própria mão, a mesa e o lixo.

import { pontosDaCarta, pontosNaMao, ehCuringa } from './cartas.js';
import { encontrarJogos, analisarJogo, analisarEncaixe, posicoesDe, inicioDe, naipeDe, valorNaPosicao } from './jogos.js';
import {
  comprarDoMonte, comprarDoLixo, baixarJogo, encaixar, descartar, ameacarBater, desistirDeBater,
  trocarCuringa, jogadoresAtivos,
} from './partida.js';

export function proximaAcao(partida, id, nivel = 'facil') {
  // No meio de uma jogada de bater (pifado, curinga na ponta, troca), segue o plano até bater.
  if (partida.fase === 'batendo') return planoParaBater(partida, id)?.[0] ?? { tipo: 'desistir' };
  return nivel === 'esperto' ? proximaAcaoEsperta(partida, id) : proximaAcaoFacil(partida, id);
}

// ---------- Nível Fácil ----------
// Baixa tudo o que pode, assim que pode, e descarta a carta mais alta (menos o curinga).

export function proximaAcaoFacil(partida, id) {
  const mao = partida.jogadores[id].mao;
  const { curinga } = partida;

  if (partida.fase === 'comprar') {
    const deCima = partida.lixo.at(-1);
    const serve = deCima && !partida.jogadores[id].queimado && jogadaCom(partida, [...mao, deCima], deCima);
    return serve ? { tipo: 'comprarDoLixo' } : { tipo: 'comprarDoMonte' };
  }

  // Pegou do lixo: primeiro usa essa carta.
  const doLixo = mao.find(c => c.id === partida.cartaDoLixo);
  const jogada = doLixo ? jogadaCom(partida, mao, doLixo) : primeiroJogo(mao, curinga) ?? primeiroEncaixe(partida, mao);
  if (jogada) return jogada;

  const semCuringa = mao.filter(c => !ehCuringa(curinga, c));
  return { tipo: 'descartar', cartaId: maisAlta(semCuringa.length ? semCuringa : mao, curinga).id };
}

// Um jogo (ou encaixe) que use esta carta específica.
export function jogadaCom(partida, mao, carta) {
  // Tira as cópias da carta (do outro baralho), para o jogo usar exatamente esta.
  const semCopias = mao.filter(c => c.id === carta.id || c.valor !== carta.valor || c.naipe !== carta.naipe);
  const jogo = encontrarJogos(semCopias, partida.curinga).find(j => j.some(c => c.id === carta.id));
  if (jogo) return { tipo: 'baixarJogo', ids: jogo.map(c => c.id) };
  const alvo = partida.mesa.find(j => analisarEncaixe(j, [carta], { curinga: partida.curinga }));
  if (alvo) return { tipo: 'encaixar', jogoId: alvo.id, ids: [carta.id] };
  return null;
}

function primeiroJogo(mao, curinga) {
  const jogo = encontrarJogos(mao, curinga)[0];
  return jogo ? { tipo: 'baixarJogo', ids: jogo.map(c => c.id) } : null;
}

function primeiroEncaixe(partida, cartas) {
  for (const carta of cartas) {
    const alvo = partida.mesa.find(j => analisarEncaixe(j, [carta], { curinga: partida.curinga }));
    if (alvo) return { tipo: 'encaixar', jogoId: alvo.id, ids: [carta.id] };
  }
  return null;
}

function maisAlta(cartas, curinga) {
  const pontos = c => pontosDaCarta(c, curinga);
  return cartas.reduce((maior, c) =>
    pontos(c) > pontos(maior) || (pontos(c) === pontos(maior) && c.valor > maior.valor) ? c : maior);
}

// ---------- Nível Esperto ----------
// Guarda os quase-jogos e os curingas, segura os jogos quando a rodada está calma,
// baixa tudo quando há perigo e escolhe o descarte pensando no próximo jogador.

const PONTOS_DEMAIS_NA_MAO = 50; // com mais que isso na mão, baixa mesmo sem perigo

export function proximaAcaoEsperta(partida, id) {
  const jogador = partida.jogadores[id];
  const mao = jogador.mao;
  const { curinga } = partida;

  if (partida.fase === 'comprar') {
    const deCima = partida.lixo.at(-1);
    const serve = deCima && !jogador.queimado && jogadaCom(partida, [...mao, deCima], deCima);
    return serve ? { tipo: 'comprarDoLixo' } : { tipo: 'comprarDoMonte' };
  }

  const doLixo = mao.find(c => c.id === partida.cartaDoLixo);
  if (doLixo) return jogadaCom(partida, mao, doLixo);

  // Dá para colocar tudo na mesa agora (com curinga na ponta ou troca, se precisar)? Então bate.
  const batida = planoParaBater(partida, id);
  if (batida) return batida[0];

  const jogos = encontrarJogos(mao, curinga);
  const emJogo = new Set(jogos.flat().map(c => c.id));
  const livres = mao.filter(c => !emJogo.has(c.id));

  // Encaixar sempre vale: tira pontos da mão e evita se queimar.
  const encaixe = primeiroEncaixe(partida, livres.filter(c => !ehCuringa(curinga, c)));
  if (encaixe) return encaixe;

  // Segura os jogos na mão, a não ser que haja perigo (ou não sobre carta solta para descartar).
  const baixar = haPerigo(partida, id) || pontosNaMao(mao, curinga) >= PONTOS_DEMAIS_NA_MAO || livres.length === 0;
  if (jogos.length && baixar) return { tipo: 'baixarJogo', ids: jogos[0].map(c => c.id) };

  return { tipo: 'descartar', cartaId: melhorDescarte(partida, id, livres.length ? livres : mao).id };
}

// O descarte que o Esperto faria segurando os jogos na mão (usado pelo treinador
// para a opção "segurar").
export function descarteSegurando(partida, id) {
  const mao = partida.jogadores[id].mao;
  const emJogo = new Set(encontrarJogos(mao, partida.curinga).flat().map(c => c.id));
  const livres = mao.filter(c => !emJogo.has(c.id) && c.id !== partida.cartaDoLixo);
  const candidatas = livres.length ? livres : mao.filter(c => c.id !== partida.cartaDoLixo);
  return { tipo: 'descartar', cartaId: melhorDescarte(partida, id, candidatas).id };
}

// Perigo: alguém quase batendo, o monte acabando ou eu mesmo perto do limite.
function haPerigo(partida, id) {
  const eu = partida.jogadores[id];
  const outros = jogadoresAtivos(partida).filter(j => j.id !== id);
  return outros.some(j => j.mao.length <= 3) ||
    partida.monte.length <= 8 ||
    eu.pontos + pontosNaMao(eu.mao, partida.curinga) >= partida.config.limite - 15;
}

const distancia = (a, b) => Math.min(...posicoesDe(a).flatMap(x => posicoesDe(b).map(y => Math.abs(x - y))));

// Quanto a carta ajuda a formar jogos com as outras da mão.
function vizinhas(carta, mao) {
  let total = 0;
  for (const outra of mao) {
    if (outra === carta) continue;
    if (outra.valor === carta.valor && outra.naipe !== carta.naipe) total += 1;
    if (outra.naipe === carta.naipe) {
      const d = distancia(outra, carta);
      if (d === 1) total += 1;
      if (d === 2) total += 0.5;
    }
  }
  return total;
}

// A carta pode interessar a quem pegou esta outra do lixo?
const combina = (pega, carta) =>
  pega.valor === carta.valor || (pega.naipe === carta.naipe && distancia(pega, carta) <= 2);

function proximoJogador(partida, id) {
  const ativos = jogadoresAtivos(partida).map(j => j.id);
  return ativos.find(x => x > id) ?? ativos[0];
}

// Nota de cada carta para o descarte: pontos altos sobem; cartas úteis,
// curingas, cartas que o próximo quer e cartas que queimam descem.
function melhorDescarte(partida, id, candidatas) {
  const { curinga } = partida;
  const mao = partida.jogadores[id].mao;
  const peso = haPerigo(partida, id) ? 2 : 1;
  const queOProximoQuer = partida.pegasDoLixo[proximoJogador(partida, id)] ?? [];
  let melhor = candidatas[0];
  let melhorNota = -Infinity;
  for (const c of candidatas) {
    let nota = pontosDaCarta(c, curinga) * peso - 6 * vizinhas(c, mao);
    if (ehCuringa(curinga, c)) nota -= 100;
    if (queOProximoQuer.some(pega => combina(pega, c))) nota -= 8;
    if (partida.mesa.some(jogo => analisarEncaixe(jogo, [c], { curinga }))) nota -= 1000;
    if (nota > melhorNota) {
      melhor = c;
      melhorNota = nota;
    }
  }
  return melhor;
}

// ---------- Planejar uma batida ----------

// Procura um jeito de colocar TODAS as cartas na mesa (usando a carta do lixo, no pifado).
// Pode sobrar uma para descartar no fim (nunca a do lixo). Na batida, o curinga
// também vai na ponta, e dá para trocar a carta verdadeira pelo curinga da mesa.
// Devolve as ações em ordem, ou null.
export function planoParaBater(partida, id, carta = null) {
  const { curinga } = partida;
  const mao = carta ? [...partida.jogadores[id].mao, carta] : [...partida.jogadores[id].mao];
  // Os curingas por último: as cartas normais escolhem o lugar primeiro.
  mao.sort((a, b) => ehCuringa(curinga, a) - ehCuringa(curinga, b));
  const idDoLixo = carta?.id ?? partida.cartaDoLixo;
  return cobrir(mao, partida.mesa, true, idDoLixo, { curinga, semSaida: new Set() });
}

// Analisa como o motor faz: primeiro sem curinga na ponta, depois com.
const comoOMotor = (curinga, analisar) =>
  analisar({ curinga, podePonta: false }) ?? analisar({ curinga, podePonta: true });

// Tenta usar todas as cartas, decidindo o destino da primeira de cada vez:
// sobrar para o descarte, trocar um curinga da mesa, encaixar ou formar um jogo novo.
function cobrir(cartas, mesa, podeSobrar, idDoLixo, contexto) {
  if (cartas.length === 0) return [];
  const { curinga, semSaida } = contexto;
  const chave = cartas.map(c => c.id).sort().join() + '|' + podeSobrar + '|' +
    mesa.map(j => j.cartas.map(c => c.id).join('.')).join('/');
  if (semSaida.has(chave)) return null;

  const [primeira, ...outras] = cartas;
  const sem = grupo => cartas.filter(c => !grupo.includes(c));

  if (podeSobrar && primeira.id !== idDoLixo) {
    const resto = cobrir(outras, mesa, false, idDoLixo, contexto);
    if (resto) return [...resto, { tipo: 'descartar', cartaId: primeira.id }];
  }

  // Troca: a carta verdadeira vai para o lugar do curinga, e o curinga vem para a mão.
  for (const jogo of mesa) {
    if (jogo.tipo !== 'sequencia' || !Object.keys(jogo.curingas ?? {}).length) continue;
    const inicio = inicioDe(jogo);
    const naipe = naipeDe(jogo);
    for (const [lugar, naMesa] of jogo.cartas.entries()) {
      if (!(naMesa.id in jogo.curingas)) continue;
      const verdadeira = cartas.find(c => c.naipe === naipe && c.valor === valorNaPosicao(inicio + lugar));
      if (!verdadeira) continue;
      const novasCartas = jogo.cartas.map((c, i) => (i === lugar ? verdadeira : c));
      const { [naMesa.id]: _, ...curingasQueFicam } = jogo.curingas;
      const mesaDepois = mesa.map(j => (j === jogo ? { ...j, cartas: novasCartas, curingas: curingasQueFicam } : j));
      const resto = cobrir([...sem([verdadeira]), naMesa], mesaDepois, podeSobrar, idDoLixo, contexto);
      if (resto) return [{ tipo: 'trocarCuringa', jogoId: jogo.id, cartaId: verdadeira.id }, ...resto];
    }
  }

  for (const jogo of mesa) {
    for (const grupo of encaixesCom(jogo, primeira, cartas, curinga)) {
      const novo = comoOMotor(curinga, regras => analisarEncaixe(jogo, grupo, regras));
      if (!novo) continue;
      const curingas = { ...jogo.curingas };
      for (const cid of novo.curingas ?? []) curingas[cid] ??= 'eu';
      const mesaDepois = mesa.map(j => (j === jogo ? { ...j, cartas: novo.cartas, inicio: novo.inicio ?? j.inicio, curingas } : j));
      const resto = cobrir(sem(grupo), mesaDepois, podeSobrar, idDoLixo, contexto);
      if (resto) return [{ tipo: 'encaixar', jogoId: jogo.id, ids: grupo.map(c => c.id) }, ...resto];
    }
  }

  for (const grupo of jogosCom(primeira, outras, curinga)) {
    if (!comoOMotor(curinga, regras => analisarJogo(grupo, regras))) continue;
    const resto = cobrir(sem(grupo), mesa, podeSobrar, idDoLixo, contexto);
    if (resto) return [{ tipo: 'baixarJogo', ids: grupo.map(c => c.id) }, ...resto];
  }
  semSaida.add(chave);
  return null;
}

// Uma carta (do mesmo naipe) para cada posição.
function porPosicao(cartas, naipe) {
  const mapa = new Map();
  for (const c of cartas) {
    if (c.naipe !== naipe) continue;
    for (const pos of posicoesDe(c)) if (!mapa.has(pos)) mapa.set(pos, c);
  }
  return mapa;
}

// Grupos de cartas da mão, com a carta escolhida, que vão para uma ponta de um jogo da mesa.
// Buracos no caminho são tapados com curinga.
function encaixesCom(jogo, carta, cartas, curinga) {
  if (jogo.tipo === 'trinca') return [[carta]];
  const grupos = [];
  if (ehCuringa(curinga, carta)) grupos.push([carta]); // curinga sozinho na ponta (batida)
  const naipe = naipeDe(jogo);
  if (carta.naipe !== naipe) return grupos;
  const inicio = inicioDe(jogo);
  const fim = inicio + jogo.cartas.length - 1;
  const mapa = porPosicao(cartas.filter(c => !ehCuringa(curinga, c) || c === carta), naipe);
  const curingas = cartas.filter(c => c !== carta && ehCuringa(curinga, c));
  for (const pos of posicoesDe(carta)) {
    // Caminha da carta até encostar na ponta do jogo, pegando as cartas do meio.
    const passo = pos < inicio ? 1 : pos > fim ? -1 : 0;
    if (!passo) continue;
    const ponta = passo === 1 ? inicio : fim;
    const grupo = [];
    const sobra = [...curingas];
    let p = pos;
    while (p !== ponta) {
      const c = p === pos ? carta : mapa.get(p) ?? sobra.shift();
      if (!c || grupo.includes(c)) break;
      grupo.push(c);
      p += passo;
    }
    if (p === ponta) grupos.push(grupo);
  }
  return grupos;
}

// Jogos novos possíveis com a carta escolhida e outras da mão.
function jogosCom(carta, outras, curinga) {
  const grupos = [];
  // Trincas: mais 2 cartas do mesmo número, de naipes diferentes.
  const mesmas = outras.filter(c => c.valor === carta.valor && c.naipe !== carta.naipe);
  for (let i = 0; i < mesmas.length; i++) {
    for (let k = i + 1; k < mesmas.length; k++) {
      if (mesmas.at(i).naipe !== mesmas.at(k).naipe) grupos.push([carta, mesmas.at(i), mesmas.at(k)]);
    }
  }
  // Sequências: trechos do naipe da carta; o que faltar é tapado com curinga.
  const curingas = outras.filter(c => ehCuringa(curinga, c));
  const mapa = porPosicao(outras.filter(c => !curingas.includes(c)), carta.naipe);
  const alcance = outras.length;
  for (const pos of posicoesDe(carta)) {
    for (let a = Math.max(1, pos - alcance); a <= pos; a++) {
      for (let b = Math.max(pos, a + 2); b <= Math.min(14, pos + alcance); b++) {
        const grupo = [];
        const sobra = [...curingas];
        let ok = true;
        for (let x = a; x <= b && ok; x++) {
          const c = x === pos ? carta : mapa.get(x) ?? sobra.shift();
          if (!c || grupo.includes(c)) ok = false;
          else grupo.push(c);
        }
        if (ok) grupos.push(grupo);
      }
    }
  }
  return grupos;
}

// Faz no motor a ação que o robô escolheu.
export function executarAcao(partida, id, acao) {
  switch (acao.tipo) {
    case 'comprarDoMonte': return comprarDoMonte(partida, id);
    case 'comprarDoLixo': return comprarDoLixo(partida, id);
    case 'baixarJogo': return baixarJogo(partida, id, acao.ids);
    case 'encaixar': return encaixar(partida, id, acao.jogoId, acao.ids);
    case 'trocarCuringa': return trocarCuringa(partida, id, acao.jogoId, acao.cartaId);
    case 'descartar': return descartar(partida, id, acao.cartaId);
    case 'ameacar': return ameacarBater(partida, id);
    case 'desistir': return desistirDeBater(partida, id);
  }
}
