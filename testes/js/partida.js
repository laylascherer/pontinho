// O andamento de uma partida de Pontinho: rodadas, vez de cada um, pontos e fim do jogo.
// Cada ação confere as regras e, se algo estiver errado, lança um ErroDeJogada
// com uma mensagem pronta para mostrar na tela.

import { criarBaralho, embaralhar, pontosNaMao, curingaDaVirada } from './cartas.js';
import { analisarJogo, analisarEncaixe, inicioDe, naipeDe, valorNaPosicao, queimaNaMesa } from './jogos.js';

export class ErroDeJogada extends Error {}

export const CONFIG_PADRAO = {
  cartasIniciais: 9,
  limite: 100,   // quem chega a esse total estoura
  maxVoltas: 1,  // quantas vezes cada um pode voltar depois de estourar
  castigoDoCuringa: 30, // quem colocou o curinga leva isso quando alguém bate trocando a carta verdadeira nele
};

// Fases da partida:
//   comprar      → o jogador da vez precisa comprar (monte ou lixo)
//   jogar        → pode baixar, encaixar e precisa descartar
//   batendo      → alguém está numa jogada que só vale se terminar em batida
//                  (pifado fora da vez, curinga na ponta ou troca de curinga)
//   decidirVolta → quem estourou escolhe se volta ou não
//   fimDaRodada  → placar da rodada na tela, esperando a próxima
//   fimDoJogo    → sobrou só um: o vencedor

// jogadores: nomes (jogo local) ou { nome, uid, tipo: 'pessoa' | 'robo', cor } (jogo em rede).
export function novaPartida(jogadores, opcoes = {}, sorteio = Math.random) {
  const nomes = jogadores.map(j => (typeof j === 'string' ? { nome: j } : j));
  if (nomes.length < 2 || nomes.length > 4) {
    throw new ErroDeJogada('A mesa precisa ter de 2 a 4 jogadores.');
  }
  const partida = {
    config: { ...CONFIG_PADRAO, ...opcoes },
    // situacao: jogando | estourou | fora
    // queimado: descartou uma carta que encaixava na mesa; não pega do lixo até o fim da rodada
    // uid: quem é essa pessoa no jogo em rede (null no jogo local); tipo: pessoa | robo
    jogadores: nomes.map(({ nome, uid = null, tipo = 'pessoa', cor = null }, i) => ({
      id: i, nome, uid, tipo, cor, mao: [], pontos: 0, voltas: 0, situacao: 'jogando', queimado: false,
    })),
    monte: [],
    lixo: [],
    mesa: [],
    proximoJogoId: 1,
    rodada: 0,
    quemComeca: -1,
    vez: null,
    fase: 'comprar',
    cartaDoLixo: null,     // id da carta tirada do lixo, que precisa ir para a mesa nesta vez
    jogouNestaVez: false,
    ultimaRodada: null,    // resumo: quem bateu (null = monte acabou) e quanto cada um somou
    vencedor: null,
    tentativa: null,       // quem está tentando bater + a "foto" do jogo antes disso
    virada: null,          // carta virada embaixo do monte (só mostra, nunca é comprada)
    curinga: null,         // { valor, cor } do curinga da rodada
    pegasDoLixo: {},       // id do jogador → cartas que ele pegou do lixo nesta rodada (todos veem)
    // Jogo em rede:
    versao: 0,             // sobe a cada jogada; impede duas jogadas de se atropelarem
    eventos: [],           // as últimas jogadas, para os outros celulares animarem
    prontos: [],           // quem já tocou em "Pronto" para a próxima rodada
    inicioDaVez: null,     // quando a vez atual começou (ms), para o robô assumir quem sumiu
  };
  iniciarRodada(partida, sorteio);
  return partida;
}

export function jogadoresAtivos(partida) {
  return partida.jogadores.filter(j => j.situacao === 'jogando');
}

function proximoAtivo(partida, id) {
  const total = partida.jogadores.length;
  for (let passo = 1; passo <= total; passo++) {
    const j = partida.jogadores[(id + passo + total) % total];
    if (j.situacao === 'jogando') return j.id;
  }
  return null;
}

function iniciarRodada(partida, sorteio) {
  const { cartasIniciais } = partida.config;
  partida.monte = embaralhar(criarBaralho(), sorteio);
  // A carta de baixo do monte é virada: ela define o curinga e sai do jogo.
  partida.virada = partida.monte.shift();
  partida.curinga = curingaDaVirada(partida.virada);
  partida.mesa = [];
  for (const j of jogadoresAtivos(partida)) {
    j.mao = partida.monte.splice(0, cartasIniciais);
    j.queimado = false;
  }
  partida.lixo = [partida.monte.pop()];
  partida.pegasDoLixo = {};
  partida.rodada++;
  partida.quemComeca = proximoAtivo(partida, partida.quemComeca);
  partida.ultimaRodada = null;
  comecarVez(partida, partida.quemComeca);
}

function comecarVez(partida, id) {
  partida.vez = id;
  partida.inicioDaVez = Date.now();
  partida.fase = 'comprar';
  partida.cartaDoLixo = null;
  partida.jogouNestaVez = false;
}

// As regras da rodada para analisar jogos. podePonta: curinga na ponta (só para bater).
const regras = (partida, podePonta = false) => ({ curinga: partida.curinga, podePonta });

function conferirVez(partida, id, fase) {
  // Quem está batendo fora da vez joga como se fosse a fase de jogar.
  const faseAtual = partida.fase === 'batendo' ? 'jogar' : partida.fase;
  if (faseAtual !== fase && (fase === 'comprar' || fase === 'jogar') && partida.vez === id) {
    throw new ErroDeJogada(fase === 'comprar' ? 'Você já comprou nesta vez.' : 'Primeiro compre uma carta (do monte ou do lixo).');
  }
  if (partida.vez !== id || faseAtual !== fase) throw new ErroDeJogada('Não é a sua vez.');
  return partida.jogadores[id];
}

// Separa as cartas da mão pelos ids, conferindo se são mesmo do jogador.
function cartasDaMao(jogador, ids) {
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new ErroDeJogada('Escolha as cartas, sem repetir.');
  }
  return ids.map(cid => {
    const carta = jogador.mao.find(c => c.id === cid);
    if (!carta) throw new ErroDeJogada('Essa carta não está na sua mão.');
    return carta;
  });
}

function tirarDaMao(jogador, ids) {
  jogador.mao = jogador.mao.filter(c => !ids.includes(c.id));
}

// ---------- Comprar ----------

export function comprarDoMonte(partida, id) {
  const jogador = conferirVez(partida, id, 'comprar');
  if (partida.monte.length === 0) throw new ErroDeJogada('O monte acabou.');
  const carta = partida.monte.pop();
  jogador.mao.push(carta);
  partida.fase = 'jogar';
  return carta;
}

// A carta do lixo só pode ser pega para usar num jogo nesta mesma vez.
export function comprarDoLixo(partida, id) {
  const jogador = conferirVez(partida, id, 'comprar');
  if (jogador.queimado) throw new ErroDeJogada('Você se queimou: até o fim da rodada, só pode comprar do monte.');
  if (partida.lixo.length === 0) throw new ErroDeJogada('O lixo está vazio.');
  const carta = partida.lixo.pop();
  jogador.mao.push(carta);
  (partida.pegasDoLixo[id] ??= []).push(carta);
  partida.cartaDoLixo = carta.id;
  partida.fase = 'jogar';
  return carta;
}

// Arrependeu-se de pegar do lixo: devolve a carta e volta a escolher de onde comprar.
export function devolverAoLixo(partida, id) {
  const jogador = conferirVez(partida, id, 'jogar');
  if (partida.fase === 'batendo') throw new ErroDeJogada('Para desistir, toque em "Não consigo bater".');
  if (!partida.cartaDoLixo || partida.jogouNestaVez) {
    throw new ErroDeJogada('Só dá para devolver a carta do lixo antes de baixar qualquer jogo.');
  }
  const carta = cartasDaMao(jogador, [partida.cartaDoLixo])[0];
  tirarDaMao(jogador, [carta.id]);
  partida.lixo.push(carta);
  partida.cartaDoLixo = null;
  partida.fase = 'comprar';
}

// ---------- Jogar ----------

export function baixarJogo(partida, id, idsDasCartas) {
  const jogador = conferirVez(partida, id, 'jogar');
  const cartas = cartasDaMao(jogador, idsDasCartas);
  let jogo = analisarJogo(cartas, regras(partida));
  if (!jogo) {
    // Só fecha com curinga na ponta: vale, mas agora a pessoa precisa bater.
    jogo = analisarJogo(cartas, regras(partida, true));
    if (!jogo) throw new ErroDeJogada('Essas cartas não formam uma sequência nem uma trinca.');
    entrarEmBatida(partida, id);
  }
  tirarDaMao(jogador, idsDasCartas);
  const curingas = Object.fromEntries((jogo.curingas ?? []).map(cid => [cid, id]));
  const naMesa = { id: partida.proximoJogoId++, dono: id, ...jogo, curingas };
  partida.mesa.push(naMesa);
  depoisDeJogar(partida, jogador, idsDasCartas);
  return naMesa;
}

// Encaixa cartas num jogo da mesa, de qualquer jogador.
export function encaixar(partida, id, jogoId, idsDasCartas) {
  const jogador = conferirVez(partida, id, 'jogar');
  const jogo = partida.mesa.find(j => j.id === jogoId);
  if (!jogo) throw new ErroDeJogada('Esse jogo não está na mesa.');
  const cartas = cartasDaMao(jogador, idsDasCartas);
  let novo = analisarEncaixe(jogo, cartas, regras(partida));
  if (!novo) {
    novo = analisarEncaixe(jogo, cartas, regras(partida, true));
    if (!novo) throw new ErroDeJogada('Essas cartas não encaixam nesse jogo.');
    entrarEmBatida(partida, id);
  }
  tirarDaMao(jogador, idsDasCartas);
  jogo.cartas = novo.cartas;
  if (novo.inicio !== undefined) jogo.inicio = novo.inicio;
  jogo.curingas ??= {};
  for (const cid of novo.curingas ?? []) jogo.curingas[cid] ??= id;
  depoisDeJogar(partida, jogador, idsDasCartas);
  return jogo;
}

// Troca: coloca a carta verdadeira no lugar de um curinga da mesa e leva o
// curinga para a mão. Só vale para bater; quem tinha colocado o curinga leva castigo.
export function trocarCuringa(partida, id, jogoId, cartaId) {
  const jogador = conferirVez(partida, id, 'jogar');
  const jogo = partida.mesa.find(j => j.id === jogoId);
  if (!jogo || jogo.tipo !== 'sequencia' || !Object.keys(jogo.curingas ?? {}).length) {
    throw new ErroDeJogada('Esse jogo não tem curinga para trocar.');
  }
  const carta = cartasDaMao(jogador, [cartaId])[0];
  const inicio = inicioDe(jogo);
  const lugar = jogo.cartas.findIndex((c, i) =>
    c.id in jogo.curingas && carta.naipe === naipeDe(jogo) && carta.valor === valorNaPosicao(inicio + i));
  if (lugar < 0) throw new ErroDeJogada('Essa carta não é a que o curinga está substituindo.');
  entrarEmBatida(partida, id);
  const curinga = jogo.cartas.at(lugar);
  const quemColocou = jogo.curingas[curinga.id];
  jogo.cartas[lugar] = carta;
  delete jogo.curingas[curinga.id];
  tirarDaMao(jogador, [cartaId]);
  jogador.mao.push(curinga);
  if (quemColocou !== id) partida.tentativa.castigos.push(quemColocou);
  if (cartaId === partida.cartaDoLixo) partida.cartaDoLixo = null;
  partida.jogouNestaVez = true;
  return curinga;
}

function depoisDeJogar(partida, jogador, ids) {
  if (ids.includes(partida.cartaDoLixo)) partida.cartaDoLixo = null;
  partida.jogouNestaVez = true;
  if (jogador.mao.length === 0) encerrarRodada(partida, jogador.id);
}

export function descartar(partida, id, cartaId) {
  const jogador = conferirVez(partida, id, 'jogar');
  if (partida.cartaDoLixo) {
    throw new ErroDeJogada('Você precisa usar num jogo a carta que pegou do lixo.');
  }
  if (partida.fase === 'batendo' && jogador.mao.length !== 1) {
    throw new ErroDeJogada('Para bater, só dá para descartar a última carta.');
  }
  const carta = cartasDaMao(jogador, [cartaId])[0];
  // Descartou uma carta que encaixava em algum jogo da mesa (ou a repetida de uma trinca): se queimou.
  if (queimaNaMesa(partida.mesa, carta, regras(partida))) jogador.queimado = true;
  tirarDaMao(jogador, [cartaId]);
  partida.lixo.push(carta);
  if (jogador.mao.length === 0) encerrarRodada(partida, id);
  // Monte acabou: a rodada termina e todos somam o que têm na mão.
  else if (partida.monte.length === 0) encerrarRodada(partida, null);
  else comecarVez(partida, proximoAtivo(partida, id));
}

// ---------- Pifado: bater fora da vez ----------
// Com 3 ou mais jogadores, quem acha que está a 1 carta de bater pode pegar
// a carta do lixo a qualquer momento. Se não conseguir bater, tudo volta
// como estava, a carta volta para o lixo e a pessoa fica queimada.

export function podeAmeacar(partida, id) {
  const j = partida.jogadores[id];
  return jogadoresAtivos(partida).length >= 3 && j?.situacao === 'jogando' && !j.queimado &&
    partida.vez !== id && (partida.fase === 'comprar' || partida.fase === 'jogar') && partida.lixo.length > 0;
}

export function ameacarBater(partida, id) {
  if (!podeAmeacar(partida, id)) {
    const j = partida.jogadores[id];
    if (j.queimado) throw new ErroDeJogada('Você se queimou: até o fim da rodada, só pode comprar do monte.');
    if (jogadoresAtivos(partida).length < 3) throw new ErroDeJogada('Pegar do lixo fora da vez só vale com 3 ou mais jogadores.');
    throw new ErroDeJogada('Agora não dá para pegar do lixo.');
  }
  tirarFoto(partida, id, 'pifado');
  const carta = partida.lixo.pop();
  partida.jogadores[id].mao.push(carta);
  partida.vez = id;
  partida.fase = 'batendo';
  partida.cartaDoLixo = carta.id;
  partida.jogouNestaVez = false;
  return carta;
}

// A "foto" do jogo, para desfazer tudo se a pessoa não conseguir bater.
// tipo: 'pifado' (fora da vez: quem desiste se queima) | 'curinga' (na própria vez: só desfaz)
function tirarFoto(partida, id, tipo) {
  const { tentativa, ...antes } = partida;
  partida.tentativa = { id, tipo, antes: structuredClone(antes), castigos: [] };
}

// Jogada que só vale para bater (curinga na ponta, troca de curinga).
function entrarEmBatida(partida, id) {
  if (partida.fase === 'batendo') return;
  tirarFoto(partida, id, 'curinga');
  partida.fase = 'batendo';
}

export function desistirDeBater(partida, id) {
  if (partida.fase !== 'batendo' || partida.tentativa?.id !== id) {
    throw new ErroDeJogada('Você não está tentando bater.');
  }
  const { tipo, antes } = partida.tentativa;
  Object.assign(partida, antes, { tentativa: null });
  if (tipo === 'pifado') partida.jogadores[id].queimado = true;
}

// ---------- Fim da rodada e do jogo ----------

function encerrarRodada(partida, quemBateu) {
  const { limite, maxVoltas } = partida.config;
  const ativos = jogadoresAtivos(partida);
  const somou = {};
  const castigos = {};
  for (const j of ativos) somou[j.id] = j.id === quemBateu ? 0 : pontosNaMao(j.mao, partida.curinga);
  // Quem bateu trocando a carta verdadeira pelo curinga de alguém: esse alguém leva castigo.
  if (quemBateu !== null && partida.tentativa?.id === quemBateu) {
    for (const cid of partida.tentativa.castigos) {
      if (!(cid in somou)) continue;
      somou[cid] += partida.config.castigoDoCuringa;
      castigos[cid] = (castigos[cid] ?? 0) + partida.config.castigoDoCuringa;
    }
  }
  for (const j of ativos) j.pontos += somou[j.id];
  partida.ultimaRodada = { quemBateu, somou, castigos };
  partida.tentativa = null;
  partida.vez = null;

  let estouraram = ativos.filter(j => j.pontos >= limite);
  const salvos = ativos.filter(j => j.pontos < limite);
  const todosEstouraram = salvos.length === 0;
  if (todosEstouraram) {
    // Todos estouraram juntos (monte acabou): fica quem tem menos pontos.
    // Se empatar, os empatados jogam mais uma rodada entre si.
    const menor = Math.min(...estouraram.map(j => j.pontos));
    estouraram = estouraram.filter(j => j.pontos !== menor);
  }
  for (const j of estouraram) {
    // Pode voltar se ainda tem 2 ou mais salvos e não gastou as voltas.
    j.situacao = !todosEstouraram && salvos.length >= 2 && j.voltas < maxVoltas ? 'estourou' : 'fora';
  }
  partida.fase = estouraram.some(j => j.situacao === 'estourou') ? 'decidirVolta' : 'fimDaRodada';
  conferirFimDoJogo(partida);
}

// Quem estourou escolhe: volta com os pontos de quem tem mais entre os salvos, ou sai.
export function decidirVolta(partida, id, querVoltar) {
  const jogador = partida.jogadores[id];
  if (partida.fase !== 'decidirVolta' || jogador?.situacao !== 'estourou') {
    throw new ErroDeJogada('Esse jogador não precisa decidir se volta.');
  }
  if (querVoltar) {
    const salvos = jogadoresAtivos(partida);
    jogador.pontos = Math.max(...salvos.map(j => j.pontos));
    jogador.voltas++;
    jogador.situacao = 'voltando';
  } else {
    jogador.situacao = 'fora';
  }
  // Quando todos decidiram, quem voltou entra na próxima rodada.
  if (!partida.jogadores.some(j => j.situacao === 'estourou')) {
    for (const j of partida.jogadores) if (j.situacao === 'voltando') j.situacao = 'jogando';
    partida.fase = 'fimDaRodada';
    conferirFimDoJogo(partida);
  }
}

function conferirFimDoJogo(partida) {
  if (partida.fase !== 'fimDaRodada') return;
  const ativos = jogadoresAtivos(partida);
  if (ativos.length === 1) {
    partida.fase = 'fimDoJogo';
    partida.vencedor = ativos[0].id;
  }
}

export function proximaRodada(partida, sorteio = Math.random) {
  if (partida.fase !== 'fimDaRodada') throw new ErroDeJogada('A rodada ainda não terminou.');
  partida.prontos = [];
  iniciarRodada(partida, sorteio);
}

// ---------- Jogo em rede ----------
// No jogo com amigos, toda jogada passa por aplicarAcao: ela faz a jogada no motor,
// sobe a versão da partida e anota o evento (o que mudou), para os outros celulares
// animarem. A partida inteira é um objeto simples, que vai e volta do servidor.

const MAXIMO_DE_EVENTOS = 40;
const FIM = ['decidirVolta', 'fimDaRodada', 'fimDoJogo'];

export function aplicarAcao(partida, id, acao, sorteio = Math.random) {
  const versao = partida.versao ?? 0;
  const eventos = partida.eventos ?? [];
  const rodada = partida.rodada;
  const faseAntes = partida.fase;
  const deCima = partida.lixo.at(-1);
  let resultado;
  switch (acao.tipo) {
    case 'comprarDoMonte': resultado = comprarDoMonte(partida, id); break;
    case 'comprarDoLixo': resultado = comprarDoLixo(partida, id); break;
    case 'devolverAoLixo': resultado = devolverAoLixo(partida, id); break;
    case 'baixarJogo': resultado = baixarJogo(partida, id, acao.ids); break;
    case 'encaixar': resultado = encaixar(partida, id, acao.jogoId, acao.ids); break;
    case 'trocarCuringa': resultado = trocarCuringa(partida, id, acao.jogoId, acao.cartaId); break;
    case 'descartar': resultado = descartar(partida, id, acao.cartaId); break;
    case 'ameacar': resultado = ameacarBater(partida, id); break;
    case 'desistir': resultado = desistirDeBater(partida, id); break;
    case 'decidirVolta': resultado = decidirVolta(partida, id, acao.voltar); break;
    case 'pronto': resultado = marcarPronto(partida, id, sorteio); break;
    default: throw new ErroDeJogada('Jogada desconhecida.');
  }

  // O que os outros precisam saber para animar (nunca a carta que saiu do monte).
  const evento = { n: versao + 1, tipo: acao.tipo, jogador: id };
  if (acao.tipo === 'comprarDoLixo' || acao.tipo === 'ameacar') evento.cartaId = deCima.id;
  if (acao.tipo === 'descartar' || acao.tipo === 'trocarCuringa') evento.cartaId = acao.cartaId;
  if (acao.ids) evento.ids = acao.ids;
  if (acao.tipo === 'baixarJogo' || acao.tipo === 'encaixar') evento.jogoId = resultado.id;
  if (acao.tipo === 'trocarCuringa') Object.assign(evento, { jogoId: acao.jogoId, curingaId: resultado.id });
  if (acao.tipo === 'decidirVolta') evento.voltou = !!acao.voltar;
  if (partida.rodada !== rodada) evento.novaRodada = true;
  if (FIM.includes(partida.fase) && !FIM.includes(faseAntes)) evento.fimDaRodada = true;

  // Desistir de bater volta a "foto" antiga: a versão e os eventos continuam andando para frente.
  partida.versao = versao + 1;
  partida.eventos = [...eventos, evento].slice(-MAXIMO_DE_EVENTOS);
  return resultado;
}

// "Pronto" para a próxima rodada: ela começa quando todas as pessoas que seguem
// na partida estiverem prontas (os robôs estão sempre prontos).
// Devolve quantas pessoas ainda faltam.
export function marcarPronto(partida, id, sorteio = Math.random) {
  if (partida.fase !== 'fimDaRodada') throw new ErroDeJogada('A rodada ainda não terminou.');
  if (!partida.prontos.includes(id)) partida.prontos.push(id);
  const faltam = jogadoresAtivos(partida).filter(j => j.tipo !== 'robo' && !partida.prontos.includes(j.id));
  if (faltam.length === 0) proximaRodada(partida, sorteio);
  return faltam.length;
}

// A vez de alguém passou do tempo (a pessoa sumiu)? Aí um robô joga por ela.
export const TEMPO_DA_VEZ = 60000; // 60 segundos

export function vezVencida(partida, agora = Date.now(), limite = TEMPO_DA_VEZ) {
  return partida.vez !== null && (partida.fase === 'comprar' || partida.fase === 'jogar') &&
    partida.inicioDaVez !== null && agora - partida.inicioDaVez >= limite;
}
