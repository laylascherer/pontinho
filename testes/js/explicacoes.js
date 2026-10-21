// Explicações do treinador: transforma os números da análise em frases.
//
// explicarDecisao(decisao, analise) devolve:
//   { selo, titulo, comparacao: [frases], porque: [frases], mao: [frases], margem: frase }

import { textoDaCarta, pontosDaCarta, ehCuringa } from './cartas.js';
import { encontrarJogos, posicoesDe, queimaNaMesa } from './jogos.js';
import { jogadoresAtivos } from './partida.js';

// ---------- Números em português ----------

const pct = x => `${Math.round(x * 100)}%`;
const decimal = (x, casas = 1) => x.toFixed(casas).replace('.', ',');
const pontosDeChance = x => `${decimal(x * 100)} ${Math.abs(x * 100 - 1) < 0.05 ? 'ponto' : 'pontos'} de chance`;
const lista = itens => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

const ICONES = { boa: '✓', 'empate técnico': '≈', ok: '~', 'dava melhor': '✗' };

// ---------- Explicação completa ----------

export function explicarDecisao(decisao, analise) {
  const { opcoes, escolhida, melhor, custo, margem, selo, estatisticas } = analise;
  const minha = opcoes[escolhida];
  const top = opcoes[melhor];
  const mesma = escolhida === melhor;

  let titulo;
  if (selo === 'boa') titulo = mesma ? 'Boa escolha: era a melhor opção.' : `Boa escolha: ficou a menos de 1 ponto de chance da melhor (${minuscula(top.rotulo)}).`;
  else if (selo === 'empate técnico') titulo = `Empate técnico com ${minuscula(top.rotulo)}: a diferença ficou dentro da margem de erro.`;
  else if (selo === 'ok') titulo = `Ok. ${top.rotulo} era um pouco melhor (+${pontosDeChance(custo)}).`;
  else titulo = `Dava melhor: ${minuscula(top.rotulo)} (+${pontosDeChance(custo)}).`;

  const comparacao = mesma
    ? [
      `Chance de vencer a partida: ${pct(minha.chance)}.`,
      `Pontos esperados nesta rodada: ${decimal(minha.pontosEsperados)}.`,
      `Chance de você bater: ${pct(minha.chanceDeBater)}.`,
    ]
    : [
      `Chance de vencer a partida: ${pct(minha.chance)} com a sua escolha e ${pct(top.chance)} com a melhor.`,
      `Pontos esperados nesta rodada: ${decimal(minha.pontosEsperados)} e ${decimal(top.pontosEsperados)}.`,
      `Chance de você bater: ${pct(minha.chanceDeBater)} e ${pct(top.chanceDeBater)}.`,
    ];

  const porque = mesma ? motivosDaMelhor(decisao, analise) : motivos(decisao, analise);

  return {
    selo,
    icone: ICONES[selo],
    titulo,
    comparacao,
    porque,
    mao: frasesDaMao(estatisticas),
    // Escolheu a melhor: não há diferença para medir, então a margem não aparece.
    margem: mesma ? null : `Margem de erro: ±${pontosDeChance(margem)} (${top.simulacoes} simulações por opção).`,
  };
}

const minuscula = texto => texto.charAt(0).toLowerCase() + texto.slice(1);

// ---------- Por quê ----------

function motivos(decisao, analise) {
  if (decisao.tipo === 'descarte') return motivosDoDescarte(decisao, analise);
  if (decisao.tipo === 'compra') return motivosDaCompra(decisao, analise);
  return motivosDoBaixar(decisao, analise);
}

// Quando a escolha já foi a melhor: diz o que a tornava boa.
function motivosDaMelhor(decisao, analise) {
  if (decisao.tipo === 'descarte') {
    const carta = cartaDaOpcao(decisao, analise.melhor);
    return carta ? [descreverCarta(decisao, carta, 'descartada').at(0) ?? `O ${textoDaCarta(carta)} era a carta que menos ajudava a sua mão.`] : [];
  }
  // Compra e baixar: mostra a alternativa mais próxima, quando havia uma.
  const outras = analise.opcoes.filter((_, i) => i !== analise.melhor);
  if (!outras.length) return [];
  const segunda = outras.reduce((a, b) => (b.chance > a.chance ? b : a));
  return [`A outra opção (${minuscula(segunda.rotulo)}) dava ${pct(segunda.chance)} de chance de vencer.`];
}

const cartaDaOpcao = (decisao, i) => {
  const id = decisao.opcoes[i]?.acao?.cartaId;
  return decisao.foto.jogadores[decisao.id].mao.find(c => c.id === id);
};

// O que se pode dizer de uma carta da mão: jogo pronto, par, solta, pontos, perigo.
function descreverCarta(decisao, carta, papel) {
  const p = decisao.foto;
  const mao = p.jogadores[decisao.id].mao;
  const nome = textoDaCarta(carta);
  const frases = [];
  const jogo = encontrarJogos(mao, p.curinga).find(j => j.some(c => c.id === carta.id));
  const parceiras = mao.filter(o => o !== carta && combinam(o, carta));
  if (ehCuringa(p.curinga, carta)) frases.push(`O ${nome} é curinga nesta rodada: tapa qualquer buraco no meio de uma sequência.`);
  else if (jogo) frases.push(`O ${nome} fazia parte de um jogo pronto (${jogo.map(textoDaCarta).join(' ')}).`);
  else if (parceiras.length) frases.push(`O ${nome} formava quase-jogo com ${lista(parceiras.map(textoDaCarta))}.`);
  else if (papel === 'descartada') frases.push(`O ${nome} não combinava com nada na sua mão.`);
  if (queimaNaMesa(p.mesa, carta, { curinga: p.curinga })) {
    frases.push(`O ${nome} encaixava num jogo da mesa (ou repetia uma carta de trinca): descartar essa carta queima.`);
  }
  return frases;
}

// Duas cartas que podem virar jogo juntas: mesmo número (naipes diferentes) ou mesmo naipe a até 2 de distância.
function combinam(a, b) {
  if (a.valor === b.valor) return a.naipe !== b.naipe;
  if (a.naipe !== b.naipe) return false;
  return posicoesDe(a).some(x => posicoesDe(b).some(y => Math.abs(x - y) <= 2));
}

function proximoJogador(partida, id) {
  const ativos = jogadoresAtivos(partida);
  const i = ativos.findIndex(j => j.id === id);
  return ativos.at((i + 1) % ativos.length);
}

function motivosDoDescarte(decisao, analise) {
  const p = decisao.foto;
  const minha = cartaDaOpcao(decisao, analise.escolhida);
  const melhor = cartaDaOpcao(decisao, analise.melhor);
  if (!minha || !melhor) return [];
  const frases = [...descreverCarta(decisao, minha, 'guardada').slice(0, 2)];
  const sobreMelhor = descreverCarta(decisao, melhor, 'descartada');
  if (sobreMelhor.length) frases.push(sobreMelhor[0]);

  const [pm, pb] = [pontosDaCarta(minha, p.curinga), pontosDaCarta(melhor, p.curinga)];
  if (pb > pm) frases.push(`Além disso, o ${textoDaCarta(melhor)} vale ${pb} pontos e o ${textoDaCarta(minha)}, ${pm}: tirar a mais alta da mão diminui o risco se alguém bater.`);

  // O próximo jogador pegou do lixo algo que combina com a carta descartada?
  const proximo = proximoJogador(p, decisao.id);
  const pegas = proximo && proximo.id !== decisao.id ? (p.pegasDoLixo?.[proximo.id] ?? []) : [];
  const ajuda = pegas.find(c => combinam(c, minha));
  if (ajuda) frases.push(`Cuidado: ${proximo.nome} joga logo depois e pegou o ${textoDaCarta(ajuda)} do lixo. O ${textoDaCarta(minha)} pode ajudar.`);
  return frases;
}

function motivosDaCompra(decisao, analise) {
  const p = decisao.foto;
  const deCima = p.lixo.at(-1);
  const minha = decisao.opcoes[analise.escolhida].acao.tipo;
  const op = analise.opcoes;
  const frases = [];
  if (decisao.opcoes[analise.melhor].acao.tipo === 'comprarDoLixo') {
    frases.push(`O ${textoDaCarta(deCima)} do lixo formava jogo na hora, e isso tirava pontos da sua mão.`);
  } else if (minha === 'comprarDoLixo') {
    frases.push(`Pegar o ${textoDaCarta(deCima)} obrigou você a baixar na hora, mostrando o jogo e dando lugar para os outros encaixarem.`);
  }
  const perigo = analise.estatisticas.perigo;
  if (perigo.length) frases.push(`${lista(perigo.map(j => `${j.nome} estava com ${j.cartas} ${j.cartas === 1 ? 'carta' : 'cartas'}`))}: a rodada podia acabar logo.`);
  const [a, b] = [op[analise.escolhida], op[analise.melhor]];
  if (b.chanceDeBater - a.chanceDeBater >= 0.02) frases.push(`A melhor opção aumentava a sua chance de bater de ${pct(a.chanceDeBater)} para ${pct(b.chanceDeBater)}.`);
  return frases;
}

function motivosDoBaixar(decisao, analise) {
  const p = decisao.foto;
  const minhaOpcao = decisao.opcoes[analise.escolhida];
  const melhorOpcao = decisao.opcoes[analise.melhor];
  const perigo = analise.estatisticas.perigo;
  const pontosDoJogo = opcao => (opcao.acao.ids ?? [])
    .map(id => p.jogadores[decisao.id].mao.find(c => c.id === id))
    .filter(Boolean)
    .reduce((s, c) => s + pontosDaCarta(c, p.curinga), 0);
  const frases = [];
  if (!melhorOpcao.segurar && minhaOpcao.segurar) {
    if (perigo.length) {
      frases.push(`${lista(perigo.map(j => `${j.nome} estava com ${j.cartas} ${j.cartas === 1 ? 'carta' : 'cartas'}`))}. Segurar ${pontosDoJogo(melhorOpcao)} pontos de jogo na mão era arriscado.`);
    } else {
      frases.push(`Baixar tirava ${pontosDoJogo(melhorOpcao)} pontos da sua mão sem perder nada importante.`);
    }
  } else if (melhorOpcao.segurar && !minhaOpcao.segurar) {
    const [a, b] = [analise.opcoes[analise.escolhida], analise.opcoes[analise.melhor]];
    frases.push(`Segurar deixava você mais perto de bater de uma vez (chance de bater ${pct(b.chanceDeBater)} contra ${pct(a.chanceDeBater)}) e não dava lugar para os outros encaixarem.`);
  } else {
    frases.push(`${melhorOpcao.rotulo} deixava a sua mão com menos pontos e mais chance de bater.`);
  }
  return frases;
}

// ---------- A sua mão ----------

export function frasesDaMao(e) {
  const frases = [];
  for (const q of e.quaseJogos.slice(0, 3)) {
    const faltam = q.faltam.map(f => `o ${f.carta} (${f.escondidas} ${f.escondidas === 1 ? 'escondido' : 'escondidos'})`);
    if (q.curingaServe && e.curingasEscondidos) faltam.push(`um curinga (${e.curingasEscondidos} ${e.curingasEscondidos === 1 ? 'escondido' : 'escondidos'})`);
    frases.push(`${q.cartas.join(' ')}: falta ${faltam.join(' ou ')}.`);
  }
  if (e.outs > 0) {
    frases.push(`Cartas úteis para você: ${e.outs} de ${e.naoVistas} que você não viu. Chance de tirar uma na próxima compra: ${pct(e.chanceNaProximaCompra)}.`);
  } else if (e.quaseJogos.length === 0) {
    frases.push('Nenhum quase-jogo na mão: as cartas soltas não combinam entre si.');
  }
  for (const j of e.perigo) {
    const pegou = j.pegouDoLixo.length ? `, e pegou ${lista(j.pegouDoLixo)} do lixo` : '';
    frases.push(`Perigo: ${j.nome} está com ${j.cartas} ${j.cartas === 1 ? 'carta' : 'cartas'}${pegou}.`);
  }
  return frases;
}

// ---------- Tipos de erro (para o relatório da partida) ----------
// Agrupa as escolhas que dava para melhorar ("ok" e "dava melhor") em tipos que se repetem.

export const TIPOS_DE_ERRO = {
  segurouComPerigo: 'Você segurou jogos na mão quando alguém estava com 3 cartas ou menos.',
  segurouSemPerigo: 'Você segurou jogos que valia a pena baixar.',
  baixouCedo: 'Você baixou jogos cedo, quando valia segurar.',
  descartouUtil: 'Você descartou carta de jogo ou de quase-jogo e guardou carta solta.',
  guardouAlta: 'Você guardou carta solta mais alta e descartou uma mais baixa.',
  pegouLixo: 'Você pegou do lixo quando valia comprar do monte.',
  deixouLixo: 'Você deixou no lixo uma carta que fechava jogo.',
  outro: 'Outras escolhas que dava para melhorar.',
};

export function tipoDoErro(decisao, analise) {
  if (analise.selo !== 'ok' && analise.selo !== 'dava melhor') return null;
  const minha = decisao.opcoes[analise.escolhida];
  const melhor = decisao.opcoes[analise.melhor];
  if (decisao.tipo === 'baixar') {
    if (minha.segurar && !melhor.segurar) return analise.estatisticas.perigo.length ? 'segurouComPerigo' : 'segurouSemPerigo';
    if (!minha.segurar && melhor.segurar) return 'baixouCedo';
    return 'outro';
  }
  if (decisao.tipo === 'compra') {
    if (minha.acao.tipo === 'comprarDoLixo') return 'pegouLixo';
    if (melhor.acao.tipo === 'comprarDoLixo') return 'deixouLixo';
    return 'outro';
  }
  const descartada = cartaDaOpcao(decisao, analise.escolhida);
  const indicada = cartaDaOpcao(decisao, analise.melhor);
  if (!descartada || !indicada) return 'outro';
  const mao = decisao.foto.jogadores[decisao.id].mao;
  const util = c => encontrarJogos(mao, decisao.foto.curinga).some(j => j.includes(c)) || mao.some(o => o !== c && combinam(o, c));
  if (util(descartada) && !util(indicada)) return 'descartouUtil';
  const curinga = decisao.foto.curinga;
  if (pontosDaCarta(indicada, curinga) > pontosDaCarta(descartada, curinga)) return 'guardouAlta';
  return 'outro';
}

// Os tipos de erro de uma partida, do mais repetido para o menos.
export function errosQueMaisSeRepetem(escolhas) {
  const contagem = {};
  for (const { decisao, analise } of escolhas) {
    const tipo = analise && tipoDoErro(decisao, analise);
    if (tipo) contagem[tipo] = (contagem[tipo] ?? 0) + 1;
  }
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1] || (a[0] === 'outro') - (b[0] === 'outro'))
    .map(([tipo, vezes]) => ({ tipo, vezes, texto: TIPOS_DE_ERRO[tipo] }));
}
